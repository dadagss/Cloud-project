// src/App.js (no projeto React)
import React, { useState, useEffect } from 'react';
import './App.css';

// IMPORTANTE: Altere esta URL para o IP público ou domínio da sua EC2 do Backend
const API_URL = 'http://54.208.53.53:3001';

function App() {
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [message, setMessage] = useState('');

    // Busca os produtos da API quando o componente carrega
    useEffect(() => {
        fetch(`${API_URL}/api/products`)
            .then(res => res.json())
            .then(data => setProducts(data))
            .catch(err => console.error("Erro ao buscar produtos:", err));
    }, []);

    const addToCart = (product) => {
        setCart(prevCart => [...prevCart, product]);
    };
a
    const handleCheckout = async () => {
        if (cart.length === 0) {
            setMessage('Seu carrinho está vazio!');
            return;
        }

        const orderData = {
            customerName: 'Cliente Teste', // Você pode pegar isso de um formulário
            items: cart,
            total: cart.reduce((sum, item) => sum + item.price, 0)
        };

        try {
            const response = await fetch(`${API_URL}/api/checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(orderData),
            });

            const result = await response.json();

            if (response.ok) {
                setMessage(result.message);
                setCart([]); // Limpa o carrinho
            } else {
                setMessage(`Erro: ${result.error}`);
            }

        } catch (error) {
            setMessage('Erro de conexão com o servidor.');
            console.error('Erro no checkout:', error);
        }
    };

    const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);

    return (
        <div className="App">
            <header className="App-header">
                <h1>E-commerce Básico</h1>
            </header>
            <main className="container">
                <div className="products-list">
                    <h2>Produtos</h2>
                    {products.map(product => (
                        <div key={product.id} className="product-item">
                            <span>{product.name} - R$ {product.price.toFixed(2)}</span>
                            <button onClick={() => addToCart(product)}>Adicionar ao Carrinho</button>
                        </div>
                    ))}
                </div>
                <div className="cart">
                    <h2>Carrinho</h2>
                    {cart.length === 0 ? (
                        <p>Vazio</p>
                    ) : (
                        cart.map((item, index) => <p key={index}>{item.name}</p>)
                    )}
                    <h3>Total: R$ {cartTotal.toFixed(2)}</h3>
                    <button onClick={handleCheckout} disabled={cart.length === 0}>
                        Finalizar Compra
                    </button>
                    {message && <p className="message">{message}</p>}
                </div>
            </main>
        </div>
    );
}

export default App;