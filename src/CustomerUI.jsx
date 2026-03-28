import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function CustomerUI({ businessId }) {
  const [view, setView] = useState('landing'); // landing, menu, cart, status
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Inline Real-Time Upsell
  const [inlineUpsell, setInlineUpsell] = useState(null); // { product, message }

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

  const getCatName = (catId) => categories.find(c => c.id === catId)?.name.toLowerCase() || '';

  const updateCart = (product, change) => {
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id || item.product_id === product.product_id); // accept both structures
      
      let nextCart;
      
      if (existing) {
        const newQty = existing.quantity + change;
        if (newQty <= 0) {
           nextCart = prev.filter(item => item.product_id !== existing.product_id);
        } else {
           nextCart = prev.map(item => item.product_id === existing.product_id ? { ...item, quantity: newQty } : item);
        }
      } else {
        if (change > 0) {
           nextCart = [...prev, { product_id: product.id || product.product_id, name: product.name, price: Number(product.price), quantity: 1 }];
        } else {
           nextCart = prev;
        }
      }

      // SIDE EFFECT: Evaluate Inline Upsell when exactly ADDING items
      if (change > 0) {
         // Fire inline logic on next tick to read correct states
         setTimeout(() => triggerInlineUpsell(product, nextCart), 50);
      } else {
         setInlineUpsell(null); // hide immediately if removing items
      }

      return nextCart;
    });
  };

  const calculateTotal = () => cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  
  const triggerInlineUpsell = (addedProduct, currentCart) => {
    if (window.upsellTimeout) clearTimeout(window.upsellTimeout);
    
    const prodId = addedProduct.id || addedProduct.product_id;
    const fullProduct = products.find(p => p.id === prodId);
    if (!fullProduct) return;

    const currentQty = currentCart.find(c => c.product_id === prodId)?.quantity || 0;
    
    // RULE LIMIT: If user already has 2+ same items -> do NOT show anything.
    if (currentQty >= 2) {
       setInlineUpsell(null);
       return;
    }

    const catName = getCatName(fullProduct.category_id);
    const isDrink = catName.includes('bebida') || fullProduct.name.toLowerCase().includes('cerveza') || fullProduct.name.toLowerCase().includes('ipa');
    const isFood = catName.includes('comida') || fullProduct.name.toLowerCase().includes('hamburguesa') || fullProduct.name.toLowerCase().includes('pizza') || fullProduct.name.toLowerCase().includes('papa');

    let suggestion = null;
    let message = "";

    // CUSTOM LOGIC FIRST (Admin Mapped Description)
    const conditionalUpsells = products.filter(p => p.is_upsell_target && p.description && p.description.trim().length > 1);
    const customMatch = conditionalUpsells.find(u => {
        const magicWord = u.description.toLowerCase().trim();
        return fullProduct.name.toLowerCase().includes(magicWord) || catName.includes(magicWord);
    });

    if (customMatch && !currentCart.some(c => c.product_id === customMatch.id)) {
       suggestion = customMatch;
       message = `🔥 Recomendado: Agregá ${customMatch.name}`;
    } 
    // IF DRINK -> SUGGEST SAME DRINK (Repeat purchase)
    else if (isDrink && fullProduct.is_upsell_target) {
       suggestion = fullProduct;
       message = "🍺 Llevá 2 y ahorrá viaje";
    }
    // IF FOOD -> COMPLEMENTARY ITEM
    else if (isFood) {
       if (fullProduct.name.toLowerCase().includes('papa') || fullProduct.name.toLowerCase().includes('frita')) {
           const cheddar = products.find(p => p.name.toLowerCase().includes('cheddar') && !currentCart.some(c => c.product_id === p.id));
           if (cheddar) {
              suggestion = cheddar;
              message = "🍟 Agregá Cheddar al toque";
           }
       } else {
           const papas = products.find(p => (p.name.toLowerCase().includes('papa') || p.name.toLowerCase().includes('frita')) && p.is_upsell_target && !currentCart.some(c => c.product_id === p.id));
           if (papas) {
              suggestion = papas;
              message = "🍟 Acompañalo con Fritas";
           }
       }
    }

    // FALLBACK GENERIC
    if (!suggestion) {
       const generics = products.filter(p => p.is_upsell_target && (!p.description || p.description.length < 2) && !currentCart.some(c => c.product_id === p.id) && p.id !== prodId);
       if (generics.length > 0) {
          suggestion = generics[Math.floor(Math.random() * generics.length)];
          message = "¡No te olvides de agregar esto!";
       }
    }

    if (suggestion) {
       setInlineUpsell({ product: suggestion, message });
       window.upsellTimeout = setTimeout(() => setInlineUpsell(null), 6000); // UI Behavior: Must disappear automatically
    } else {
       setInlineUpsell(null);
    }
  };

  const startCheckout = () => {
    // No more black modal. Just execute directly to DB.
    confirmOrder(null);
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
      setInlineUpsell(null); // clean floating states
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
           <button onClick={() => setView('menu')} style={{padding:'20px', borderRadius:'15px', background:'#222', color:'white', border:'none', fontSize:'16px', fontWeight:'bold', width:'30%'}}>Volver</button>
           <button onClick={startCheckout} disabled={cart.length === 0 || loading} style={{padding:'20px', borderRadius:'15px', background:'var(--primary)', color:'white', border:'none', fontSize:'18px', fontWeight:'black', flexGrow:1, boxShadow:'0 5px 15px rgba(255,69,0,0.3)'}}>
             {loading ? 'Fijando Pedido...' : 'Comprar 👉'}
           </button>
        </div>
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
    <div style={{paddingBottom: '140px'}}>
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
                      <h4 style={{margin:'0 0 5px 0'}}>{p.name}</h4>
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

      {/* FLOATING INLINE UPSELL */}
      {inlineUpsell && cart.length > 0 && view === 'menu' && (
        <div style={{position:'fixed', bottom:'100px', left:'10px', right:'10px', background:'#242424', border:'2px solid var(--primary)', borderRadius:'12px', padding:'15px', color:'white', display:'flex', justifyContent:'space-between', alignItems:'center', zIndex: 1000, boxShadow:'0 -5px 20px rgba(0,0,0,0.5)', animation:'slideUp 0.3s ease-out'}}>
           <div>
              <p style={{margin:0, fontSize:'14px', fontWeight:'bold', color:'var(--primary)'}}>{inlineUpsell.message}</p>
              <h4 style={{margin:'5px 0 0 0', fontSize:'16px'}}>{inlineUpsell.product.name} <span style={{color:'var(--success)'}}>+${inlineUpsell.product.price}</span></h4>
           </div>
           <button onClick={() => {
               updateCart(inlineUpsell.product, 1);
               clearTimeout(window.upsellTimeout);
               setInlineUpsell(null); // Force dissolve after click
           }} style={{background:'var(--primary)', color:'white', border:'none', borderRadius:'8px', padding:'10px 15px', fontWeight:'bold', fontSize:'14px', cursor:'pointer', whiteSpace:'nowrap'}}>
             + Agregar
           </button>
        </div>
      )}

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
