// server.js (na pasta backend)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
// Futuramente, aqui viria a conexão com o banco de dados

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors()); // Habilita o CORS para o frontend poder acessar
app.use(express.json()); // Permite que o servidor entenda JSON

// Configuração do Cliente S3
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

// --- ROTAS DA API ---

// Rota de exemplo para listar produtos (simulado)
app.get('/api/products', (req, res) => {
    const products = [
        { id: 1, name: 'Produto A', price: 19.99 },
        { id: 2, name: 'Produto B', price: 29.99 },
    ];
    res.json(products);
});

// Rota principal: Finalizar a compra
app.post('/api/checkout', async (req, res) => {
    const { customerName, items, total } = req.body;

    if (!customerName || !items || !total) {
        return res.status(400).json({ error: 'Dados da compra incompletos.' });
    }

    // 1. (LÓGICA DO BANCO DE DADOS IRIA AQUI)
    // - Você salvaria o pedido no seu banco de dados MySQL com Sequelize.
    console.log('Pedido salvo no banco de dados (simulado).');

    // 2. Gerar o recibo
    const orderId = `order-${Date.now()}`;
    const receiptContent = `
        ==================================
        RECIBO DE COMPRA
        ==================================
        ID do Pedido: ${orderId}
        Cliente: ${customerName}
        Total: R$ ${total.toFixed(2)}
        ----------------------------------
        Itens:
        ${items.map(item => `- ${item.name} (R$ ${item.price.toFixed(2)})`).join('\n')}
        ==================================
    `;
    const receiptFileName = `recibos/${orderId}.txt`;

    // 3. Enviar o recibo para o S3
    try {
        const command = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: receiptFileName,
            Body: receiptContent,
            ContentType: 'text/plain'
        });

        await s3Client.send(command);
        console.log(`Recibo ${receiptFileName} enviado com sucesso para o S3!`);

        // 4. Retornar sucesso para o frontend
        res.status(201).json({ 
            message: 'Compra finalizada com sucesso! O recibo será enviado por e-mail.',
            orderId: orderId 
        });

    } catch (error) {
        console.error("Erro ao enviar para o S3:", error);
        res.status(500).json({ error: 'Falha ao processar o pedido.' });
    }
});


app.listen(PORT, () => {
    console.log(`Servidor backend rodando na porta ${PORT}`);
});