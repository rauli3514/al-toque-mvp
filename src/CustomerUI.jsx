import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function CustomerUI({ businessId }) {
  const [view, setView] = useState('landing'); // landing, menu, cart, upsell, status
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Smart Upsell State
  const [contextUpsells, setContextUpsells] = useState([]);
  const [promoMessage, setPromoMessage] = useState("Agregá esto con 1 toque");
  const [upsellShown, setUpsellShown] = useState(false);

  const clientToken = localStorage.getItem("client_token") || crypto.randomUUID();

  useEffect(() => {
    localStorage.setItem("client_token", clientToken);
    loadMenu();
  }, [businessId]);

  useEffect(() => {
    if (!order) return;
    const channel = supabase.channel(`order_updates`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` }, (payload) => {
        setOrder(payload.new);
      }).subscribe();
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
      const existing = prev.find(item => item.product_id === product.id || item.product_id === product.product_id); // accept both structures
      if (existing) {
        const newQty = existing.quantity + change;
        if (newQty <= 0) return prev.filter(item => item.product_id !== existing.product_id);
        return prev.map(item => item.product_id === existing.product_id ? { ...item, quantity: newQty } : item);
      }
      if (change > 0) return [...prev, { product_id: product.id || product.product_id, name: product.name, price: Number(product.price), quantity: 1 }];
      return prev;
    });
  };

  const calculateTotal = () => cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const getCatName = (catId) => categories.find(c => c.id === catId)?.name.toLowerCase() || '';

  const startCheckout = () => {
    if (upsellShown) {
       confirmOrder(null);
       return;
    }

    let logicalUpsells = [];
    let overrideMessage = "Agregá esto con 1 toque";

    // Analyzers
    const hasDrinks = cart.some(c => {
       const catName = getCatName(products.find(pr => pr.id === c.product_id)?.category_id);
       return catName.includes('bebida') || c.name.toLowerCase().includes('cerveza') || c.name.toLowerCase().includes('ipa');
    });

    const allUpsells = products.filter(p => p.is_upsell_target);
    const conditionalUpsells = allUpsells.filter(p => p.description && p.description.trim().length > 1);
    const genericUpsells = allUpsells.filter(p => !p.description || p.description.trim().length <= 1);

    // 0. LINK PERSONALIZADO (Admin Description Mapping)
    // EXCLUSIVO: Estos productos SOLO saltan si la palabra mágica coincide.
    const customMatches = conditionalUpsells.filter(u => {
       const magicWord = u.description.toLowerCase().trim();
       return cart.some(c => c.name.toLowerCase().includes(magicWord) || getCatName(products.find(pr=>pr.id===c.product_id)?.category_id).includes(magicWord));
    });
    
    if (customMatches.length > 0) {
       logicalUpsells = customMatches;
       overrideMessage = "🔥 Recomendación especial para tu pedido:";
    }

    // 1. Repeat Purchase (If no custom match, try to upsell identical drink)
    if (logicalUpsells.length === 0 && hasDrinks) {
       const cartDrink = cart.find(c => {
          const catName = getCatName(products.find(pr => pr.id === c.product_id)?.category_id);
          return catName.includes('bebida') || c.name.toLowerCase().includes('cerveza');
       });
       if (cartDrink) {
          const matchingProduct = products.find(p => p.id === cartDrink.product_id && p.is_upsell_target);
          if (matchingProduct) {
             overrideMessage = "¿Estás seguro que solo querés esa cantidad? Nadie toma uno solo...";
             logicalUpsells.push(matchingProduct);
          }
       }
    }

    // 2. Generic Upsell targets (Fill the rest up to 2 items ONLY WITH GENERICS)
    if (logicalUpsells.length < 2) {
       const genericsNotInCart = genericUpsells.filter(p => !cart.some(c => c.product_id === p.id));
       // Randomize fallbacks to avoid always showing the exact same 2 products
       const shuffledGenerics = genericsNotInCart.sort(() => 0.5 - Math.random());
       
       logicalUpsells = [...logicalUpsells, ...shuffledGenerics].slice(0, 2);
    }

    if (logicalUpsells.length > 0) {
      setPromoMessage(overrideMessage);
      setContextUpsells(logicalUpsells.slice(0,2));
      setUpsellShown(true);
      setView('upsell');
    } else {
      confirmOrder(null);
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
        const existingIdx = finalCart.findIndex(c => c.product_id === additionalItem.id || c.product_id === additionalItem.product_id);
        if (existingIdx >= 0) {
           finalCart[existingIdx].quantity += 1;
        } else {
           finalCart.push({ product_id: additionalItem.id || additionalItem.product_id, quantity: 1, price: Number(additionalItem.price) });
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


  // VIEWS ==========================================================

  if (view === 'landing') {
    return (
      <div className="landing-screen">
        <h1 className="landing-title">🍻 Bienvenido</h1>
        <p className="landing-subtitle">Pedí al toque. Sin fila. Sin esperar.</p>
        <button className="btn-primary" onClick={() => setView('menu')}>VER MENÚ</button>
      </div>
    );
  }

  // INTERMEDIARY: CART REVIEW SCREEN
  if (view === 'cart') {
    return (
      <div style={{padding:'20px', minHeight:'100vh', display:'flex', flexDirection:'column', background:'#121212', color:'white'}}>
        <h2 style={{color:'white', marginBottom:'20px', borderBottom:'1px solid #333', paddingBottom:'20px'}}>Revisa tu Pedido</h2>
        
        {cart.length === 0 ? (
           <div style={{textAlign:'center', color:'#888', marginTop:'50px'}}>Tu carrito está vacío. <br/><br/><button onClick={() => setView('menu')} className="btn-outline">Volver al Menú</button></div>
        ) : (
           <div style={{display:'flex', flexDirection:'column', gap:'15px', flexGrow:1}}>
              {cart.map(item => (
                 <div key={item.product_id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#1e1e1e', padding:'15px', borderRadius:'15px', border:'1px solid #333'}}>
                    <div>
                       <h4 style={{margin:'0 0 5px 0', color:'white', fontSize:'18px'}}>{item.name}</h4>
                       <span style={{color:'var(--success)', fontWeight:'bold'}}>${item.price * item.quantity}</span>
                    </div>
                    <div style={{display:'flex', alignItems:'center', gap:'15px', background:'#111', padding:'5px', borderRadius:'10px'}}>
                       <button onClick={() => updateCart({product_id: item.product_id}, -1)} style={{background:'transparent', color:'white', border:'none', width:'35px', height:'35px', fontSize:'22px'}}>-</button>
                       <span style={{fontSize:'18px', fontWeight:'bold', color:'white'}}>{item.quantity}</span>
                       <button onClick={() => updateCart({product_id: item.product_id}, 1)} style={{background:'transparent', color:'white', border:'none', width:'35px', height:'35px', fontSize:'22px'}}>+</button>
                    </div>
                 </div>
              ))}
              
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'30px', borderTop:'2px dashed #444', paddingTop:'20px'}}>
                 <h2 style={{color:'white', margin:0}}>Total:</h2>
                 <h2 style={{color:'var(--success)', margin:0, fontSize:'28px'}}>${calculateTotal()}</h2>
              </div>
           </div>
        )}

        <div style={{marginTop:'auto', paddingTop:'30px', display:'flex', gap:'10px'}}>
           <button onClick={() => setView('menu')} style={{padding:'20px', borderRadius:'15px', background:'#222', color:'white', border:'none', fontSize:'16px', fontWeight:'bold', width:'30%'}}>Cerrar</button>
           <button onClick={startCheckout} disabled={cart.length === 0 || loading} style={{padding:'20px', borderRadius:'15px', background:'var(--primary)', color:'white', border:'none', fontSize:'18px', fontWeight:'black', flexGrow:1, boxShadow:'0 5px 15px rgba(255,69,0,0.3)'}}>
             {loading ? 'Preparando...' : 'Comprar 👉'}
           </button>
        </div>
      </div>
    );
  }

  // SMART UPSELL SCREEN
  if (view === 'upsell') {
    const addedAnyUpsell = contextUpsells.some(u => cart.some(c => c.product_id === u.id));

    return (
      <div style={{padding:'30px', textAlign:'center', minHeight:'100vh', display:'flex', flexDirection:'column', justifyContent:'center'}}>
         <div style={{display:'inline-block', fontSize:'50px', marginBottom:'15px'}}>🍺</div>
         <h1 style={{color:'var(--primary)', fontSize:'36px', marginBottom:'10px'}}>¡Esperá!</h1>
         <p style={{fontSize:'22px', color:'white', marginBottom:'40px', lineHeight:'1.4', padding:'0 10px', fontWeight:'bold'}}>{promoMessage}</p>
         
         <div style={{display:'flex', flexDirection:'column', gap:'15px', marginBottom:'40px'}}>
            {contextUpsells.map(u => {
               const isAdded = cart.some(c => c.product_id === u.id);
               return (
                 <div key={u.id} style={{background:'#1e1e1e', padding:'25px', borderRadius:'20px', border:'2px solid var(--primary)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div style={{textAlign:'left'}}>
                       <h3 style={{margin:0, fontSize:'22px', color:'white'}}>{u.name}</h3>
                       <p style={{margin:0, color:'var(--success)', fontWeight:'bold', fontSize:'18px', marginTop:'5px'}}>${Number(u.price)}</p>
                    </div>
                    <button 
                       onClick={() => updateCart(u, 1)} 
                       disabled={loading || isAdded} 
                       style={{background: isAdded ? '#28a745' : 'var(--primary)', color:'white', border:'none', width:'55px', height:'55px', borderRadius:'15px', fontSize:'28px', fontWeight:'black', cursor: isAdded ? 'default' : 'pointer', boxShadow: isAdded ? 'none' : '0 5px 15px rgba(237, 108, 2, 0.4)'}}
                    >
                       {isAdded ? '✔️' : '+'}
                    </button>
                 </div>
               );
            })}
         </div>

         <button 
            onClick={() => addedAnyUpsell ? setView('cart') : confirmOrder(null)} 
            disabled={loading} 
            style={{width:'100%', padding:'22px', background: addedAnyUpsell ? 'var(--success)' : 'transparent', color: addedAnyUpsell ? 'white' : '#888', border: addedAnyUpsell ? 'none' : '2px solid #444', borderRadius:'15px', fontSize:'18px', fontWeight:'bold', marginTop:'auto', cursor:'pointer'}}
         >
            {addedAnyUpsell ? `Revisar carrito actualizado 👉` : `No gracias, ir a pagar ($${calculateTotal()})`}
         </button>
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
                        <span style={{fontSize:'12px', background:'#333', color:'#888', padding:'2px 8px', borderRadius:'10px', display:'inline-block', marginBottom:'5px'}}>🍺 Llevá 2 y ahorrá viaje</span>
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
          <button className="btn-primary" onClick={() => setView('cart')} disabled={loading} style={{fontSize:'20px', padding:'20px'}}>
            Ver pedido ($ {calculateTotal()})
          </button>
        </div>
      )}
    </div>
  );
}
