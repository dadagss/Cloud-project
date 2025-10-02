// server.js (na pasta backend)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Sequelize, DataTypes } = require('sequelize');

// ===================================================================
// PASSO 1: CONFIGURAÇÃO DO BANCO DE DADOS COM SEQUELIZE
// ===================================================================
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql'
    }
);

// ===================================================================
// PASSO 2: DEFINIÇÃO DOS MODELOS (TABELAS)
// ===================================================================
// Corresponde à tabela 'products'
const Product = sequelize.define('Product', {
    product_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    stock_quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { timestamps: false, tableName: 'products' });

// Corresponde à tabela 'customers'
const Customer = sequelize.define('Customer', {
    customer_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true }
}, { timestamps: false, tableName: 'customers' });

// Corresponde à tabela 'orders'
const Order = sequelize.define('Order', {
    order_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    customer_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false }
}, { timestamps: false, tableName: 'orders' });

// Corresponde à tabela 'order_items'
const OrderItem = sequelize.define('OrderItem', {
    order_item_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    order_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    unit_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false }
}, { timestamps: false, tableName: 'order_items' });

// Definindo as associações entre as tabelas
Customer.hasMany(Order, { foreignKey: 'customer_id' });
Order.belongsTo(Customer, { foreignKey: 'customer_id' });
Order.hasMany(OrderItem, { foreignKey: 'order_id' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id' });
Product.hasMany(OrderItem, { foreignKey: 'product_id' });
OrderItem.belongsTo(Product, { foreignKey: 'product_id' });


// ===================================================================
// INICIALIZAÇÃO DO EXPRESS E S3
// ===================================================================
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const s3Client = new S3Client({ region: process.env.AWS_REGION });

// ===================================================================
// PASSO 3: ROTAS DA API ATUALIZADAS
// ===================================================================

// Rota para listar produtos DIRETAMENTE DO BANCO DE DADOS
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.findAll();
        res.json(products);
    } catch (error) {
        console.error("Erro ao buscar produtos:", error);
        res.status(500).json({ error: 'Falha ao buscar produtos do banco de dados.' });
    }
});

// Rota para finalizar a compra, agora com LÓGICA DE BANCO DE DADOS REAL
app.post('/api/checkout', async (req, res) => {
    // O frontend agora deve enviar: { name, email, items (array), total }
    const { name, email, items, total } = req.body;

    if (!name || !email || !items || !total) {
        return res.status(400).json({ error: 'Dados da compra incompletos.' });
    }

    let newOrder;
    try {
        // Usamos uma transação para garantir que todas as operações no banco de dados
        // ou funcionem juntas, ou falhem juntas. Isso evita inconsistências.
        await sequelize.transaction(async (t) => {
            // 1. Encontra ou cria o cliente para não duplicar
            const [customer] = await Customer.findOrCreate({
                where: { email: email },
                defaults: { name: name },
                transaction: t
            });

            // 2. Cria o pedido na tabela 'orders'
            newOrder = await Order.create({
                customer_id: customer.customer_id,
                status: 'pendente',
                total_amount: total
            }, { transaction: t });

            // 3. Cria os itens do pedido na tabela 'order_items'
            for (const item of items) {
                await OrderItem.create({
                    order_id: newOrder.order_id,
                    product_id: item.product_id, // Frontend precisa enviar o ID do produto
                    quantity: item.quantity,       // Frontend precisa enviar a quantidade
                    unit_price: item.price
                }, { transaction: t });

                // (Opcional, mas recomendado) Diminuir a quantidade do estoque
                await Product.decrement('stock_quantity', {
                    by: item.quantity,
                    where: { product_id: item.product_id },
                    transaction: t
                });
            }
        });

    } catch (dbError) {
        console.error("Erro na transação com o banco de dados:", dbError);
        return res.status(500).json({ error: 'Falha ao salvar o pedido no banco de dados.' });
    }

    // 4. Gerar o recibo e enviar para o S3 (lógica existente)
    const receiptContent = `
        RECIBO DE COMPRA - PEDIDO #${newOrder.order_id}
        ==================================
        Cliente: ${name} (${email})
        Total: R$ ${total.toFixed(2)}
        ----------------------------------
        Itens:
        ${items.map(item => `- ${item.name} (Qtd: ${item.quantity}) - R$ ${item.price.toFixed(2)}`).join('\n')}
        ==================================
    `;
    const receiptFileName = `recibos/order-${newOrder.order_id}.txt`;

    try {
        const command = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: receiptFileName,
            Body: receiptContent,
            ContentType: 'text/plain'
        });
        await s3Client.send(command);
        console.log(`Recibo ${receiptFileName} enviado com sucesso para o S3!`);
        
        res.status(201).json({
            message: 'Compra finalizada com sucesso! O recibo será enviado por e-mail.',
            orderId: newOrder.order_id
        });
    } catch (s3Error) {
        console.error("Erro ao enviar para o S3:", s3Error);
        res.status(500).json({ error: 'Pedido salvo, mas falha ao enviar o recibo.' });
    }
});


// ===================================================================
// INICIALIZAÇÃO DO SERVIDOR
// ===================================================================
app.listen(PORT, async () => {
    try {
        await sequelize.authenticate();
        console.log('Conexão com o banco de dados estabelecida com sucesso.');
        // Opcional: sequelize.sync() criaria as tabelas se elas não existissem.
        // Como você já tem o script SQL, não é estritamente necessário.
        // await sequelize.sync({ alter: true }); 
        console.log(`Servidor backend rodando na porta ${PORT}`);
    } catch (error) {
        console.error('Não foi possível conectar ao banco de dados:', error);
    }
});