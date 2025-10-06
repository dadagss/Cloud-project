import React, { useState, useEffect } from 'react';
import './App.css';

// URL da sua API no back-end
const API_URL = 'http://18.206.137.204:3001';

function App() {
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]);
    const [message, setMessage] = useState('');

    // ===================================================================
    // NOVO: Estados para o formulário do cliente
    // ===================================================================
    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    // ===================================================================

    // Busca os produtos da API quando o componente carrega
    useEffect(() => {
        fetch(`${API_URL}/api/products`)
            .then(res => res.json())
            .then(data => setProducts(data))
            .catch(err => console.error("Erro ao buscar produtos:", err));
    }, []);

    const addToCart = (productToAdd) => {
        setCart(prevCart => {
            const existingProduct = prevCart.find(item => item.product_id === productToAdd.product_id);
            if (existingProduct) {
                return prevCart.map(item =>
                    item.product_id === productToAdd.product_id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            } else {
                return [...prevCart, { ...productToAdd, quantity: 1 }];
            }
        });
    };

    const handleCheckout = async () => {
        if (cart.length === 0) {
            setMessage('Seu carrinho está vazio!');
            return;
        }

        // ===================================================================
        // MODIFICADO: Validação e uso dos dados do formulário
        // ===================================================================
        if (!customerName || !customerEmail) {
            setMessage('Por favor, preencha seu nome e e-mail para continuar.');
            return;
        }

        const orderData = {
            name: customerName,   // Usa o estado do formulário
            email: customerEmail, // Usa o estado do formulário
            items: cart,
            total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
        };
        // ===================================================================

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
                // ===================================================================
                // MODIFICADO: Limpar formulário após sucesso
                // ===================================================================
                setCustomerName('');
                setCustomerEmail('');
                // ===================================================================
            } else {
                setMessage(`Erro: ${result.error}`);
            }

        } catch (error) {
            setMessage('Erro de conexão com o servidor.');
            console.error('Erro no checkout:', error);
        }
    };

    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return (
        <div className="App">
            <header className="App-header">
                <h1>E-commerce Básico</h1>
            </header>
            <main className="container">
                <div className="products-list">
                    <h2>Produtos</h2>
                    {products.map(product => (
                        <div key={product.product_id} className="product-item">
                            <span>{product.name} - R$ {Number(product.price).toFixed(2)}</span>
                            <button onClick={() => addToCart(product)}>Adicionar ao Carrinho</button>
                        </div>
                    ))}
                </div>
                <div className="cart">
                    <h2>Carrinho</h2>
                    {cart.length === 0 ? (
                        <p>Vazio</p>
                    ) : (
                        cart.map((item) => (
                            <p key={item.product_id}>
                                {item.quantity}x {item.name}
                            </p>
                        ))
                    )}
                    <h3>Total: R$ {cartTotal.toFixed(2)}</h3>
                    
                    {/* =================================================================== */}
                    {/* NOVO: Seção do formulário no JSX                              */}
                    {/* =================================================================== */}
                    <div className="customer-form">
                        <h3>Seus Dados</h3>
                        <div className="form-group">
                            <label htmlFor="customerName">Nome:</label>
                            <input
                                type="text"
                                id="customerName"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="Seu nome completo"
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="customerEmail">E-mail:</label>
                            <input
                                type="email"
                                id="customerEmail"
                                value={customerEmail}
                                onChange={(e) => setCustomerEmail(e.target.value)}
                                placeholder="seu@email.com"
                            />
                        </div>
                    </div>
                    {/* =================================================================== */}

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
