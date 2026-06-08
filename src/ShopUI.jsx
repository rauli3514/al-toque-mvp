import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { upsertCustomer } from './customerRetention';

// ─── WhatsApp message builder ─────────────────────────────────────────────────

function buildWhatsAppMessage({ shopName, items, cart = [] }) {
  if (items && !Array.isArray(items)) {
    const vText = items.selectedVariant ? ` (${items.selectedVariant.name})` : '';
    return (
      `Hola *${shopName}*, quiero consultar por:\n\n` +
      `• *${items.name}*${vText} — $${Number(items.price).toLocaleString('es-AR')}`
    );
  }
  if (cart.length === 0) return null;
  const total = cart.reduce((acc, p) => acc + Number(p.price) * (p.qty || 1), 0);
  const list  = cart.map(p => {
    const vText = p.variantName ? ` (${p.variantName})` : '';
    return `• ${p.qty > 1 ? `${p.qty}x ` : ''}*${p.name}*${vText} — $${(Number(p.price) * (p.qty || 1)).toLocaleString('es-AR')}`;
  }).join('\n');

  return (
    `Hola *${shopName}*, quiero hacer un pedido:\n\n` +
    `${list}\n\n` +
    `*Total: $${total.toLocaleString('es-AR')}*`
  );
}

function formatArgPhone(phone) {
  let clean = phone?.replace(/\D/g, '') || '';
  if (!clean) return '';
  if (clean.length === 10) return '549' + clean;
  if (clean.length === 11 && clean.startsWith('9')) return '54' + clean;
  if (clean.length === 12 && clean.startsWith('54') && !clean.startsWith('549')) return '549' + clean.slice(2);
  return clean;
}

