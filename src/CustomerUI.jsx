import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function CustomerUI({ businessId, businessName }) {
  const [view, setView] = useState('landing'); // landing, menu, status
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [showUpsell, setShowUpsell] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  
  const clientToken = localStorage.getItem('altoque_client_token') || crypto.randomUUID();

  useEffect(() => {
    localStorage.setItem('altoque_client_token', clientToken);
    fetchProducts();
  }, [businessId]);

  useEffect(() => {
    // Realtime Subscription
    if (!currentOrder) return;
    
    const channel = supabase.channel('order_tracker')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'orders',
        filter: `id=eq.${currentOrder.id}` 
      }, (payload) => {
        setCurrentOrder(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel) };
  }, [currentOrder?.id]);

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('business_id', businessId).eq('available', true);
    
    // Fallback Dummy Data if empty DB
    if (!data || data.length === 0) {
      setProducts([
        { id: '1', name: 'Promo 2x1 IPA', price: 6000, category: 'Promos', is_upsell_target: false },
        { id: '2', name: 'Cerveza Patagonia 500ml', price: 4500, category: 'Bebidas', is_upsell_target: true },
        { id: '3', name: 'Fernet con Cola M', price: 5000, category: 'Bebidas', is_upsell_target: true },
        { id: '4', name: 'Hamburguesa Doble Cheddar', price: 9500, category: 'Comida', is_upsell_target: false },
        { id: '5', name: 'Papas Cheddar', price: 5500, category: 'Combos', is_upsell_target: false }
      ]);
    } else {
      setProducts(data);
    }
  };

  const addToCart = (product, qty = 1) => {
    const newItems = Array(qty).fill(product);
    setCart([...cart, ...newItems]);
  };

  const calculateTotal = () => cart.reduce((acc, item) => acc + Number(item.price), 0);

  const requestCheckout = () => {
    const possibleUpsells = products.filter(p => p.is_upsell_target);
    if (possibleUpsells.length > 0 && cart.length > 0) {
      setShowUpsell(true);
    } else {
      processPayment('CASH'); // Saltamos directo si no hay upsell ni metodos
    }
  };

  const processPayment = async (method) => {
    setShowUpsell(false);
    
    // In a real app we INSERT INTO public.orders. 
    // Here we simulate the strict flow logic for the frontend state
    const orderObj = {
      id: crypto.randomUUID(),
      display_number: Math.floor(Math.random() * 90) + 10,
      status: 'PENDING_PAYMENT',
      total: calculateTotal(),
      payment_method: method
    };
    setCurrentOrder(orderObj);
    setView('status');
  };

  // VIEWS ----------------------------------------------------
  if (view === 'landing') {
    return (
      <div className="landing-screen">
        <h1 className="landing-title">🍻 Bienvenido a<br/>{businessName}</h1>
        <p className="landing-subtitle">Pedí al toque. Sin fila. Sin esperar.</p>
        <button className="btn-primary" onClick={() => setView('menu')}>VER MENÚ</button>
      </div>
    );
  }

  if (view === 'status') {
    return (
      <div className="status-container">
        <h2 style={{color: '#fff', fontSize: '20px'}}>✅ Pedido {currentOrder.status === 'PENDING_PAYMENT' ? 'creado' : 'confirmado'}</h2>
        <h1 className="order-number">#{currentOrder.display_number}</h1>
        
        <div className={`status-badge ${currentOrder.status.toLowerCase()}`}>
          {currentOrder.status === 'PENDING_PAYMENT' ? '⚠️ ESPERANDO PAGO' : 
           currentOrder.status === 'PAID' ? '✅ PAGADO' : 
           currentOrder.status === 'IN_PREPARATION' ? '🔥 EN PREPARACIÓN' : 
           currentOrder.status === 'READY' ? '🟢 LISTO PARA RETIRAR' : currentOrder.status}
        </div>
        
        {currentOrder.status === 'PENDING_PAYMENT' && (
           <p style={{color: '#aaa', marginBottom: '40px'}}>Acércate a la caja para abonar y tu pedido pasará a la cocina al toque.</p>
        )}

        <button className="btn-primary" style={{marginTop: 'auto'}} onClick={() => { setCart([]); setView('menu'); }}>
          🍻 Pedir otra ronda
        </button>
      </div>
    );
  }

  // view === 'menu'
  const promos = products.filter(p => p.category === 'Promos');
  const bebidas = products.filter(p => p.category === 'Bebidas');
  const comidas = products.filter(p => p.category === 'Comida');
  
  return (
    <div style={{paddingBottom: '100px'}}>
      <div className="store-header">
        <h2>{businessName}</h2>
      </div>

      <div className="product-list">
        {promos.length > 0 && <><h3 className="section-title">🔥 Promos</h3>
        {promos.map(p => (
           <div key={p.id} className="product-card">
              <div className="product-info">
                 <h4>{p.name}</h4><p className="product-price">${p.price}</p>
              </div>
              <button className="add-btn" onClick={() => addToCart(p)}>+</button>
           </div>
        ))}</>}

        <h3 className="section-title">🍺 Bebidas</h3>
        {bebidas.map(p => (
           <div key={p.id} className="product-card">
              <div className="product-info">
                 <h4>{p.name}</h4><p className="product-price">${p.price}</p>
                 {/* Quick Add logic */}
                 <div style={{marginTop:'8px', display:'flex', gap:'10px'}}>
                    <span style={{fontSize:'12px', color:'#aaa', cursor:'pointer'}} onClick={() => addToCart(p, 2)}>+2 veloz</span>
                    <span style={{fontSize:'12px', color:'#aaa', cursor:'pointer'}} onClick={() => addToCart(p, 3)}>+3 veloz</span>
                 </div>
              </div>
              <button className="add-btn" onClick={() => addToCart(p)}>+</button>
           </div>
        ))}

        <h3 className="section-title">🍔 Comida</h3>
        {comidas.map(p => (
           <div key={p.id} className="product-card">
              <div className="product-info">
                 <h4>{p.name}</h4><p className="product-price">${p.price}</p>
              </div>
              <button className="add-btn" onClick={() => addToCart(p)}>+</button>
           </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="sticky-cart">
          <button className="btn-primary" onClick={requestCheckout}>
            Ver pedido (${calculateTotal()})
          </button>
        </div>
      )}

      {showUpsell && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>🔥 ¡Pará!</h3>
            <p>¿Agregamos otra {products.find(p => p.is_upsell_target)?.name} por ${products.find(p => p.is_upsell_target)?.price}?</p>
            <button className="btn-primary" onClick={() => { addToCart(products.find(p => p.is_upsell_target)); processPayment('QR'); }}>
              ¡De una! Agregar y pagar
            </button>
            <br/>
            <button className="btn-outline" onClick={() => processPayment('QR')}>
              No, ir a pagar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
