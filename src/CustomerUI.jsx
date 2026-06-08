import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function CustomerUI({ businessId }) {
  const [view, setView]               = useState('landing');
  const [categories, setCategories]   = useState([]);
  const [products, setProducts]       = useState([]);
  const [cart, setCart]               = useState([]);
  const [order, setOrder]             = useState(null);
  const [loading, setLoading]         = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName]   = useState('');
  const [business, setBusiness]           = useState(null);

  // Inline upsell
  const [inlineUpsell, setInlineUpsell] = useState(null);

  // Product customization drawer
  const [addingProduct, setAddingProduct] = useState(null);
  const [productModifiers, setProductModifiers] = useState([]);
  const [selectedModifiers, setSelectedModifiers] = useState([]);
  const [currentNote, setCurrentNote] = useState('');

  // New Menu UX State
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState('ALL'); // ALL, FOOD, DRINK, PROMO
  const [activeSegment, setActiveSegment] = useState(null);

  // VIBRATION EFFECT — must be before any conditional returns

  useEffect(() => {
    if (order?.status === 'READY') {
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {}
    }
  }, [order?.status]);

  const clientToken = localStorage.getItem('client_token') || crypto.randomUUID();

  useEffect(() => {
    localStorage.setItem('client_token', clientToken);
    loadMenu();
    const savedOrderId = localStorage.getItem('active_order_id');
    if (savedOrderId) {
      supabase.from('orders').select('*').eq('id', savedOrderId).single().then(({ data }) => {
        if (data && !['DELIVERED', 'CANCELLED'].includes(data.status)) {
          setOrder(data); setView('status');
        } else {
          localStorage.removeItem('active_order_id');
        }
      });
    }
  }, [businessId]);

  useEffect(() => {
    if (!order?.id) return;
    const channel = supabase.channel(`order-status-${order.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` }, (payload) => {
        setOrder(payload.new);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [order?.id]);

  const loadMenu = async () => {
    const [pReq, cReq, bReq] = await Promise.all([
      supabase.from('products').select('*').eq('business_id', businessId).eq('available', true).is('deleted_at', null),
      supabase.from('categories').select('*').eq('business_id', businessId).order('sort_order', { ascending: true }),
      supabase.from('businesses').select('*').eq('id', businessId).single()
    ]);
    if (cReq.data) setCategories(cReq.data);
    if (pReq.data) setProducts(pReq.data);
    if (bReq.data) setBusiness(bReq.data);
  };

  const getCatName = (catId) => categories.find(c => c.id === catId)?.name.toLowerCase() || '';

  // ─── CART ────────────────────────────────────────────────────────────────
  const cartKey = (item) => item.product_id;

  const calculateTotal = () => cart.reduce((acc, item) => {
    const modDelta = (item.modifiers || []).reduce((s, m) => s + Number(m.price_delta), 0);
    return acc + (item.price + modDelta) * item.quantity;
  }, 0);

  const updateQty = (product_id, change) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product_id);
      if (!existing) return prev;
      const newQty = existing.quantity + change;
      if (newQty <= 0) return prev.filter(i => i.product_id !== product_id);
      return prev.map(i => i.product_id === product_id ? { ...i, quantity: newQty } : i);
    });
    if (change < 0) setInlineUpsell(null);
  };

  // ─── PRODUCT DRAWER ──────────────────────────────────────────────────────
  const openDrawer = async (product) => {
    setAddingProduct(product);
    setSelectedModifiers([]);
    setCurrentNote('');
    const { data } = await supabase.from('product_modifiers').select('*').eq('product_id', product.id).order('sort_order');
    setProductModifiers(data || []);
  };

  const closeDrawer = () => { setAddingProduct(null); setProductModifiers([]); setSelectedModifiers([]); setCurrentNote(''); };

  const toggleModifier = (mod) => {
    setSelectedModifiers(prev => prev.find(m => m.id === mod.id) ? prev.filter(m => m.id !== mod.id) : [...prev, mod]);
  };

  const confirmAdd = () => {
    const product = addingProduct;
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) return prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        product_id: product.id, name: product.name, price: Number(product.price),
        quantity: 1, note: currentNote.trim(), modifiers: selectedModifiers
      }];
    });
    setTimeout(() => triggerInlineUpsell(product, cart), 50);
    closeDrawer();
  };

  // ─── UPSELL ───────────────────────────────────────────────────────────────
  const triggerInlineUpsell = (addedProduct, currentCart) => {
    if (window.upsellTimeout) clearTimeout(window.upsellTimeout);
    const prodId = addedProduct.id;
    const currentQty = currentCart.find(c => c.product_id === prodId)?.quantity || 0;
    if (currentQty >= 2) { setInlineUpsell(null); return; }

    const catName = getCatName(addedProduct.category_id);
    const isDrink = catName.includes('bebida') || addedProduct.name.toLowerCase().includes('cerveza') || addedProduct.name.toLowerCase().includes('ipa');
    const isFood = !isDrink;

    let suggestion = null, message = '';

    const conditionalUpsells = products.filter(p => p.is_upsell_target && p.description?.trim().length > 1);
    const customMatch = conditionalUpsells.find(u => {
      const magicWord = u.description.toLowerCase().trim();
      return addedProduct.name.toLowerCase().includes(magicWord) || catName.includes(magicWord);
    });

    if (customMatch && !currentCart.some(c => c.product_id === customMatch.id)) {
      suggestion = customMatch; message = `🔥 Ya que estás... agregá ${customMatch.name}`;
    } else if (isDrink && addedProduct.is_upsell_target) {
      suggestion = addedProduct; message = '🍺 2da unidad con descuento';
    } else if (isFood) {
      const papas = products.find(p => (p.name.toLowerCase().includes('papa') || p.name.toLowerCase().includes('frita')) && p.is_upsell_target && !currentCart.some(c => c.product_id === p.id));
      if (papas) { suggestion = papas; message = '🍟 Sumale Fritas y ahorrá'; }
    }

    if (!suggestion) {
      const generics = products.filter(p => p.is_upsell_target && (!p.description || p.description.length < 2) && !currentCart.some(c => c.product_id === p.id) && p.id !== prodId);
      if (generics.length > 0) { suggestion = generics[Math.floor(Math.random() * generics.length)]; message = '⚡️ ¡Aprovechá ahora!'; }
    }

    if (suggestion) {
      setInlineUpsell({ product: suggestion, message });
      window.upsellTimeout = setTimeout(() => setInlineUpsell(null), 6000);
    } else {
      setInlineUpsell(null);
    }
  };

  // ─── ORDER ────────────────────────────────────────────────────────────────
  const confirmOrder = async () => {
    setLoading(true);
    try {
      const itemsFormatted = cart.map(item => ({
        name: item.name,
        quantity: item.quantity,
        variant: item.modifiers && item.modifiers.length > 0 ? item.modifiers.map(m => m.name).join(', ') : null,
        notes: item.note || null
      }));

      const { data: orderData, error: orderErr } = await supabase.from('orders').insert({
        business_id: businessId, status: 'CREATED', order_type: 'PICKUP',
        customer_notes: `[CLIENT_TOKEN:${clientToken}]`, payment_method: 'CASH', total: 0,
        table_number: tableNumber ? parseInt(tableNumber) : null,
        customer_name:  customerName.trim() || null,
        customer_phone: customerPhone.replace(/\D/g, '') || null,
        items: itemsFormatted
      }).select().single();
      if (orderErr || !orderData) throw new Error('Error iniciando pedido.');

      const { data: updatedOrder, error: confirmErr } = await supabase.from('orders').update({ status: 'PENDING_PAYMENT_CASH' }).eq('id', orderData.id).select().single();
      if (confirmErr || !updatedOrder) throw new Error('Fallo confirmación final.');

      setOrder(updatedOrder);
      setCart([]);
      setInlineUpsell(null);
      localStorage.setItem('active_order_id', updatedOrder.id);
      setView('status');
    } catch (e) {
      alert('Error: ' + e.message);
    }
    setLoading(false);
  };

  // ─── VIEWS ────────────────────────────────────────────────────────────────
  if (view === 'landing') {
    return (
      <div className="landing-screen">
        <h1 className="landing-title">🍻 Bienvenido</h1>
        <p className="landing-subtitle">Pedí al toque. Sin fila. Sin esperar.</p>
        <button className="btn-primary" onClick={() => setView('menu')}>VER MENÚ</button>
      </div>
    );
  }

  if (view === 'cart') {
    return (
      <div style={{ padding: '20px', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#121212', color: 'white' }}>
        <h2 style={{ color: 'white', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '20px' }}>Revisa tu Pedido</h2>

        {/* OPTIONAL: WhatsApp capture */}
        <div style={{ background: '#0f1f0f', border: '1px solid #1a3a1a', borderRadius: '12px', padding: '15px', marginBottom: '15px' }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#4ade80', fontWeight: '700' }}>📲 ¿Querés que te avisemos cuando esté listo?</p>
          <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: '#2a4a2a' }}>Dejanos tu WhatsApp y te mandamos una notificación + beneficios de cliente frecuente</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              placeholder="Tu nombre (opcional)"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              style={{ padding: '10px 12px', background: '#111', border: '1px solid #1a2a1a', borderRadius: '8px', color: 'white', fontSize: '14px', outline: 'none' }}
            />
            <input
              type="tel"
              placeholder="WhatsApp (ej: 3624123456)"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              style={{ padding: '10px 12px', background: '#111', border: '1px solid #1a2a1a', borderRadius: '8px', color: 'white', fontSize: '14px', outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#1e1e1e', padding: '15px', borderRadius: '12px', marginBottom: '15px', border: '1px solid #333' }}>
          <span style={{ fontSize: '20px' }}>🪑</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#888' }}>¿Tenés mesa? (opcional)</p>
            <input type="number" min="1" placeholder="Número de mesa" value={tableNumber} onChange={e => setTableNumber(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '18px', fontWeight: 'bold', width: '100%', outline: 'none' }} />
          </div>
        </div>

        {cart.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', marginTop: '50px' }}>Tu carrito está vacío.<br /><br /><button onClick={() => setView('menu')} className="btn-outline">Volver al Menú</button></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1 }}>
            {cart.map(item => {
              const modDelta = (item.modifiers || []).reduce((s, m) => s + Number(m.price_delta), 0);
              const unitPrice = item.price + modDelta;
              return (
                <div key={item.product_id} style={{ background: '#1e1e1e', padding: '15px', borderRadius: '15px', border: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 3px 0', color: 'white', fontSize: '17px' }}>{item.name}</h4>
                      {item.modifiers?.length > 0 && (
                        <p style={{ margin: '0 0 3px 0', fontSize: '12px', color: '#17a2b8' }}>
                          {item.modifiers.map(m => m.name).join(', ')}
                        </p>
                      )}
                      {item.note && <p style={{ margin: 0, fontSize: '12px', color: '#888', fontStyle: 'italic' }}>"{item.note}"</p>}
                      <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>${unitPrice * item.quantity}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#111', padding: '5px 10px', borderRadius: '10px' }}>
                      <button onClick={() => updateQty(item.product_id, -1)} style={{ background: 'transparent', color: 'white', border: 'none', width: '30px', height: '30px', fontSize: '20px', cursor: 'pointer' }}>-</button>
                      <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>{item.quantity}</span>
                      <button onClick={() => updateQty(item.product_id, 1)} style={{ background: 'transparent', color: 'white', border: 'none', width: '30px', height: '30px', fontSize: '20px', cursor: 'pointer' }}>+</button>
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '2px dashed #444', paddingTop: '20px' }}>
              <h2 style={{ color: 'white', margin: 0 }}>Total:</h2>
              <h2 style={{ color: 'var(--success)', margin: 0, fontSize: '28px' }}>${calculateTotal()}</h2>
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: '20px', display: 'flex', gap: '10px' }}>
          <button onClick={() => setView('menu')} style={{ padding: '18px', borderRadius: '15px', background: '#222', color: 'white', border: 'none', fontSize: '16px', fontWeight: 'bold', width: '30%', cursor: 'pointer' }}>Volver</button>
          <button onClick={confirmOrder} disabled={cart.length === 0 || loading}
            style={{ padding: '18px', borderRadius: '15px', background: 'var(--primary)', color: 'white', border: 'none', fontSize: '18px', fontWeight: '900', flexGrow: 1, cursor: 'pointer', boxShadow: '0 5px 15px rgba(255,69,0,0.3)' }}>
            {loading ? 'Enviando...' : 'Confirmar Pedido 👉'}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'status' && order) {
    const isReady = order.status === 'READY';
    const isPrep = order.status === 'PAID' || order.status === 'IN_PREPARATION';
    const isPending = !isReady && !isPrep;

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '30px', textAlign: 'center', background: isReady ? 'var(--success)' : '#121212', transition: 'background 0.5s', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', flex: 1, width: '100%', animation: isReady ? 'pulseBg 2s infinite' : 'none', borderRadius: '20px' }}>
          {isPending && (
            <>
              <div style={{ fontSize: '70px', marginBottom: '15px', color: 'var(--primary)' }}>{order.payment_method === 'CASH' ? '💵' : '📲'}</div>
              <h2 style={{ color: 'var(--primary)', margin: '0 0 10px 0', fontSize: '28px' }}>Pedido Recibido</h2>
              <p style={{ fontSize: '18px', color: '#ccc', lineHeight: '1.5', padding: '0 20px', fontWeight: 'bold' }}>
                {order.payment_method === 'CASH' ? 'Acercate a caja a pagar en efectivo' : 'Acercate a caja y pagá con tu App'}
              </p>
              <p style={{ fontSize: '16px', color: '#888', marginTop: '30px', marginBottom: '5px' }}>Mostrá tu número:</p>
              <h1 style={{ fontSize: '100px', margin: 0, color: 'white', lineHeight: '1' }}>#{order.display_number}</h1>
            </>
          )}
          {isPrep && (
            <>
              <div style={{ fontSize: '80px', marginBottom: '20px', animation: 'spinSlow 4s linear infinite' }}>👨‍🍳</div>
              <h2 style={{ color: 'var(--primary)', fontSize: '28px', margin: '0 0 10px 0' }}>Estamos preparando<br />tu pedido</h2>
              <p style={{ fontSize: '18px', color: '#ccc' }}>Te avisaremos por acá cuando esté listo.</p>
              <h1 style={{ fontSize: '70px', margin: '30px 0 0 0', color: '#444', lineHeight: '1' }}>#{order.display_number}</h1>
            </>
          )}
          {isReady && (
            <>
              <div style={{ fontSize: '90px', marginBottom: '15px' }}>🍻</div>
              <h2 style={{ color: 'white', fontSize: '36px', margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.3)', lineHeight: '1.1' }}>¡Tu pedido<br />está listo!</h2>
              <p style={{ fontSize: '22px', color: 'white', fontWeight: 'bold', marginTop: '15px' }}>Pasá a retirarlo en barra</p>
              <div style={{ background: 'white', color: 'var(--success)', padding: '15px 40px', borderRadius: '30px', marginTop: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
                <h1 style={{ fontSize: '80px', margin: 0, lineHeight: '1' }}>#{order.display_number}</h1>
              </div>
            </>
          )}
        </div>
        <button style={{ marginTop: 'auto', width: '100%', padding: '20px', background: 'transparent', border: isReady ? '2px solid white' : '2px solid #333', color: isReady ? 'white' : '#888', borderRadius: '100px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}
          onClick={() => { setOrder(null); localStorage.removeItem('active_order_id'); setView('menu'); }}>
          {isReady ? '✅ Ya lo retiré, pedir de nuevo' : '🍻 Volver al Catálogo'}
        </button>
      </div>
    );
  }

  // ─── MENU VIEW ────────────────────────────────────────────────────────────
  const getProductTags = (p) => {
    const tags = [];
    const desc = (p.description || '').toLowerCase();
    const name = p.name.toLowerCase();
    if (p.is_upsell_target || desc.includes('recomend') || name.includes('recomend')) tags.push({ label: '⭐ Recomendado', bg: '#f59e0b22', color: '#f59e0b' });
    if (desc.includes('promo') || name.includes('promo')) tags.push({ label: '💸 Promo', bg: '#10b98122', color: '#10b981' });
    if (desc.includes('popular') || desc.includes('vendido')) tags.push({ label: '🔥 Popular', bg: '#ef444422', color: '#ef4444' });
    return tags;
  };

  const isDrink = (p, catName) => {
    const term = (catName + ' ' + p.name).toLowerCase();
    return term.includes('bebida') || term.includes('cerveza') || term.includes('ipa') || term.includes('agua') || term.includes('gaseosa');
  };

  const filteredProducts = products.filter(p => !p.is_upsell_target).filter(p => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !(p.description || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
    const catName = getCatName(p.category_id);
    if (quickFilter === 'DRINK' && !isDrink(p, catName)) return false;
    if (quickFilter === 'FOOD' && isDrink(p, catName)) return false;
    if (quickFilter === 'PROMO' && !getProductTags(p).some(t => t.label === '💸 Promo')) return false;
    return true;
  });

  const featuredProducts = filteredProducts.filter(p => getProductTags(p).length > 0);

  const scrollToCategory = (id) => {
    setActiveSegment(id);
    const el = document.getElementById(`category-${id}`);
    if (el) {
      const offset = 160; // Height of sticky headers
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    }
  };

  return (
    <div style={{ paddingBottom: '140px', background: '#0a0a0a', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
      
      {/* ── HEADER CON BANNER Y LOGO ── */}
      <div style={{ position: 'relative', width: '100%', height: business?.banner_url ? '180px' : '100px', background: business?.banner_url ? `url(${business.banner_url}) center/cover no-repeat` : 'var(--primary)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {business?.logo_url && (
          <div style={{ 
            width: '80px', height: '80px', borderRadius: '50%', border: '4px solid #0a0a0a', 
            position: 'absolute', bottom: '-40px', left: '20px', 
            background: '#fff', overflow:'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', zIndex: 101
          }}>
            <img src={business.logo_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          </div>
        )}
      </div>

      {/* ── PART 2: HEADER & SEARCH BAR (Sticky) ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(10px)', padding: business?.logo_url ? '50px 15px 10px' : '15px 15px 10px', borderBottom: '1px solid #1a1a1a' }}>
        <h2 style={{ margin: '0 0 12px 0', fontSize: '22px', fontWeight: '900', color: 'white' }}>{business?.name || 'Menú AlToque'}</h2>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px' }}>🔍</span>
            <input 
              type="text" 
              placeholder="Buscar comida o bebida..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '12px 12px 12px 42px', borderRadius: '12px', background: '#1c1c1c', border: '1px solid #2a2a2a', color: 'white', boxSizing: 'border-box', outline: 'none', fontSize: '15px' }}
            />
          </div>
        </div>
        
        {/* ── PART 5: QUICK FILTERS ── */}
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
          {[{ id: 'ALL', label: 'Todo' }, { id: 'FOOD', label: '🍔 Solo comida' }, { id: 'DRINK', label: '🥤 Solo bebidas' }, { id: 'PROMO', label: '💸 Promos' }].map(f => (
            <button key={f.id} onClick={() => setQuickFilter(f.id)}
              style={{ padding: '8px 16px', borderRadius: '20px', whiteSpace: 'nowrap', border: 'none', fontWeight: '700', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', background: quickFilter === f.id ? 'var(--primary)' : '#1c1c1c', color: quickFilter === f.id ? 'white' : '#888' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── PART 1: STICKY CATEGORY NAV ── */}
      {!searchQuery && categories.length > 0 && (
        <div style={{ position: 'sticky', top: '134px', zIndex: 90, background: '#111', padding: '10px 15px', borderBottom: '1px solid #222', display: 'flex', gap: '10px', overflowX: 'auto', boxShadow: '0 4px 10px rgba(0,0,0,0.4)', scrollbarWidth: 'none' }}>
          {categories.map(cat => {
            const hasProducts = filteredProducts.some(p => p.category_id === cat.id);
            if (!hasProducts) return null;
            return (
              <button key={cat.id} onClick={() => scrollToCategory(cat.id)}
                style={{ padding: '6px 14px', borderRadius: '8px', whiteSpace: 'nowrap', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', background: activeSegment === cat.id ? '#333' : 'transparent', color: activeSegment === cat.id ? 'white' : '#777' }}>
                {cat.name}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ padding: '15px' }}>
        {filteredProducts.length === 0 && <p style={{ textAlign: 'center', color: '#666', marginTop: '40px' }}>No se encontraron productos.</p>}

        {/* ── PART 3: FEATURED SECTION ── */}
        {!searchQuery && quickFilter === 'ALL' && featuredProducts.length > 0 && (
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ margin: '0 0 12px 0', color: 'white', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '6px' }}>✨ Destacados</h3>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '10px', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
              {featuredProducts.map(p => {
                const cartItem = cart.find(i => i.product_id === p.id);
                const tags = getProductTags(p);
                return (
                  <div key={p.id} onClick={() => !cartItem && openDrawer(p)} style={{ minWidth: '160px', width: '160px', background: '#111', borderRadius: '16px', padding: '12px', border: '1px solid #222', scrollSnapAlign: 'start', position: 'relative', cursor: 'pointer' }}>
                    {tags[0] && <div style={{ position: 'absolute', top: '-8px', right: '-8px', background: tags[0].bg, color: tags[0].color, padding: '4px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: '900', border: `1px solid ${tags[0].color}44` }}>{tags[0].label}</div>}
                    <div style={{ height: '80px', background: '#1a1a1a', borderRadius: '10px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px' }}>🛍️</div>
                    <h4 style={{ margin: '0 0 4px 0', color: 'white', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</h4>
                    <p style={{ margin: 0, color: 'var(--primary)', fontWeight: 'bold', fontSize: '15px' }}>${Number(p.price)}</p>
                    {cartItem ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#222', borderRadius: '8px', padding: '4px', marginTop: '8px' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => updateQty(p.id, -1)} style={{ background: 'transparent', color: 'white', border: 'none', width: '24px', height: '24px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>-</button>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'white' }}>{cartItem.quantity}</span>
                        <button onClick={() => updateQty(p.id, 1)} style={{ background: 'transparent', color: 'var(--primary)', border: 'none', width: '24px', height: '24px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>+</button>
                      </div>
                    ) : (
                      <button style={{ width: '100%', padding: '6px', marginTop: '8px', background: '#222', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold' }}>+ Agregar</button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── PART 6: CATEGORY GROUPING ── */}
        {categories.map(cat => {
          const prods = filteredProducts.filter(p => p.category_id === cat.id);
          if (prods.length === 0) return null;
          return (
            <div key={cat.id} id={`category-${cat.id}`} style={{ scrollMarginTop: '180px', marginBottom: '25px' }}>
              <h3 style={{ margin: '0 0 15px 0', color: 'white', fontSize: '20px', fontWeight: '900', borderBottom: '2px solid #222', paddingBottom: '8px' }}>{cat.name}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {prods.map(p => {
                  const cartItem = cart.find(i => i.product_id === p.id);
                  const tags = getProductTags(p); // ── PART 4: PRODUCT TAGS ──
                  return (
                    <div key={p.id} onClick={() => !cartItem && openDrawer(p)} style={{ display: 'flex', background: '#111', borderRadius: '16px', padding: '14px', border: '1px solid #222', gap: '12px', cursor: 'pointer', transition: 'background 0.2s' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'white', fontWeight: '700' }}>{p.name}</h4>
                        {p.description && <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#888', lineHeight: '1.3' }}>{p.description}</p>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--primary)', fontWeight: '900', fontSize: '16px' }}>${Number(p.price)}</span>
                          {tags.map(t => <span key={t.label} style={{ background: t.bg, color: t.color, padding: '2px 6px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>{t.label}</span>)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '40px' }}>
                        {cartItem ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#222', borderRadius: '10px', padding: '4px' }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => updateQty(p.id, 1)} style={{ background: 'transparent', color: 'var(--primary)', border: 'none', width: '30px', height: '30px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}>+</button>
                            <span style={{ fontSize: '15px', fontWeight: '900', color: 'white', margin: '4px 0' }}>{cartItem.quantity}</span>
                            <button onClick={() => updateQty(p.id, -1)} style={{ background: 'transparent', color: '#888', border: 'none', width: '30px', height: '30px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}>-</button>
                          </div>
                        ) : (
                          <button style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--primary)', color: 'white', border: 'none', fontSize: '24px', fontWeight: '300', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* PRODUCT DRAWER */}
      {addingProduct && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) closeDrawer(); }}>
          <div style={{ background: 'rgba(0,0,0,0.6)', position: 'absolute', inset: 0 }} onClick={closeDrawer} />
          <div style={{ position: 'relative', background: '#1e1e1e', borderRadius: '24px 24px 0 0', padding: '25px 20px 40px', animation: 'slideUp 0.25s ease-out', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: 'white' }}>{addingProduct.name}</h3>
                {addingProduct.description && <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '14px' }}>{addingProduct.description}</p>}
                <p style={{ margin: '6px 0 0 0', color: 'var(--primary)', fontWeight: '900', fontSize: '20px' }}>${Number(addingProduct.price)}</p>
              </div>
              <button onClick={closeDrawer} style={{ background: '#333', border: 'none', color: '#888', width: '34px', height: '34px', borderRadius: '50%', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            {productModifiers.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#aaa', fontWeight: 'bold', textTransform: 'uppercase' }}>Opciones</p>
                {productModifiers.slice(0, 4).map(mod => {
                  const isSelected = selectedModifiers.find(m => m.id === mod.id);
                  return (
                    <div key={mod.id} onClick={() => toggleModifier(mod)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', borderRadius: '10px', marginBottom: '8px', background: isSelected ? '#2a1000' : '#111', border: `2px solid ${isSelected ? 'var(--primary)' : '#2a2a2a'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                      <span style={{ color: 'white', fontSize: '16px' }}>{mod.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {Number(mod.price_delta) > 0 && <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>+${mod.price_delta}</span>}
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', border: `2px solid ${isSelected ? 'var(--primary)' : '#555'}`, background: isSelected ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '14px', fontWeight: 'bold' }}>
                          {isSelected ? '✓' : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#aaa', fontWeight: 'bold', textTransform: 'uppercase' }}>📝 Notas</p>
              <textarea
                value={currentNote}
                onChange={e => setCurrentNote(e.target.value)}
                placeholder="Sin cebolla, sin hielo, bien cocido..."
                rows={2}
                style={{ width: '100%', background: '#111', border: '2px solid #2a2a2a', borderRadius: '10px', color: 'white', fontSize: '15px', padding: '12px', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <button onClick={confirmAdd}
              style={{ width: '100%', padding: '18px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '14px', fontSize: '18px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 5px 20px rgba(255,69,0,0.35)' }}>
              + Agregar al pedido
              {selectedModifiers.length > 0 && ` ($${Number(addingProduct.price) + selectedModifiers.reduce((s, m) => s + Number(m.price_delta), 0)})`}
            </button>
          </div>
        </div>
      )}

      {/* INLINE UPSELL */}
      {inlineUpsell && cart.length > 0 && view === 'menu' && (
        <div style={{ position: 'fixed', bottom: '100px', left: '10px', right: '10px', background: 'linear-gradient(145deg, #2a1100, #140500)', border: '2px solid var(--primary)', borderRadius: '12px', padding: '15px', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1000, boxShadow: '0 0 20px rgba(255, 69, 0, 0.4)', animation: 'slideUp 0.3s ease-out' }}>
          <div style={{ flex: 1, paddingRight: '10px' }}>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', color: 'var(--primary)' }}>{inlineUpsell.message}</p>
            <h4 style={{ margin: '4px 0 0 0', fontSize: '16px', lineHeight: '1.2' }}>{inlineUpsell.product.name}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ textDecoration: 'line-through', color: '#888', fontSize: '13px' }}>${Math.round(inlineUpsell.product.price * 1.3)}</span>
              <span style={{ color: 'var(--success)', fontWeight: '900', fontSize: '16px' }}>${inlineUpsell.product.price}</span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#aaa', fontStyle: 'italic' }}>⏳ válido solo en este pedido</p>
          </div>
          <button onClick={() => { openDrawer(inlineUpsell.product); clearTimeout(window.upsellTimeout); setInlineUpsell(null); }}
            style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', padding: '12px 16px', fontWeight: '900', fontSize: '15px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Agregar
          </button>
        </div>
      )}

      {cart.length > 0 && (
        <div className="sticky-cart" style={{ display: 'flex', gap: '10px', justifyContent: 'center', position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(10,10,10,0.9)', padding: '15px', borderTop: '1px solid #222', zIndex: 2000 }}>
          <button className="btn-primary" onClick={() => setView('cart')} style={{ fontSize: '18px', padding: '16px', width: '100%', maxWidth: '500px', borderRadius: '12px', fontWeight: 'bold' }}>
            Ver pedido (${calculateTotal()})
          </button>
        </div>
      )}
    </div>
  );

}