function openWhatsApp(whatsappNumber, message, shopName) {
  if (!message) return;
  const clean = formatArgPhone(whatsappNumber);
  if (!clean) {
    alert(`❌ "${shopName}" no tiene WhatsApp configurado.\nComunicate con el negocio para configurarlo en el panel de administración.`);
    return;
  }
  const url = `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
  const w   = window.open(url, '_blank');
  if (!w) window.location.href = url;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ShopUI({ businessId, business: initialBusiness }) {
  const [business, setBusiness]           = useState(initialBusiness || null);
  const [categories, setCategories]       = useState([]);
  const [products, setProducts]           = useState([]);
  const [cart, setCart]                   = useState([]); // [{ ...product, variantId, variantName, qty }]
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeVarId, setActiveVarId]         = useState(null);
  const [activeCategory, setActiveCategory]   = useState(null);
  const [searchQuery, setSearchQuery]         = useState('');
  
  // Lead Gen & Checkout
  const [subName, setSubName] = useState('');
  const [subPhone, setSubPhone] = useState('');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Mis Pedidos UI
  const [view, setView] = useState('shop'); // 'shop' | 'orders'
  const [activeOrder, setActiveOrder] = useState(null);

  // Replaced via custom order handler

  const bType = business?.business_type || 'SHOP';
  const shopName = business?.name || 'Mi tienda';
  const whatsappNumber = business?.whatsapp_number || '';

  useEffect(() => {
    // Initial fetch to ensure we have the latest
    supabase.from('businesses').select('*').eq('id', businessId).single().then(({ data }) => { if(data) setBusiness(data); });

    // Live listen for settings changes (open hours, etc)
    const channel = supabase.channel(`business-${businessId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'businesses', filter: `id=eq.${businessId}` }, (payload) => {
        setBusiness(payload.new);
      }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [businessId]);

  useEffect(() => {
    const targetId = activeOrder?.id || (() => {
      try { return JSON.parse(localStorage.getItem('last_order'))?.id; } catch(e) { return null; }
    })();

    if (!targetId) return;

    if (!activeOrder) {
      supabase.from('orders').select('*').eq('id', targetId).single().then(({data}) => {
        if (data) setActiveOrder(data);
      });
    }

    const channel = supabase.channel(`customer-order-${targetId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${targetId}` }, (payload) => {
        setActiveOrder(payload.new);
      }).subscribe();
      
    return () => supabase.removeChannel(channel);
  }, [activeOrder?.id]);

  useEffect(() => { loadCatalog(); }, [businessId]);

  const loadCatalog = async () => {
    const [pReq, cReq] = await Promise.all([
      supabase.from('products').select('*').eq('business_id', businessId).eq('available', true).is('deleted_at', null),
      supabase.from('categories').select('*').eq('business_id', businessId).order('sort_order', { ascending: true })
    ]);
    if (cReq.data) { setCategories(cReq.data); if (cReq.data.length > 0) setActiveCategory(cReq.data[0].id); }
    
    if (pReq.data) {
      const pIds = pReq.data.map(p => p.id);
      let varsData = [], imgsData = [];
      if (pIds.length > 0) {
        const [v, i] = await Promise.all([
          supabase.from('product_variants').select('*').in('product_id', pIds).eq('active', true),
          supabase.from('product_images').select('*').in('product_id', pIds).order('sort_order')
        ]);
        varsData = v.data || [];
        imgsData = i.data || [];
      }
      const enriched = pReq.data.map(p => ({
        ...p,
        variants: varsData.filter(v => v.product_id === p.id && v.stock !== 0),
        images: imgsData.filter(img => img.product_id === p.id)
      }));
      setProducts(enriched);
    }
  };

  // ── Cart helpers ────────────────────────────────────────────────────────────
  const getCartId = (pId, vId) => `${pId}-${vId || 'default'}`;
  const getQty = (pId, vId) => cart.find(c => getCartId(c.id, c.variantId) === getCartId(pId, vId))?.qty || 0;
  const totalItems = cart.reduce((a, p) => a + p.qty, 0);
  const totalPrice = cart.reduce((a, p) => a + Number(p.price) * p.qty, 0);

  const addToCart = (product, variant = null) => {
    setCart(prev => {
      const cid = getCartId(product.id, variant?.id);
      const existing = prev.find(p => getCartId(p.id, p.variantId) === cid);
      if (existing) {
        return prev.map(p => getCartId(p.id, p.variantId) === cid ? { ...p, qty: p.qty + 1 } : p);
      }
      return [...prev, { ...product, variantId: variant?.id, variantName: variant?.name, price: variant ? Number(product.price) + Number(variant.price_modifier) : product.price, qty: 1 }];
    });
  };

  const removeFromCart = (product, variantId = null) => {
    setCart(prev => {
      const cid = getCartId(product.id, variantId);
      const existing = prev.find(p => getCartId(p.id, p.variantId) === cid);
      if (!existing) return prev;
      if (existing.qty <= 1) return prev.filter(p => getCartId(p.id, p.variantId) !== cid);
      return prev.map(p => getCartId(p.id, p.variantId) === cid ? { ...p, qty: p.qty - 1 } : p);
    });
  };

  // ── WhatsApp senders ────────────────────────────────────────────────────────
  const processInternalOrder = async (orderItems) => {
    if (!subName.trim() || !subPhone.trim()) {
      alert("⚠️ Por favor completa tu Nombre y Teléfono (con código de área) para confirmar el pedido.");
      return false;
    }
    const cleanPhone = formatArgPhone(subPhone);
    const total = orderItems.reduce((acc, p) => acc + Number(p.price) * (p.qty || 1), 0);
    const orderNum = Math.floor(1000 + Math.random() * 9000);
    
    setIsSubmitting(true);
    try {
      // Register customer
      // Register customer (correctly initialized with total_orders)
      await upsertCustomer(supabase, { businessId, phone: cleanPhone, name: subName.trim() });

      const itemsFormatted = orderItems.map(item => ({
        name: item.name,
        quantity: item.qty || 1,
        variant: item.variantName || null,
        notes: item.notes || null
      }));

      // Create Order
      const { data: orderData } = await supabase.from('orders').insert({
        business_id: businessId, status: 'PENDING_PAYMENT', payment_method: 'CASH', order_type: 'DELIVERY', total: total, display_number: String(orderNum), customer_name: subName.trim(), customer_phone: cleanPhone,
        items: itemsFormatted
      }).select().single();
      
      localStorage.setItem("last_order", JSON.stringify({
        id: orderData.id,
        display_number: orderData.display_number
      }));
      setActiveOrder(orderData);

      return orderNum;
    } catch(e) {
      console.error("Order error:", e);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSingleProduct = async (product, variant) => {
    const finalPrice = variant ? Number(product.price) + Number(variant.price_modifier) : product.price;
    const item = { ...product, price: finalPrice, selectedVariant: variant, qty: 1 };
    setCart([item]);
    setSelectedProduct(null);
    setIsCheckoutOpen(true);
  };

  const handleConfirmPlatform = async () => {
    const num = await processInternalOrder(cart);
    if (num) {
       const numStr = String(num).padStart(4, '0');
       const baseMsg = buildWhatsAppMessage({ shopName, cart });
       const fullMsg = `*🚀 NUEVO PEDIDO #${numStr}*\n*Tipo:* Envío / Retiro\n\n` + baseMsg;
       alert(`✅ ¡Pedido #${num} procesado!\n\nSerás redirigido a WhatsApp para enviar el pedido al comercio.`);
       openWhatsApp(whatsappNumber, fullMsg, shopName);
       setCart([]);
       setIsCheckoutOpen(false);
    }
  };

  const handleSendWA = async () => {
    if (subName.trim() && subPhone.trim()) {
      await processInternalOrder(cart); // optionally save it to CRM if filled
    }
    const msg = buildWhatsAppMessage({ shopName, cart });
    openWhatsApp(whatsappNumber, msg, shopName);
  };

  const filteredProducts = products.filter(p => {
    const matchCat = activeCategory ? p.category_id === activeCategory : true;
    const matchSearch = searchQuery ? p.name.toLowerCase().includes(searchQuery.toLowerCase()) : true;
    return matchCat && matchSearch;
  });

  const featProducts = products.filter(p => p.is_upsell_target); // Treating upsell as featured/best seller

  // ── Dynamic Styles Logic ──────────────────────────────────────────
  const isFashion = bType === 'FASHION';
  const isGifts = bType === 'GIFTS';
  const isTech = bType === 'TECH';
  const isBeauty = bType === 'BEAUTY';

  let bgMain = '#0f0f0f';
  let cardBg = '#1a1a2e';
  let accent = '#60a5fa';

  if (isFashion) { bgMain = '#FAF9F6'; cardBg = '#ffffff'; accent = '#111'; }
  if (isGifts) { bgMain = '#FFF0F5'; cardBg = '#ffffff'; accent = '#FF69B4'; }
  if (isBeauty) { bgMain = '#FDFBF7'; cardBg = '#ffffff'; accent = '#D4AF37'; }
  if (isTech) { bgMain = '#0b0c10'; cardBg = '#1f2833'; accent = '#45a29e'; }

  const ProductCard = ({ p }) => {
    const cartEntry = cart.find(c => c.id === p.id && !c.variantId);
    const totalQtyInCart = cart.filter(c => c.id === p.id).reduce((s, c) => s + c.qty, 0);
    const hasVariants = p.variants && p.variants.length > 0;
    const primaryImg = p.images && p.images.length > 0 ? p.images[0].image_url : (p.image_url || null);

    return (
      <div style={{ 
        background: cardBg, borderRadius: isBeauty ? '20px' : (isFashion ? '0px' : '16px'), overflow: 'hidden', 
        border: `1px solid ${p.is_upsell_target ? accent : (isFashion ? '#eee' : (isTech ? '#333' : 'transparent'))}`, 
        boxShadow: p.is_upsell_target ? `0 0 12px ${accent}44` : (isFashion ? 'none' : '0 4px 15px rgba(0,0,0,0.05)'),
        cursor: 'pointer', transition: 'transform 0.2s', position: 'relative'
      }}>
        {/* Badge Destacado */}
        {p.is_upsell_target && (
          <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 10, background: accent, color: (isFashion||isBeauty||isGifts) ? '#fff' : '#000', padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '900' }}>
            ⭐ Destacado
          </div>
        )}
        {/* Badge cantidad en carrito */}
        {totalQtyInCart > 0 && (
          <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10, background: '#22c55e', color: '#fff', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '900' }}>
            {totalQtyInCart}
          </div>
        )}
        <div onClick={() => { setSelectedProduct(p); setActiveVarId(p.variants && p.variants.length > 0 ? p.variants[0].id : null); }}>
          <div style={{ height: isGifts ? '220px' : (isFashion ? '280px' : '160px'), background: primaryImg ? '#fff' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {primaryImg ? (
              <img src={primaryImg} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
            ) : <span style={{ fontSize: '40px' }}>{isFashion ? '👗' : (isTech ? '💻' : '🛍️')}</span>}
          </div>
          <div style={{ padding: '16px' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: isFashion ? '500': '700', color: isFashion||isGifts||isBeauty ? '#111' : 'white' }}>{p.name}</h4>
            {p.description && <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: isFashion||isGifts||isBeauty ? '#666' : '#9ca3af', display: '-webkit-box', WebkitLineClamp: isGifts ? 3 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
            <p style={{ margin: '0 0 10px 0', fontSize: '16px', fontWeight: '900', color: accent }}>${Number(p.price).toLocaleString('es-AR')}</p>
          </div>
        </div>

        {/* Controles de cantidad o botón agregar */}
        <div style={{ padding: '0 16px 16px' }}>
          {!hasVariants && cartEntry ? (
            // Producto simple ya en carrito → mostrar +/-
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isFashion||isGifts||isBeauty ? '#f3f4f6' : '#1a1a2e', borderRadius: '10px', padding: '6px 10px' }}
              onClick={e => e.stopPropagation()}>
              <button onClick={() => removeFromCart(p)} style={{ background: 'transparent', border: 'none', color: isFashion||isGifts||isBeauty ? '#111' : 'white', fontSize: '22px', fontWeight: '900', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>−</button>
              <span style={{ fontWeight: '900', fontSize: '16px', color: accent }}>{cartEntry.qty}</span>
              <button onClick={() => addToCart(p)} style={{ background: 'transparent', border: 'none', color: accent, fontSize: '22px', fontWeight: '900', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>+</button>
            </div>
          ) : (
            // Sin variantes o con variantes → botón que abre modal
            <button
              onClick={() => { setSelectedProduct(p); setActiveVarId(p.variants && p.variants.length > 0 ? p.variants[0].id : null); }}
              style={{ width:'100%', padding:'10px', background: accent, color: (isFashion || isBeauty || isGifts) ? '#fff' : '#000', border:'none', borderRadius: '8px', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>
              {hasVariants ? (totalQtyInCart > 0 ? `Agregar más (${totalQtyInCart} en carrito)` : 'Elegir opciones') : 'Agregar'}
            </button>
          )}
        </div>
      </div>
    );
  };


  return (
    <div style={{ minHeight: '100vh', background: bgMain, color: isFashion||isGifts||isBeauty ? '#111' : 'white', fontFamily: "'Inter', sans-serif", paddingBottom: cart.length > 0 ? '180px' : '100px' }}>

      {/* HEADER CON BANNER Y LOGO */}
      <div style={{ position: 'relative', width: '100%', height: business?.banner_url ? '180px' : '80px', background: business?.banner_url ? `url(${business.banner_url}) center/cover no-repeat` : accent, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {business?.logo_url && (
          <div style={{ 
            width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${bgMain}`, 
            position: 'absolute', bottom: '-40px', left: '50%', transform: 'translateX(-50%)', 
            background: '#fff', overflow:'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', zIndex: 101
          }}>
            <img src={business.logo_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          </div>
        )}
      </div>

      {view === 'shop' && (
      <>
      <div style={{ paddingTop: business?.logo_url ? '50px' : '36px', paddingBottom: '20px', paddingLeft: '20px', paddingRight: '20px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 100, background: isFashion||isGifts||isBeauty ? 'rgba(255,255,255,0.95)' : 'rgba(15,15,15,0.95)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${isFashion||isGifts||isBeauty ? '#eee' : '#222'}` }}>
        <h1 onClick={() => setShowInfoModal(true)} style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: '900', color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          {shopName} <span style={{ fontSize: '18px' }}>ℹ️</span>
        </h1>
        {whatsappNumber && <p style={{ margin: '0 0 16px 0', color: '#25d366', fontSize: '12px', fontWeight: '700' }}>📲 WhatsApp activo</p>}
        {/* BUSCADOR */}
        <div style={{ position: 'relative', maxWidth: '500px', margin: '0 auto' }}>
          <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
          <input type="text" placeholder="Buscar producto..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); if (e.target.value) setActiveCategory(null); }}
            style={{ width: '100%', padding: '12px 16px 12px 42px', background: isFashion||isGifts||isBeauty ? '#f3f4f6' : '#1e1e2e', border:'none', borderRadius: '50px', outline: 'none', color: isFashion||isGifts||isBeauty ? '#111' : 'white' }} />
        </div>
      </div>

      {/* TABS CATEGORÍAS */}
      {!searchQuery && categories.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', padding: '16px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
              padding: '8px 18px', borderRadius: '50px', border: `1px solid ${activeCategory === cat.id ? accent : (isFashion||isGifts||isBeauty ? '#ddd' : '#333')}`, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: '600', fontSize: '13px',
              background: activeCategory === cat.id ? accent : 'transparent',
              color: activeCategory === cat.id ? (isFashion||isGifts||isBeauty ? '#fff' : '#000') : (isFashion||isGifts||isBeauty ? '#666' : '#9ca3af')
            }}>{cat.name}</button>
          ))}
        </div>
      )}

      {/* SECCIÓN DESTACADOS / BEST SELLERS */}
      {!activeCategory && !searchQuery && featProducts.length > 0 && (
        <div style={{ padding: '0 16px 20px', maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px', borderBottom: `2px solid ${accent}`, display: 'inline-block', paddingBottom: '4px' }}>🔥 Destacados</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
            {featProducts.slice(0, 4).map(p => <ProductCard key={p.id} p={p} />)}
          </div>
        </div>
      )}

      {/* GRILLA PRINCIPAL */}
      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: isFashion ? '2px': '16px', maxWidth: '900px', margin: '0 auto' }}>
        {filteredProducts.map(p => <ProductCard key={p.id} p={p} />)}
      </div>

      {/* Modal / Selector de Variante */}
      {selectedProduct && (() => {
        const p = selectedProduct;
        const selVar = p.variants?.find(v => v.id === activeVarId);
        const finalPrice = selVar ? Number(p.price) + Number(selVar.price_modifier) : Number(p.price);
        const modalBg = isFashion||isGifts||isBeauty ? '#fff' : '#1a1a2e';
        const txtColor = isFashion||isGifts||isBeauty ? '#111' : '#fff';
        const modalImg = p.images && p.images.length > 0 ? p.images[0].image_url : (p.image_url || null);

        return (
          <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', flexDirection:'column', justifyContent:'flex-end', background:'rgba(0,0,0,0.6)' }} onClick={e => { if(e.target===e.currentTarget) setSelectedProduct(null); }}>
            <div style={{ background: modalBg, color: txtColor, borderRadius: '24px 24px 0 0', padding: '24px', maxHeight: '85vh', overflowY: 'auto', animation: 'slideUp 0.3s ease' }} onClick={e=>e.stopPropagation()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
                <h2 style={{ margin:0, fontSize:'22px' }}>{p.name}</h2>
                <button onClick={()=>setSelectedProduct(null)} style={{ background:'transparent', border:'none', fontSize:'24px', color:txtColor, cursor:'pointer' }}>×</button>
              </div>
              
              {modalImg && (
                 <img src={modalImg} style={{ width:'100%', height:'200px', objectFit:'cover', borderRadius:'12px', marginBottom:'16px' }} />
              )}

              <p style={{ fontSize: '24px', fontWeight: '900', color: accent, marginBottom: '16px' }}>${finalPrice.toLocaleString('es-AR')}</p>
              
              {p.description && <p style={{ color: isFashion||isGifts||isBeauty ? '#555' : '#aaa', fontSize: '14px', lineHeight:'1.5', marginBottom:'20px' }}>{p.description}</p>}

              {/* VARIANTS SELECTOR */}
              {p.variants && p.variants.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <p style={{ fontWeight:'700', fontSize:'13px', marginBottom:'10px' }}>Opciones disponibles:</p>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                    {p.variants.map(v => (
                      <button key={v.id} onClick={() => setActiveVarId(v.id)} style={{
                        padding: '10px 16px', borderRadius: '8px', border: `1px solid ${activeVarId === v.id ? accent : (isFashion||isGifts||isBeauty ? '#ddd' : '#333')}`,
                        background: activeVarId === v.id ? accent : 'transparent', color: activeVarId === v.id ? (isFashion||isGifts||isBeauty?'#fff':'#000') : txtColor, cursor: 'pointer', fontWeight:'600'
                      }}>
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ACCIONES */}
              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <button onClick={() => { addToCart(p, selVar); setSelectedProduct(null); }} style={{ padding: '16px', background: isFashion||isGifts||isBeauty?'#111':'#333', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}>+ Agregar al carrito</button>
                <button onClick={() => handleSingleProduct(p, selVar)} style={{ padding: '16px', background: '#25d366', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '700', cursor: 'pointer' }}>🛒 Comprar ahora</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CARRITO FLOTANTE */}
      {!isCheckoutOpen && cart.length > 0 && (
        <div style={{ position: 'fixed', bottom: '70px', left: 0, right: 0, padding: '16px', background: isFashion||isGifts||isBeauty ? 'rgba(255,255,255,0.95)' : 'rgba(10,10,20,0.95)', borderTop: `1px solid ${isFashion||isGifts||isBeauty ? '#eee' : '#222'}`, backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ flex: 1, display:'flex', flexDirection:'column' }}>
            <span style={{ fontSize: '12px', color: isFashion||isGifts||isBeauty ? '#555' : '#888' }}>{totalItems} ítems seleccionados</span>
            <span style={{ fontSize: '18px', fontWeight: '900', color: accent }}>${totalPrice.toLocaleString('es-AR')}</span>
          </div>
          <button onClick={() => setIsCheckoutOpen(true)} style={{ padding: '14px 24px', background: '#111', color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '900', cursor: 'pointer', whiteSpace: 'nowrap' }}>🛍️ Finalizar compra</button>
        </div>
      )}

      {/* CHECKOUT MODAL */}
      {isCheckoutOpen && (() => {
        let isOpen = false;
        const nowHour = new Date().getHours();
        const checkRange = (o, c) => (o <= c) ? (nowHour >= o && nowHour < c) : (nowHour >= o || nowHour < c);
        
        if (business?.open_time_hour === -1) {
          isOpen = true;
        } else {
          if (business?.open_time_hour != null && business?.close_time_hour != null) {
            isOpen = checkRange(business.open_time_hour, business.close_time_hour);
          }
          if (!isOpen && business?.open_time_hour_2 != null && business?.open_time_hour_2 !== -1 && business?.close_time_hour_2 != null) {
            isOpen = checkRange(business.open_time_hour_2, business.close_time_hour_2);
          }
        }

        const modalBg = isFashion||isGifts||isBeauty ? '#fff' : '#1a1a2e';
        const txtColor = isFashion||isGifts||isBeauty ? '#111' : '#fff';
        const inputBg = isFashion||isGifts||isBeauty ? '#f3f4f6' : '#2a2a3e';

        return (
          <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', flexDirection:'column', justifyContent:'flex-end', background:'rgba(0,0,0,0.6)' }} onClick={e => { if(e.target===e.currentTarget) setIsCheckoutOpen(false); }}>
            <div style={{ background: modalBg, color: txtColor, borderRadius: '24px 24px 0 0', padding: '24px', maxHeight: '90vh', overflowY: 'auto', animation: 'slideUp 0.3s ease' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
                <h2 style={{ margin:0, fontSize:'22px' }}>Finalizar Pedido</h2>
                <button onClick={()=>setIsCheckoutOpen(false)} style={{ background:'transparent', border:'none', fontSize:'24px', color:txtColor, cursor:'pointer' }}>×</button>
              </div>

              {!isOpen && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: '12px', marginBottom: '16px' }}>
                  <p style={{ margin:0, fontSize: '14px', color: '#dc2626', fontWeight: 'bold' }}>🕒 El horario de atención está cerrado.</p>
                  <p style={{ margin:'4px 0 0 0', fontSize:'12px', color:'#991b1b' }}>Solo puedes enviar un mensaje de consulta por WhatsApp.</p>
                </div>
              )}

              {isOpen && (
                <div style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
                  🕒 Abierto ({business?.open_time_hour === -1 ? '24h' : `${business?.open_time_hour}:00 a ${business?.close_time_hour}:00`})
                  {business?.open_time_hour_2 != null && business?.open_time_hour_2 !== -1 && ` y (${business.open_time_hour_2}:00 a ${business.close_time_hour_2}:00)`}
                </div>
              )}

              <div style={{ maxHeight: '30vh', overflowY: 'auto', marginBottom: '20px', paddingRight:'5px' }}>
                {cart.map((c, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', marginBottom:'10px', paddingBottom:'10px', borderBottom:`1px solid ${isFashion||isGifts||isBeauty?'#eee':'#333'}`, alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                       <span style={{ fontWeight:'900', fontSize:'14px' }}>{c.qty}x</span>
                       <div>
                         <span style={{ fontSize:'14px', fontWeight:'700' }}>{c.name}</span>
                         {c.variantName && <div style={{ fontSize:'12px', color:'#666' }}>Var: {c.variantName}</div>}
                       </div>
                    </div>
                    <span style={{ fontWeight:'700', fontSize:'14px' }}>${(c.price * c.qty).toLocaleString('es-AR')}</span>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'20px', fontSize:'18px', fontWeight:'900' }}>
                 <span>Total</span>
                 <span style={{ color:accent }}>${totalPrice.toLocaleString('es-AR')}</span>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:'12px', marginBottom:'24px' }}>
                <input type="text" placeholder="Tu Nombre completo" value={subName} onChange={e=>setSubName(e.target.value)}
                  style={{ width:'100%', padding:'16px', borderRadius:'12px', border:'none', background:inputBg, color:txtColor, fontSize:'15px', boxSizing:'border-box' }} />
                <input type="tel" placeholder="WhatsApp (ej: 3624123456)" value={subPhone} onChange={e=>setSubPhone(e.target.value)}
                  style={{ width:'100%', padding:'16px', borderRadius:'12px', border:'none', background:inputBg, color:txtColor, fontSize:'15px', boxSizing:'border-box' }} />
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                <button 
                  onClick={handleConfirmPlatform} 
                  disabled={!isOpen || isSubmitting}
                  style={{ padding: '16px', background: (!isOpen || isSubmitting) ? '#ccc' : '#25d366', color: (!isOpen || isSubmitting) ? '#666' : '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '900', cursor: (!isOpen || isSubmitting) ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(37,211,102,0.3)' }}
                >
                  {isSubmitting ? 'Procesando...' : '🛒 Enviar pedido por WhatsApp'}
                </button>
                <button onClick={handleSendWA} style={{ padding: '16px', background: 'transparent', color: txtColor, border: `2px solid ${isFashion||isGifts||isBeauty ? '#ddd' : '#333'}`, borderRadius: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                  💬 Solo Consultar por WhatsApp
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* INFO MODAL */}
      {showInfoModal && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', flexDirection:'column', justifyContent:'flex-end', background:'rgba(0,0,0,0.6)' }} onClick={e => { if(e.target===e.currentTarget) setShowInfoModal(false); }}>
          <div style={{ background: isFashion||isGifts||isBeauty ? '#fff' : '#1a1a2e', color: isFashion||isGifts||isBeauty ? '#111' : '#fff', borderRadius: '24px 24px 0 0', padding: '24px', maxHeight: '85vh', overflowY: 'auto', animation: 'slideUp 0.3s ease' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
              <h2 style={{ margin:0, fontSize:'22px', fontWeight: '900' }}>{shopName}</h2>
              <button onClick={() => setShowInfoModal(false)} style={{ background:'transparent', border:'none', fontSize:'24px', color: isFashion||isGifts||isBeauty ? '#111' : '#fff', cursor:'pointer' }}>×</button>
            </div>
            
            {business?.description && (
              <p style={{ margin: '0 0 16px 0', fontSize: '14px', lineHeight: '1.5', color: isFashion||isGifts||isBeauty ? '#555' : '#aaa' }}>{business.description}</p>
            )}

            {business?.address && (
              <p style={{ margin: '0 0 12px 0', fontSize: '15px' }}>📍 {business.address}</p>
            )}

            {(business?.open_time_hour !== undefined && business?.open_time_hour !== null) && (
              <p style={{ margin: '0 0 20px 0', fontSize: '15px' }}>
                🕒 {business.open_time_hour === -1 ? 'Abierto 24h' : `${business.open_time_hour}:00 - ${business.close_time_hour}:00`}
                {business?.open_time_hour_2 != null && business?.open_time_hour_2 !== -1 && ` y ${business.open_time_hour_2}:00 - ${business.close_time_hour_2}:00`}
              </p>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {business?.address && (
                <button onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(business.address)}`, '_blank')} style={{ padding: '16px', background: isFashion||isGifts||isBeauty ? '#f3f4f6' : '#2a2a3e', color: isFashion||isGifts||isBeauty ? '#111' : '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '900', cursor: 'pointer' }}>📍 Ver en mapa</button>
              )}
              {whatsappNumber && (
                <button onClick={() => window.open(`https://wa.me/${formatArgPhone(whatsappNumber)}`, '_blank')} style={{ padding: '16px', background: '#25d366', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '900', cursor: 'pointer' }}>💬 Contactar por WhatsApp</button>
              )}
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* MIS PEDIDOS VIEW */}
      {view === 'orders' && (
        <div style={{ maxWidth: '600px', margin: '20px auto', padding: '20px', color: (isFashion||isGifts||isBeauty) ? '#111' : 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '22px' }}>Mis Pedidos</h2>
            <button onClick={() => setView('shop')} style={{ background: 'transparent', border: 'none', color: accent, fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}>Volver</button>
          </div>
          
          {!activeOrder ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', background: cardBg, borderRadius: '16px', border: `1px solid ${(isFashion||isGifts||isBeauty) ? '#eee' : '#222'}` }}>
              <p style={{ color: '#888', margin: 0 }}>No tenés pedidos activos</p>
              <button onClick={() => setView('shop')} style={{ marginTop: '20px', padding: '12px 24px', background: accent, color: (isFashion||isGifts||isBeauty) ? '#fff' : '#000', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Seguir comprando</button>
            </div>
          ) : (
            <div style={{ padding: '20px', border: `1px solid ${accent}44`, borderRadius: '16px', background: cardBg }}>
               <h3 style={{ margin: '0 0 15px 0', fontSize: '22px' }}>Pedido #{activeOrder.display_number}</h3>
               
               <div style={{ display: 'inline-block', padding: '8px 16px', borderRadius: '10px', background: '#111', color: '#fff', fontWeight: 'bold', fontSize: '14px', marginBottom: '16px' }}>
                 {(activeOrder.status === 'PENDING_PAYMENT' || activeOrder.status === 'PENDING_PAYMENT_CASH' || activeOrder.status === 'PAID') ? 'Recibido' : 
                  activeOrder.status === 'IN_PREPARATION' ? 'Estamos preparando tu paquete' : 
                  activeOrder.status === 'READY' ? (activeOrder.order_type === 'DELIVERY' ? 'Listo para envío' : 'Listo para retirar') : 
                  activeOrder.status === 'DELIVERED' ? (activeOrder.order_type === 'DELIVERY' ? 'Enviado' : 'Entregado') : 'Cancelado'}
               </div>

               {activeOrder.status === 'READY' && <div style={{ color: '#22c55e', fontWeight: '900', marginBottom: '16px', fontSize: '15px' }}>✅ {activeOrder.order_type === 'DELIVERY' ? 'Tu pedido está preparado y listo para salir.' : 'Tu pedido está listo para retirar.'}</div>}
               {activeOrder.status === 'DELIVERED' && <div style={{ color: '#22c55e', fontWeight: '900', marginBottom: '16px', fontSize: '15px' }}>✔ {activeOrder.order_type === 'DELIVERY' ? 'Tu pedido ya fue enviado.' : 'Pedido entregado.'}</div>}

               <div style={{ borderTop: `1px solid ${(isFashion||isGifts||isBeauty) ? '#eee' : '#333'}`, paddingTop: '16px' }}>
                 <p style={{ fontWeight: 'bold', fontSize: '12px', color: '#888', textTransform: 'uppercase', margin: '0 0 12px 0' }}>Productos</p>
                 {activeOrder.items?.map((item, i) => (
                   <div key={i} style={{ display: 'flex', gap: '10px', fontSize: '15px', marginBottom: '10px' }}>
                     <span style={{ fontWeight: '900', color: accent }}>{item.quantity}x</span>
                     <span style={{ fontWeight: '600' }}>{item.name} {item.variant ? `(${item.variant})` : ''}</span>
                   </div>
                 ))}
               </div>

               <button onClick={() => setView('shop')} style={{ marginTop: '20px', width: '100%', padding: '16px', background: accent, color: (isFashion||isGifts||isBeauty)?'#fff':'#000', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}>Seguir comprando</button>
            </div>
          )}
        </div>
      )}

      {/* BOTTOM NAVIGATION BAR */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: isFashion||isGifts||isBeauty ? '#ffffff' : '#1a1a2e',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        padding: '12px 0 24px 0',
        borderTop: `1px solid ${isFashion||isGifts||isBeauty ? '#eee' : '#222'}`,
        zIndex: 1500,
        boxShadow: '0 -4px 10px rgba(0,0,0,0.05)'
      }}>
        <button onClick={() => setView('shop')} style={{ background: 'transparent', border: 'none', color: view === 'shop' ? accent : (isFashion||isGifts||isBeauty?'#888':'#666'), fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '22px' }}>🏠</span>
          Inicio
        </button>
        <button onClick={() => setView('orders')} style={{ background: 'transparent', border: 'none', color: view === 'orders' ? accent : (isFashion||isGifts||isBeauty?'#888':'#666'), fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', position: 'relative' }}>
          <span style={{ fontSize: '22px' }}>🧾</span>
          Mis pedidos
          {activeOrder && (
            <span style={{ position: 'absolute', top: -4, right: 12, background: '#22c55e', color: 'white', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
          )}
        </button>
      </div>

      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}
