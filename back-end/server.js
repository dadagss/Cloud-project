require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Sequelize, DataTypes } = require('sequelize');

// ===================================================================
// CONFIGURAÇÃO DO BANCO DE DADOS COM SEQUELIZE
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
// DEFINIÇÃO DOS MODELOS (MAPEAMENTO DAS TABELAS)
// ===================================================================
const Product = sequelize.define('Product', {
    product_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    stock_quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, { timestamps: false, tableName: 'products' });

const Customer = sequelize.define('Customer', {
    customer_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true }
}, { timestamps: false, tableName: 'customers' });

const Order = sequelize.define('Order', {
    order_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    customer_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false }
}, { timestamps: false, tableName: 'orders' });

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
// INICIALIZAÇÃO DO EXPRESS E MIDDLEWARES
// ===================================================================
const app = express();
const PORT = process.env.PORT || 3001;

// ===================================================================
// CÓDIGO MODIFICADO ABAIXO
// ===================================================================
const corsOptions = {
    // CORRIGIDO: Permite requisições do IP do seu front-end
    origin: 'http://75.101.220.88', 
    optionsSuccessStatus: 200
};
// ===================================================================

app.use(cors(corsOptions));
app.use(express.json());

const s3Client = new S3Client({ region: process.env.AWS_REGION });

// ===================================================================
// ROTAS DA API
// ===================================================================

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.findAll();
        res.json(products);
    } catch (error) {
        console.error("Erro ao buscar produtos:", error);
        res.status(500).json({ error: 'Falha ao buscar produtos do banco de dados.' });
    }
});

app.post('/api/checkout', async (req, res) => {
    const { name, email, items, total } = req.body;
    if (!name || !email || !items || items.length === 0 || !total) {
        return res.status(400).json({ error: 'Dados da compra incompletos.' });
    }
    let newOrder;
    try {
        await sequelize.transaction(async (t) => {
            const [customer] = await Customer.findOrCreate({
                where: { email: email },
                defaults: { name: name },
                transaction: t
            });
            newOrder = await Order.create({
                customer_id: customer.customer_id,
                status: 'pendente',
                total_amount: total
            }, { transaction: t });
            for (const item of items) {
                await OrderItem.create({
                    order_id: newOrder.order_id,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_price: item.price
                }, { transaction: t });
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

    const detailsString = items
        .map(item => `${item.quantity}x ${item.name}`)
        .join(', ');

    const receiptObject = {
        email: email,
        order_id: newOrder.order_id.toString(),
        details: detailsString
    };

    const receiptBody = JSON.stringify(receiptObject, null, 2);
    const receiptFileName = `recibos/order-${newOrder.order_id}.json`;

    try {
        const command = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: receiptFileName,
            Body: receiptBody,
            ContentType: 'application/json'
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
        console.log(`Servidor backend rodando na porta ${PORT}`);
    } catch (error) {
        console.error('Não foi possível conectar ao banco de dados:', error);
    }
});
