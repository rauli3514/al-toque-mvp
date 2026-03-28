import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function CustomerUI({ businessId }) {
  const [view, setView] = useState('landing');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);

  // Client Token Anti Duplication
  const clientToken = localStorage.getItem("client_token") || crypto.randomUUID();

  useEffect(() => {
    localStorage.setItem("client_token", clientToken);
    loadMenu();
  }, [businessId]);

  useEffect(() => {
    if (!order) return;
    
    // Realtime Status Subscription
    const channel = supabase.channel(`order_updates`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'orders',
        filter: `id=eq.${order.id}` 
      }, (payload) => {
        setOrder(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel) };
  }, [order?.id]);

  const loadMenu = async () => {
    // Bring available products
    const pReq = supabase.from('products').select('*')
      .eq('business_id', businessId)
      .eq('available', true)
      .is('deleted_at', null);

    // Bring categories for ordering
    const cReq = supabase.from('categories').select('*')
      .eq('business_id', businessId)
      .order('sort_order', { ascending: true });

    const [pRes, cRes] = await Promise.all([pReq, cReq]);
    if (cRes.data) setCategories(cRes.data);
    if (pRes.data) setProducts(pRes.data);
  };

  const updateCart = (product, change) => {
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        const newQty = existing.quantity + change;
        if (newQty <= 0) return prev.filter(item => item.product_id !== product.id);
        return prev.map(item => item.product_id === product.id ? { ...item, quantity: newQty } : item);
      }
      if (change > 0) return [...prev, { product_id: product.id, name: product.name, price: Number(product.price), quantity: 1 }];
      return prev;
    });
  };

  const calculateTotal = () => cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const confirmOrder = async () => {
    setLoading(true);
    try {
      // 1. Create order
      const { data: orderData, error: orderErr } = await supabase.from('orders').insert({
        business_id: businessId,
        status: 'CREATED',
        order_type: 'PICKUP',
        customer_notes: `[CLIENT_TOKEN:${clientToken}]`, // Appending token internally 
        payment_method: 'CASH', // Pre default allowed for strict flow
        total: 0 // Will auto sum up via trigger when items are added
      }).select().single();

      if (orderErr || !orderData) throw new Error("No se pudo iniciar el pedido.");

      // 2. Create Items
      const itemsToInsert = cart.map(item => ({
        order_id: orderData.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.price * item.quantity
      }));
      
      const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsErr) throw new Error("Fallo al agregar items.");

      // 3. Confirm to Pending
      const { data: updatedOrder, error: confirmErr } = await supabase.from('orders')
        .update({ status: 'PENDING_PAYMENT_CASH' }) // Direct cash flow to avoid IN_PREPARATION trigger locks when checking PAID
        .eq('id', orderData.id)
        .select().single();

      if (confirmErr || !updatedOrder) throw new Error("Fallo confirmación final.");

      setOrder(updatedOrder);
      setCart([]);
      setView('status');

    } catch (e) {
      alert("Error: " + e.message);
    }
    setLoading(false);
  };

  // --- VIEWS ---
  if (view === 'landing') {
    return (
      <div className="landing-screen">
        <h1 className="landing-title">🍻 Bienvenido al Bar</h1>
        <p className="landing-subtitle">Pedí al toque. Sin fila. Sin esperar.</p>
        <button className="btn-primary" onClick={() => setView('menu')}>VER MENÚ</button>
      </div>
    );
  }

  if (view === 'status' && order) {
    return (
      <div className="status-container">
        <h2 style={{color: 'var(--success)'}}>✅ Pedido confirmado</h2>
        <h1 className="order-number">#{order.display_number}</h1>
        
        <p style={{color:'#aaa', marginBottom:'5px', marginTop:'20px'}}>ESTADO DE TU PEDIDO:</p>
        <div className={`status-badge ${order.status.toLowerCase()}`}>
          {order.status === 'PENDING_PAYMENT_CASH' ? '⚠️ ESPERANDO PAGO' : 
           order.status === 'PAID' ? '✅ RECIBIDO Y PAGADO' : 
           order.status === 'IN_PREPARATION' ? '🔥 EN PREPARACIÓN' : 
           order.status === 'READY' ? '🟢 LISTO PARA RETIRAR' : order.status}
        </div>

        <button className="btn-outline" style={{marginTop:'auto', width:'100%'}} onClick={() => setView('menu')}>🍻 Pedir otra ronda</button>
      </div>
    );
  }

  return (
    <div style={{paddingBottom: '100px'}}>
      <div className="store-header" style={{position:'static'}}>
        <h2>Menú AlToque</h2>
      </div>

      {categories.length === 0 && <p style={{textAlign:'center', color:'#888', marginTop:'50px'}}>⚠️ El menú está vacío. Usa ?view=products para cargar datos.</p>}

      <div className="product-list">
        {categories.map(cat => {
          const prods = products.filter(p => p.category_id === cat.id);
          if (prods.length === 0) return null;
          
          return (
            <div key={cat.id}>
              <h3 className="section-title" style={{color:'var(--primary)'}}>{cat.name}</h3>
              {prods.map(p => {
                const cartItem = cart.find(i => i.product_id === p.id);
                return (
                  <div key={p.id} className="product-card">
                    <div className="product-info">
                      <h4>{p.name}</h4>
                      <p className="product-price">${Number(p.price)}</p>
                    </div>
                    
                    <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                      {cartItem ? (
                        <>
                           <button onClick={() => updateCart(p, -1)} style={{background:'#333', color:'white', border:'none', width:'35px', height:'35px', borderRadius:'8px', fontSize:'18px'}}>-</button>
                           <span style={{fontSize:'18px', fontWeight:'bold'}}>{cartItem.quantity}</span>
                           <button onClick={() => updateCart(p, 1)} style={{background:'var(--primary)', color:'white', border:'none', width:'35px', height:'35px', borderRadius:'8px', fontSize:'18px'}}>+</button>
                        </>
                      ) : (
                        <button className="add-btn" onClick={() => updateCart(p, 1)}>+</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {cart.length > 0 && (
        <div className="sticky-cart" style={{display:'flex', gap:'10px'}}>
          <button className="btn-primary" onClick={confirmOrder} disabled={loading}>
            {loading ? "Generando..." : `Ver pedido ($${calculateTotal()})`}
          </button>
        </div>
      )}
    </div>
  );
}
