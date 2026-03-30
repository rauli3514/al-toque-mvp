import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// ─── WhatsApp message builder ─────────────────────────────────────────────────

function buildWhatsAppMessage({ shopName, items, cart = [] }) {
  // Single product inquiry
  if (items && !Array.isArray(items)) {
    return (
      `Hola *${shopName}*, quiero consultar por:\n\n` +
      `• *${items.name}* — $${Number(items.price).toLocaleString('es-AR')}`
    );
  }

  // Multi-product cart
  if (cart.length === 0) return null;
  const total = cart.reduce((acc, p) => acc + Number(p.price) * (p.qty || 1), 0);
  const list  = cart.map(p => `• ${p.qty > 1 ? `${p.qty}x ` : ''}*${p.name}* — $${(Number(p.price) * (p.qty || 1)).toLocaleString('es-AR')}`).join('\n');

  return (
    `Hola *${shopName}*, quiero hacer un pedido:\n\n` +
    `${list}\n\n` +
    `*Total: $${total.toLocaleString('es-AR')}*`
  );
}

function openWhatsApp(whatsappNumber, message, shopName) {
  if (!message) return;

  const clean = whatsappNumber?.replace(/\D/g, '') || '';

  if (!clean) {
    alert(`❌ "${shopName}" no tiene WhatsApp configurado.\nComunicate con el negocio para configurarlo en el panel de administración.`);
    return;
  }

  const url = `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
  const w   = window.open(url, '_blank');
  if (!w) {
    // Fallback: navigate in same tab (mobile browsers block popups sometimes)
    window.location.href = url;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShopUI({ businessId, business: initialBusiness }) {
  const [business, setBusiness]           = useState(initialBusiness || null);
  const [categories, setCategories]       = useState([]);
  const [products, setProducts]           = useState([]);
  const [cart, setCart]                   = useState([]); // [{ ...product, qty }]
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeCategory, setActiveCategory]   = useState(null);
  const [searchQuery, setSearchQuery]         = useState('');

  const shopName       = business?.name           || 'Tienda';
  const whatsappNumber = business?.whatsapp_number || '';

  // Load business if not passed or missing whatsapp_number
  useEffect(() => {
    if (!business?.whatsapp_number !== undefined) return; // already loaded with field
    supabase.from('businesses').select('*').eq('id', businessId).single()
      .then(({ data }) => { if (data) setBusiness(data); });
  }, [businessId]);

  useEffect(() => {
    loadCatalog();
  }, [businessId]);

  const loadCatalog = async () => {
    const [pReq, cReq] = await Promise.all([
      supabase.from('products').select('*').eq('business_id', businessId).eq('available', true).is('deleted_at', null),
      supabase.from('categories').select('*').eq('business_id', businessId).order('sort_order', { ascending: true })
    ]);
    if (cReq.data) { setCategories(cReq.data); if (cReq.data.length > 0) setActiveCategory(cReq.data[0].id); }
    if (pReq.data) setProducts(pReq.data);
  };

  // ── Cart helpers ────────────────────────────────────────────────────────────
  const getQty      = (id) => cart.find(p => p.id === id)?.qty || 0;
  const isInCart    = (id) => getQty(id) > 0;
  const totalItems  = cart.reduce((a, p) => a + p.qty, 0);
  const totalPrice  = cart.reduce((a, p) => a + Number(p.price) * p.qty, 0);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === product.id);
      if (existing) return prev.map(p => p.id === product.id ? { ...p, qty: p.qty + 1 } : p);
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const removeFromCart = (product) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === product.id);
      if (!existing || existing.qty <= 1) return prev.filter(p => p.id !== product.id);
      return prev.map(p => p.id === product.id ? { ...p, qty: p.qty - 1 } : p);
    });
  };

  // ── WhatsApp senders ────────────────────────────────────────────────────────
  const handleSingleProduct = (product) => {
    const msg = buildWhatsAppMessage({ shopName, items: product });
    openWhatsApp(whatsappNumber, msg, shopName);
    setSelectedProduct(null);
  };

  const handleSendCart = () => {
    const msg = buildWhatsAppMessage({ shopName, cart });
    openWhatsApp(whatsappNumber, msg, shopName);
  };

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filteredProducts = products.filter(p => {
    const matchCat    = activeCategory ? p.category_id === activeCategory : true;
    const matchSearch = searchQuery ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) : true;
    return matchCat && matchSearch;
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: 'white', fontFamily: "'Inter', sans-serif", paddingBottom: cart.length > 0 ? '130px' : '40px' }}>

      {/* ── HEADER ── */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', padding: '28px 20px 18px', textAlign: 'center', borderBottom: '1px solid #222' }}>
        <h1 style={{ margin: '0 0 4px 0', fontSize: '26px', fontWeight: '900', background: 'linear-gradient(90deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {shopName}
        </h1>
        {whatsappNumber ? (
          <p style={{ margin: '0 0 16px 0', color: '#25d366', fontSize: '12px', fontWeight: '700' }}>
            📲 WhatsApp activo
          </p>
        ) : (
          <p style={{ margin: '0 0 16px 0', color: '#dc2626', fontSize: '12px', fontWeight: '700' }}>
            ⚠️ Sin WhatsApp configurado
          </p>
        )}

        {/* SEARCH */}
        <div style={{ position: 'relative', maxWidth: '500px', margin: '0 auto' }}>
          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: '#64748b' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar producto..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (e.target.value) setActiveCategory(null); else if (categories.length > 0) setActiveCategory(categories[0].id); }}
            style={{ width: '100%', padding: '11px 16px 11px 42px', background: '#1e1e2e', border: '1px solid #2a2a3a', borderRadius: '50px', color: 'white', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* ── CATEGORY TABS ── */}
      {!searchQuery && categories.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', padding: '14px 16px 8px', overflowX: 'auto', borderBottom: '1px solid #1a1a1a' }}>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
              padding: '7px 16px', borderRadius: '50px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              fontWeight: '700', fontSize: '13px', transition: 'all 0.2s',
              background: activeCategory === cat.id ? 'linear-gradient(90deg, #60a5fa, #a78bfa)' : '#1e1e2e',
              color: activeCategory === cat.id ? 'white' : '#64748b',
              boxShadow: activeCategory === cat.id ? '0 4px 12px rgba(96,165,250,0.3)' : 'none',
            }}>
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* ── PRODUCT GRID ── */}
      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px', maxWidth: '900px', margin: '0 auto' }}>
        {filteredProducts.length === 0 && (
          <p style={{ color: '#444', textAlign: 'center', gridColumn: '1/-1', marginTop: '40px' }}>No hay productos en esta categoría.</p>
        )}
        {filteredProducts.map(p => {
          const qty     = getQty(p.id);
          const inCart  = qty > 0;
          return (
            <div key={p.id}
              style={{ background: '#1a1a2e', borderRadius: '16px', overflow: 'hidden', border: inCart ? '2px solid #60a5fa' : '2px solid #1e1e2e', transition: 'all 0.2s', cursor: 'pointer', boxShadow: inCart ? '0 0 20px rgba(96,165,250,0.2)' : 'none' }}
              onClick={() => setSelectedProduct(p)}
            >
              <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>
                🛍️
              </div>
              <div style={{ padding: '12px' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '700', color: 'white', lineHeight: '1.3' }}>{p.name}</h4>
                {p.description && <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>{p.description}</p>}
                <p style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: '900', color: '#60a5fa' }}>${Number(p.price).toLocaleString('es-AR')}</p>

                {/* Add / qty controls */}
                {inCart ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f1628', borderRadius: '8px', padding: '4px' }}
                    onClick={e => e.stopPropagation()}>
                    <button onClick={() => removeFromCart(p)} style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '20px', fontWeight: '900', cursor: 'pointer', width: '32px' }}>−</button>
                    <span style={{ color: 'white', fontWeight: '800', fontSize: '15px' }}>{qty}</span>
                    <button onClick={() => addToCart(p)} style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '20px', fontWeight: '900', cursor: 'pointer', width: '32px' }}>+</button>
                  </div>
                ) : (
                  <button onClick={e => { e.stopPropagation(); addToCart(p); }}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '12px', background: '#25d366', color: 'white', transition: 'all 0.2s' }}>
                    💬 Consultar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── PRODUCT MODAL ── */}
      {selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedProduct(null); }}>
          <div style={{ background: '#1a1a2e', borderRadius: '24px 24px 0 0', padding: '28px 24px 44px', maxHeight: '85vh', overflowY: 'auto', animation: 'slideUp 0.25s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', color: 'white' }}>{selectedProduct.name}</h2>
                {selectedProduct.description && <p style={{ margin: '0 0 10px 0', color: '#94a3b8', fontSize: '14px', lineHeight: '1.5' }}>{selectedProduct.description}</p>}
                <p style={{ margin: 0, fontSize: '26px', fontWeight: '900', color: '#60a5fa' }}>${Number(selectedProduct.price).toLocaleString('es-AR')}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} style={{ background: '#2a2a3a', border: 'none', color: '#64748b', width: '36px', height: '36px', borderRadius: '50%', fontSize: '18px', cursor: 'pointer', flexShrink: 0, marginLeft: '12px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Direct WhatsApp for this product */}
              <button onClick={() => handleSingleProduct(selectedProduct)}
                style={{ padding: '16px', background: '#25d366', color: 'white', border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>📲</span> Consultar por WhatsApp
              </button>

              {/* Add to cart */}
              {getQty(selectedProduct.id) > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: '#0f1628', borderRadius: '14px', border: '2px solid #60a5fa' }}>
                  <button onClick={() => removeFromCart(selectedProduct)} style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '24px', fontWeight: '900', cursor: 'pointer' }}>−</button>
                  <span style={{ color: 'white', fontWeight: '900', fontSize: '20px' }}>{getQty(selectedProduct.id)} en lista</span>
                  <button onClick={() => addToCart(selectedProduct)} style={{ background: 'transparent', border: 'none', color: '#60a5fa', fontSize: '24px', fontWeight: '900', cursor: 'pointer' }}>+</button>
                </div>
              ) : (
                <button onClick={() => { addToCart(selectedProduct); setSelectedProduct(null); }}
                  style={{ padding: '14px', background: '#1e293b', color: '#94a3b8', border: '2px solid #2a2a3a', borderRadius: '14px', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}>
                  + Agregar a la lista
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── STICKY CART ── */}
      {cart.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px 16px', background: 'rgba(10,10,20,0.97)', borderTop: '1px solid #1e293b', backdropFilter: 'blur(12px)', zIndex: 1000 }}>
          <div style={{ maxWidth: '500px', margin: '0 auto' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>
              {totalItems} producto{totalItems > 1 ? 's' : ''} · <strong style={{ color: '#60a5fa' }}>${totalPrice.toLocaleString('es-AR')}</strong>
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setCart([])}
                style={{ padding: '13px 16px', background: '#1e1e2e', color: '#64748b', border: '1px solid #2a2a3a', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}>
                🗑️
              </button>
              <button onClick={handleSendCart}
                style={{ flex: 1, padding: '14px', background: 'linear-gradient(90deg, #25d366, #128c7e)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 15px rgba(37,211,102,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>📲</span>
                Enviar pedido por WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}
