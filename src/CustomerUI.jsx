import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function CustomerUI({ businessId }) {
  const [view, setView] = useState('landing');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Smart Upsell State
  const [contextUpsells, setContextUpsells] = useState([]);

  const clientToken = localStorage.getItem("client_token") || crypto.randomUUID();

  useEffect(() => {
    localStorage.setItem("client_token", clientToken);
    loadMenu();
  }, [businessId]);

  useEffect(() => {
    if (!order) return;
    const channel = supabase.channel(`order_updates`)
      .on('postgres_changes', { 
        event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` 
      }, (payload) => {
        setOrder(payload.new);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel) };
  }, [order?.id]);

  const loadMenu = async () => {
    const [pReq, cReq] = await Promise.all([
      supabase.from('products').select('*').eq('business_id', businessId).eq('available', true).is('deleted_at', null),
      supabase.from('categories').select('*').eq('business_id', businessId).order('sort_order', { ascending: true })
    ]);
    if (cReq.data) setCategories(cReq.data);
    if (pReq.data) setProducts(pReq.data);
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
  const getCatName = (catId) => categories.find(c => c.id === catId)?.name.toLowerCase() || '';

  const startCheckout = () => {
    let logicalUpsells = [];

    // Analyzers
    const hasPapas = cart.some(c => c.name.toLowerCase().includes('papa') || c.name.toLowerCase().includes('frita'));
    const hasFood = cart.some(c => {
       const p = products.find(pr => pr.id === c.product_id);
       return p && (getCatName(p.category_id).includes('comida') || c.name.toLowerCase().includes('hamburguesa') || c.name.toLowerCase().includes('pizza'));
    });
    const cartDrinks = cart.filter(c => {
       const p = products.find(pr => pr.id === c.product_id);
       return p && (getCatName(p.category_id).includes('bebida') || c.name.toLowerCase().includes('cerveza') || c.name.toLowerCase().includes('ipa'));
    });
    const hasDrinks = cartDrinks.length > 0;

    // RULE 1: If Papas -> Suggest Cheddar
    if (hasPapas) {
       const cheddarMatch = products.find(p => p.name.toLowerCase().includes('cheddar') && !cart.some(c => c.product_id === p.id));
       if (cheddarMatch) logicalUpsells.push(cheddarMatch);
    }

    // RULE 2: If Food but NO Drinks -> Suggest first available Drink
    if (hasFood && !hasDrinks) {
       const firstDrink = products.find(p => getCatName(p.category_id).includes('bebida') && !cart.some(c => c.product_id === p.id));
       if (firstDrink) logicalUpsells.push(firstDrink);
    }

    // RULE 3: If Drinks -> Suggest the exact same drink they already ordered (Repeat purchase)
    if (hasDrinks && logicalUpsells.length < 2) {
       const repeatingDrinkId = cartDrinks[0].product_id;
       const repeatingDrink = products.find(p => p.id === repeatingDrinkId);
       if (repeatingDrink && !logicalUpsells.some(u => u.id === repeatingDrink.id)) {
           logicalUpsells.push(repeatingDrink);
       }
    }

    if (logicalUpsells.length > 0) {
      setContextUpsells(logicalUpsells.slice(0, 2));
      setView('upsell');
    } else {
      confirmOrder();
    }
  };

  const confirmOrder = async (additionalItem = null) => {
    setLoading(true);
    try {
      const { data: orderData, error: orderErr } = await supabase.from('orders').insert({
        business_id: businessId, status: 'CREATED', order_type: 'PICKUP', customer_notes: `[CLIENT_TOKEN:${clientToken}]`, payment_method: 'CASH', total: 0
      }).select().single();

      if (orderErr || !orderData) throw new Error("Error iniciando pedido.");

      let finalCart = [...cart];
      if (additionalItem) {
        // Find if already exists in cart to increase qty, else push
        const existingIdx = finalCart.findIndex(c => c.product_id === additionalItem.id);
        if (existingIdx >= 0) {
           finalCart[existingIdx].quantity += 1;
        } else {
           finalCart.push({ product_id: additionalItem.id, quantity: 1, price: Number(additionalItem.price) });
        }
      }

      const itemsToInsert = finalCart.map(item => ({
        order_id: orderData.id, product_id: item.product_id, quantity: item.quantity, unit_price: item.price, subtotal: item.price * item.quantity
      }));
      
      const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
      if (itemsErr) throw new Error("Fallo al agregar items.");

      const { data: updatedOrder, error: confirmErr } = await supabase.from('orders')
        .update({ status: 'PENDING_PAYMENT_CASH' }).eq('id', orderData.id).select().single();

      if (confirmErr || !updatedOrder) throw new Error("Fallo confirmación final.");

      setOrder(updatedOrder);
      setCart([]);
      setView('status');
    } catch (e) {
      alert("Error: " + e.message);
    }
    setLoading(false);
  };

  if (view === 'landing') {
    return (
      <div className="landing-screen">
        <h1 className="landing-title">🍻 Bienvenido</h1>
        <p className="landing-subtitle">Pedí al toque. Sin fila. Sin esperar.</p>
        <button className="btn-primary" onClick={() => setView('menu')}>VER MENÚ</button>
      </div>
    );
  }

  // SMART UPSELL SCREEN
  if (view === 'upsell') {
    return (
      <div style={{padding:'30px', textAlign:'center', minHeight:'100vh', display:'flex', flexDirection:'column', justifyContent:'center'}}>
         <div style={{display:'inline-block', fontSize:'50px', marginBottom:'15px'}}>🍺</div>
         <h1 style={{color:'var(--primary)', fontSize:'36px', marginBottom:'10px'}}>Ya que estás...</h1>
         <p style={{fontSize:'20px', color:'#ccc', marginBottom:'40px'}}>Agregá esto con 1 toque</p>
         
         <div style={{display:'flex', flexDirection:'column', gap:'15px', marginBottom:'40px'}}>
            {contextUpsells.map(u => (
               <div key={u.id} style={{background:'#1e1e1e', padding:'25px', borderRadius:'20px', border:'2px solid var(--primary)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div style={{textAlign:'left'}}>
                     <h3 style={{margin:0, fontSize:'22px', color:'white'}}>{u.name}</h3>
                     <p style={{margin:0, color:'var(--success)', fontWeight:'bold', fontSize:'18px', marginTop:'5px'}}>${Number(u.price)}</p>
                  </div>
                  <button onClick={() => confirmOrder(u)} style={{background:'var(--primary)', color:'white', border:'none', width:'55px', height:'55px', borderRadius:'15px', fontSize:'28px', fontWeight:'black', cursor:'pointer', boxShadow:'0 5px 15px rgba(237, 108, 2, 0.4)'}}>+</button>
               </div>
            ))}
         </div>

         <button onClick={() => confirmOrder(null)} style={{width:'100%', padding:'22px', background:'transparent', color:'#888', border:'2px solid #444', borderRadius:'15px', fontSize:'18px', fontWeight:'bold', marginTop:'auto', cursor:'pointer'}}>No gracias, ir a pagar 👉</button>
      </div>
    );
  }

  if (view === 'status' && order) {
    return (
      <div className="status-container">
        <h2 style={{color: 'var(--success)', fontSize:'28px'}}>✅ Pedido confirmado</h2>
        <h1 className="order-number" style={{fontSize:'90px'}}>#{order.display_number}</h1>
        
        <p style={{color:'#aaa', marginBottom:'5px', marginTop:'20px', fontSize:'14px', fontWeight:'bold'}}>ESTADO DE TU PEDIDO:</p>
        <div className={`status-badge ${order.status.toLowerCase()}`} style={{fontSize:'18px', padding:'10px 25px'}}>
          {order.status === 'PENDING_PAYMENT_CASH' ? '⚠️ ESPERANDO PAGO' : 
           order.status === 'PAID' ? '✅ RECIBIDO Y PAGADO' : 
           order.status === 'IN_PREPARATION' ? '🔥 EN PREPARACIÓN' : 
           order.status === 'READY' ? '🟢 LISTO PARA RETIRAR' : order.status}
        </div>

        <button className="btn-outline" style={{marginTop:'auto', width:'100%', padding:'20px', borderColor:'var(--primary)', color:'var(--primary)'}} onClick={() => {setOrder(null); setView('menu');}}>
          🍻 Pedir otra ronda
        </button>
      </div>
    );
  }

  return (
    <div style={{paddingBottom: '120px'}}>
      <div className="store-header" style={{position:'static'}}>
        <h2>Menú AlToque</h2>
      </div>

      {categories.length === 0 && <p style={{textAlign:'center', color:'#888', marginTop:'50px'}}>⚠️ El menú está vacío. Usa ?view=products para cargar datos.</p>}

      <div className="product-list">
        {categories.map(cat => {
          // Filtrado clave: Escondemos de la lista principal los que están marcados como "ventas encubiertas" o Upsells (is_upsell_target)
          const prods = products.filter(p => p.category_id === cat.id && !p.is_upsell_target);
          if (prods.length === 0) return null;
          
          return (
            <div key={cat.id}>
              <h3 className="section-title" style={{color:'var(--primary)'}}>{cat.name}</h3>
              {prods.map(p => {
                const cartItem = cart.find(i => i.product_id === p.id);
                return (
                  <div key={p.id} className="product-card">
                    <div className="product-info">
                      <h4 style={{margin:'0 0 5px 0'}}>{p.name}</h4>
                      {cartItem && cartItem.quantity === 1 && (getCatName(p.category_id).includes('bebida') || p.name.toLowerCase().includes('cerveza')) && (
                        <span style={{fontSize:'12px', background:'#333', color:'#888', padding:'2px 8px', borderRadius:'10px', display:'inline-block', marginBottom:'5px'}}>🍺 Llevá 2 y no des más vueltas</span>
                      )}
                      <p className="product-price" style={{margin:0}}>${Number(p.price)}</p>
                    </div>
                    
                    <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                      {cartItem ? (
                        <>
                           <button onClick={() => updateCart(p, -1)} style={{background:'#333', color:'white', border:'none', width:'35px', height:'35px', borderRadius:'8px', fontSize:'18px', cursor:'pointer'}}>-</button>
                           <span style={{fontSize:'18px', fontWeight:'bold'}}>{cartItem.quantity}</span>
                           <button onClick={() => updateCart(p, 1)} style={{background:'var(--primary)', color:'white', border:'none', width:'35px', height:'35px', borderRadius:'8px', fontSize:'18px', cursor:'pointer'}}>+</button>
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
        <div className="sticky-cart" style={{display:'flex', gap:'10px', justifyContent:'center'}}>
          <button className="btn-primary" onClick={startCheckout} disabled={loading} style={{fontSize:'20px', padding:'20px'}}>
            {loading ? "Generando..." : `Ver pedido ($${calculateTotal()})`}
          </button>
        </div>
      )}
    </div>
  );
}
