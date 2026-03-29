import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function ShopUI({ businessId, business }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [inquiryCart, setInquiryCart] = useState([]); // list of products to consult
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const shopName = business?.name || 'Tienda';
  const whatsappNumber = business?.whatsapp_number || '';

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

  const toggleInquiry = (product) => {
    setInquiryCart(prev => {
      const exists = prev.find(p => p.id === product.id);
      return exists ? prev.filter(p => p.id !== product.id) : [...prev, product];
    });
  };

  const isInCart = (productId) => inquiryCart.some(p => p.id === productId);

  const sendWhatsApp = (product = null) => {
    let message;
    if (product) {
      message = `Hola, quiero consultar por:\n*${product.name}*\n💰 $${Number(product.price)}`;
    } else if (inquiryCart.length > 0) {
      const list = inquiryCart.map(p => `• *${p.name}* — $${Number(p.price)}`).join('\n');
      message = `Hola, quiero consultar por los siguientes productos:\n\n${list}`;
    } else return;

    const encoded = encodeURIComponent(message);
    const url = whatsappNumber
      ? `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const filteredProducts = products.filter(p => {
    const matchCat = activeCategory ? p.category_id === activeCategory : true;
    const matchSearch = searchQuery
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchCat && matchSearch;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: 'white', fontFamily: "'Inter', sans-serif", paddingBottom: inquiryCart.length > 0 ? '120px' : '40px' }}>

      {/* HEADER */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', padding: '30px 20px 20px', textAlign: 'center', borderBottom: '1px solid #222' }}>
        <h1 style={{ margin: '0 0 5px 0', fontSize: '28px', fontWeight: '900', background: 'linear-gradient(90deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {shopName}
        </h1>
        <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '14px' }}>Catálogo Digital</p>

        {/* SEARCH */}
        <div style={{ position: 'relative', maxWidth: '500px', margin: '0 auto' }}>
          <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: '#64748b' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar producto..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); if (e.target.value) setActiveCategory(null); else if (categories.length > 0) setActiveCategory(categories[0].id); }}
            style={{ width: '100%', padding: '12px 16px 12px 42px', background: '#1e1e2e', border: '1px solid #2a2a3a', borderRadius: '50px', color: 'white', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* CATEGORY TABS */}
      {!searchQuery && categories.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', padding: '16px 16px 8px', overflowX: 'auto', borderBottom: '1px solid #1a1a1a' }}>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: '8px 18px', borderRadius: '50px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: '700', fontSize: '13px', transition: 'all 0.2s',
                background: activeCategory === cat.id ? 'linear-gradient(90deg, #60a5fa, #a78bfa)' : '#1e1e2e',
                color: activeCategory === cat.id ? 'white' : '#64748b',
                boxShadow: activeCategory === cat.id ? '0 4px 12px rgba(96,165,250,0.3)' : 'none',
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* PRODUCT GRID */}
      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px', maxWidth: '900px', margin: '0 auto' }}>
        {filteredProducts.length === 0 && (
          <p style={{ color: '#444', textAlign: 'center', gridColumn: '1/-1', marginTop: '40px' }}>No hay productos en esta categoría.</p>
        )}
        {filteredProducts.map(p => {
          const inCart = isInCart(p.id);
          return (
            <div key={p.id}
              style={{ background: '#1a1a2e', borderRadius: '16px', overflow: 'hidden', border: inCart ? '2px solid #60a5fa' : '2px solid #1e1e2e', transition: 'all 0.2s', cursor: 'pointer', boxShadow: inCart ? '0 0 20px rgba(96,165,250,0.2)' : 'none' }}
              onClick={() => setSelectedProduct(p)}
            >
              {/* Product image placeholder */}
              <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px' }}>
                🛍️
              </div>
              <div style={{ padding: '12px' }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '700', color: 'white', lineHeight: '1.3' }}>{p.name}</h4>
                {p.description && <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#64748b', lineHeight: '1.4' }}>{p.description}</p>}
                <p style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: '900', color: '#60a5fa' }}>${Number(p.price).toLocaleString()}</p>
                <button
                  onClick={e => { e.stopPropagation(); toggleInquiry(p); }}
                  style={{
                    width: '100%', padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '12px', transition: 'all 0.2s',
                    background: inCart ? 'rgba(96,165,250,0.2)' : '#25d366',
                    color: inCart ? '#60a5fa' : 'white',
                  }}
                >
                  {inCart ? '✓ Agregado' : '💬 Consultar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* PRODUCT DETAIL MODAL */}
      {selectedProduct && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedProduct(null); }}
        >
          <div style={{ background: '#1a1a2e', borderRadius: '24px 24px 0 0', padding: '28px 24px 44px', maxHeight: '85vh', overflowY: 'auto', animation: 'slideUp 0.25s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: '0 0 6px 0', fontSize: '24px', color: 'white' }}>{selectedProduct.name}</h2>
                {selectedProduct.description && <p style={{ margin: '0 0 12px 0', color: '#94a3b8', fontSize: '15px', lineHeight: '1.5' }}>{selectedProduct.description}</p>}
                <p style={{ margin: 0, fontSize: '28px', fontWeight: '900', color: '#60a5fa' }}>${Number(selectedProduct.price).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} style={{ background: '#2a2a3a', border: 'none', color: '#64748b', width: '36px', height: '36px', borderRadius: '50%', fontSize: '18px', cursor: 'pointer', flexShrink: 0, marginLeft: '12px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Direct WhatsApp */}
              <button
                onClick={() => { sendWhatsApp(selectedProduct); setSelectedProduct(null); }}
                style={{ padding: '16px', background: '#25d366', color: 'white', border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <span style={{ fontSize: '20px' }}>📲</span> Consultar por WhatsApp
              </button>

              {/* Add to inquiry list */}
              <button
                onClick={() => { toggleInquiry(selectedProduct); setSelectedProduct(null); }}
                style={{ padding: '14px', background: isInCart(selectedProduct.id) ? '#1e293b' : '#1e293b', color: isInCart(selectedProduct.id) ? '#60a5fa' : '#94a3b8', border: `2px solid ${isInCart(selectedProduct.id) ? '#60a5fa' : '#2a2a3a'}`, borderRadius: '14px', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}
              >
                {isInCart(selectedProduct.id) ? '✓ Quitar de la lista' : '+ Agregar a lista de consulta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STICKY INQUIRY CART */}
      {inquiryCart.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px', background: 'rgba(15,15,15,0.95)', borderTop: '1px solid #1e293b', backdropFilter: 'blur(10px)', zIndex: 1000 }}>
          <div style={{ maxWidth: '500px', margin: '0 auto' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748b', textAlign: 'center' }}>
              {inquiryCart.length} producto{inquiryCart.length > 1 ? 's' : ''} en tu lista
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setInquiryCart([])}
                style={{ padding: '14px 18px', background: '#1e1e2e', color: '#64748b', border: '1px solid #2a2a3a', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}
              >
                🗑️ Limpiar
              </button>
              <button
                onClick={() => sendWhatsApp()}
                style={{ flex: 1, padding: '14px', background: 'linear-gradient(90deg, #25d366, #128c7e)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 15px rgba(37,211,102,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <span style={{ fontSize: '20px' }}>📲</span>
                Consultar por WhatsApp ({inquiryCart.length})
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
