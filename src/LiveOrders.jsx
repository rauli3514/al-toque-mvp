import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { printOrder } from './printOrder';
import { getLoyaltyTier, openWhatsAppLoyalty, fetchCustomer, upsertCustomer } from './customerRetention';

// All active statuses this view tracks
const IN_SCOPE = ['PENDING_PAYMENT', 'PENDING_PAYMENT_CASH', 'PAID', 'IN_PREPARATION', 'READY'];

// Status configuration: label, colors, next status, action button text
const S = {
  PENDING_PAYMENT: {
    label: 'Por cobrar', badge: '💳',
    color: '#f59e0b', bg: '#120d00', border: '#f59e0b44',
    next: 'PAID', action: '✅ Confirmar pago',
    sortWeight: 0,
  },
  PENDING_PAYMENT_CASH: {
    label: 'Por cobrar', badge: '💵',
    color: '#f59e0b', bg: '#120d00', border: '#f59e0b44',
    next: 'PAID', action: '✅ Confirmar pago (efectivo)',
    sortWeight: 0,
  },
  PAID: {
    label: 'Pagado', badge: '🟠',
    color: '#ff6b35', bg: '#150800', border: '#ff6b3544',
    next: 'IN_PREPARATION', action: '👨‍🍳 Iniciar preparación',
    sortWeight: 1,
  },
  IN_PREPARATION: {
    label: 'En preparación', badge: '🔵',
    color: '#0ea5e9', bg: '#00111f', border: '#0ea5e944',
    next: 'READY', action: '🔔 Marcar listo',
    sortWeight: 2,
  },
  READY: {
    label: 'Listo ✓', badge: '🟢',
    color: '#22c55e', bg: '#001409', border: '#22c55e66',
    next: 'DELIVERED', action: '✅ Entregar',
    sortWeight: 3,
  },
};

function elapsed(createdAt) {
  const diff = Math.floor((Date.now() - new Date(createdAt)) / 1000);
  if (diff < 60) return 'hace un momento';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `hace ${mins} min`;
  return `hace ${Math.floor(mins / 60)}h`;
}

function isUrgent(createdAt, status) {
  const mins = (Date.now() - new Date(createdAt)) / 60000;
  return ['PENDING_PAYMENT', 'PENDING_PAYMENT_CASH', 'PAID'].includes(status) && mins > 5;
}

// Demo Mode: auto-generate fake orders
async function spawnDemoOrder(businessId) {
  const { data: products } = await supabase
    .from('products').select('id, name, price')
    .eq('business_id', businessId).eq('available', true).is('deleted_at', null).limit(20);
  if (!products?.length) return;

  const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
  const picks   = shuffle(products).slice(0, Math.floor(Math.random() * 3) + 1);
  const total   = picks.reduce((a, p) => a + Number(p.price), 0);
  const NAMES   = ['Carlos R.', 'Mia T.', 'Juli P.', 'Facundo G.', 'Sol M.', 'Lautaro B.'];
  const table   = Math.random() > 0.5 ? Math.floor(Math.random() * 12) + 1 : null;

  const { data: order } = await supabase.from('orders').insert({
    business_id: businessId,
    customer_name: NAMES[Math.floor(Math.random() * NAMES.length)],
    table_number: table,
    order_type: table ? 'TABLE' : 'PICKUP',
    status: 'PAID',
    total,
    payment_method: Math.random() > 0.5 ? 'CASH' : 'TRANSFER',
  }).select().single();
  if (!order) return;

  await supabase.from('order_items').insert(
    picks.map(p => ({ order_id: order.id, product_id: p.id, quantity: 1, unit_price: Number(p.price), subtotal: Number(p.price) }))
  );
}

export default function LiveOrders({ businessId, business }) {
  const [orders, setOrders]       = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [tick, setTick]           = useState(0);
  const [demoMode, setDemoMode]   = useState(false);
  const [advancing, setAdvancing] = useState({});
  // Phone capture modal: { orderId, currentPhone }
  const [captureModal, setCaptureModal] = useState(null);
  // Loyalty toast: { phone, name, totalOrders }
  const [loyaltyToast, setLoyaltyToast] = useState(null);
  const demoRef = useRef(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchOrders();

    const channel = supabase.channel(`live-${businessId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `business_id=eq.${businessId}`,
      }, (payload) => {
        const status = (payload.new || payload.old)?.status;
        const id     = (payload.new || payload.old)?.id;
        if (!id) return;
        if (payload.eventType === 'DELETE' || !IN_SCOPE.includes(status)) {
          setOrders(prev => prev.filter(o => o.id !== id));
        } else {
          fetchSingleOrder(id);
        }
      }).subscribe();

    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => { supabase.removeChannel(channel); clearInterval(timer); };
  }, [businessId]);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(id, quantity, notes, products(name), order_item_modifiers(modifier_name))')
      .eq('business_id', businessId)
      .in('status', IN_SCOPE)
      .order('created_at', { ascending: true });
    if (data) setOrders(data);
  };

  const fetchSingleOrder = async (id) => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(id, quantity, notes, products(name), order_item_modifiers(modifier_name))')
      .eq('id', id).single();
    if (!data) return;
    const status = data.status;
    if (!status || !IN_SCOPE.includes(status)) {
      setOrders(prev => prev.filter(o => o.id !== id));
      return;
    }
    setOrders(prev => {
      const exists = prev.find(o => o.id === id);
      return exists
        ? prev.map(o => o.id === id ? data : o)
        : [...prev, data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    });
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const advance = async (order) => {
    const cfg = S[order.status];
    if (!cfg) return;

    // If advancing to PAID and no phone → offer to capture
    if (cfg.next === 'PAID' && !order.customer_phone) {
      setCaptureModal({ orderId: order.id, currentPhone: '' });
      return;
    }

    await doAdvance(order);
  };

  const doAdvance = async (order, overrides = {}) => {
    const cfg = S[order.status];
    if (!cfg) return;
    setAdvancing(prev => ({ ...prev, [order.id]: true }));

    // Save overrides (phone/name) to order first
    if (overrides.customer_phone || overrides.customer_name) {
      await supabase.from('orders').update(overrides).eq('id', order.id);
    }

    await supabase.from('orders').update({ status: cfg.next }).eq('id', order.id);
    setAdvancing(prev => { const n = { ...prev }; delete n[order.id]; return n; });

    // Post-PAID: notify customer!
    if (cfg.next === 'PAID') {
      const phone = overrides.customer_phone || order.customer_phone;
      if (phone) {
        const customer = await fetchCustomer(supabase, { businessId: order.business_id, phone });
        setLoyaltyToast({ 
          phone, 
          name: overrides.customer_name || order.customer_name, 
          totalOrders: (customer?.total_orders || 0) + 1,
          type: 'PAID'
        });
        setTimeout(() => setLoyaltyToast(null), 10000);
      }
    }

    // Post-READY: notify customer!
    if (cfg.next === 'READY') {
      const phone = order.customer_phone;
      if (phone) {
        const customer = await fetchCustomer(supabase, { businessId: order.business_id, phone });
        setLoyaltyToast({
          phone,
          name: order.customer_name,
          totalOrders: customer?.total_orders || 1,
          type: 'READY'
        });
        setTimeout(() => setLoyaltyToast(null), 15000);
      }
    }
  };

  const cancelOrder = async (id) => {
    if (window.confirm('¿Cancelar este pedido?')) {
      await supabase.from('orders').update({ status: 'CANCELLED' }).eq('id', id);
    }
  };

  const handlePrint = async (order) => {
    await printOrder(supabase, order.id, business?.name || 'AlToque', business?.paper_width || 80);
  };

  // ── Demo mode ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (demoMode) {
      const fire = () => {
        spawnDemoOrder(businessId);
        demoRef.current = setTimeout(fire, 10000 + Math.random() * 10000);
      };
      fire();
    } else {
      clearTimeout(demoRef.current);
    }
    return () => clearTimeout(demoRef.current);
  }, [demoMode, businessId]);

  // ── Filtered & sorted orders ───────────────────────────────────────────────
  const visible = orders.filter(o => {
    if (filter === 'ALL') return true;
    if (filter === 'PENDING_PAYMENT') {
      return o.status === 'PENDING_PAYMENT' || o.status === 'PENDING_PAYMENT_CASH';
    }
    return o.status === filter;
  });

  const countOf = (s) => orders.filter(o => {
    if (s === 'PENDING_PAYMENT') {
      return o.status === 'PENDING_PAYMENT' || o.status === 'PENDING_PAYMENT_CASH';
    }
    return o.status === s;
  }).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  const FILTERS = [
    { key: 'ALL',            label: 'Todos',          count: orders.length },
    { key: 'PENDING_PAYMENT', label: 'Por cobrar',    count: countOf('PENDING_PAYMENT') },
    { key: 'PAID',            label: 'Pagados',       count: countOf('PAID') },
    { key: 'IN_PREPARATION',  label: 'En prep',       count: countOf('IN_PREPARATION') },
    { key: 'READY',           label: 'Listos',        count: countOf('READY') },
  ];

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: 'white', fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: '40px' }}>

      {/* ── HEADER ── */}
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #111', background: '#0c0c0c' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: 'white' }}>
            Pedidos en vivo
            {orders.length > 0 && (
              <span style={{ marginLeft: '10px', background: '#FF4500', color: 'white', fontSize: '13px', padding: '2px 9px', borderRadius: '20px', fontWeight: '800' }}>
                {orders.length}
              </span>
            )}
          </h2>
        </div>
        <button
          onClick={() => setDemoMode(d => !d)}
          style={{
            padding: '7px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: '800', transition: 'all 0.2s',
            background: demoMode ? '#FF4500' : '#1e1e1e',
            color: demoMode ? 'white' : '#555',
          }}
        >
          {demoMode ? '⏹ Demo' : '🎬 Demo'}
        </button>
      </div>

      {/* ── FILTER CHIPS ── */}
      <div style={{ display: 'flex', gap: '8px', padding: '12px 14px', overflowX: 'auto', borderBottom: '1px solid #111' }}>
        {FILTERS.map(f => {
          const isActive = filter === f.key;
          const cfgColor = f.key !== 'ALL' ? S[f.key]?.color : '#FF4500';
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{
                padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap', fontWeight: '700', fontSize: '13px', transition: 'all 0.2s',
                background: isActive ? (cfgColor || '#FF4500') : '#111',
                color: isActive ? 'white' : '#555',
                boxShadow: isActive ? `0 2px 10px ${cfgColor}44` : 'none',
              }}>
              {f.label}
              {f.count > 0 && <span style={{ marginLeft: '5px', opacity: 0.8 }}>({f.count})</span>}
            </button>
          );
        })}
      </div>

      {/* ── EMPTY STATE ── */}
      {visible.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '120px', gap: '12px' }}>
          <div style={{ fontSize: '56px' }}>✅</div>
          <p style={{ color: '#2a2a2a', fontSize: '18px', fontWeight: '700', margin: 0 }}>
            {filter === 'ALL' ? 'Sin pedidos activos' : `Sin pedidos en "${FILTERS.find(f => f.key === filter)?.label}"`}
          </p>
          {!demoMode && (
            <button onClick={() => setDemoMode(true)}
              style={{ marginTop: '8px', padding: '10px 20px', background: '#1a1a1a', color: '#555', border: '1px solid #222', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>
              🎬 Activar modo demo
            </button>
          )}
        </div>
      )}

      {/* ── ORDER CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '14px', padding: '14px' }}>
        {visible.map(order => {
          const cfg     = S[order.status];
          if (!cfg) return null;
          const urgent  = isUrgent(order.created_at, order.status);
          const loading = advancing[order.id];

          return (
            <div key={order.id} style={{
              background: cfg.bg,
              border: `2px solid ${urgent && order.status !== 'READY' ? '#ff4500' : cfg.color}`,
              borderRadius: '16px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0',
              boxShadow: order.status === 'READY' ? `0 0 24px ${cfg.color}33` : 'none',
              transition: 'all 0.3s',
              opacity: loading ? 0.7 : 1,
            }}>

              {/* L1: Number + Location */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '64px', fontWeight: '900', color: 'white', letterSpacing: '-3px', lineHeight: 0.9 }}>
                    #{order.display_number}
                  </div>
                  <div style={{ marginTop: '6px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: cfg.color, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {cfg.badge} {cfg.label}
                    </span>
                    {urgent && <span style={{ fontSize: '11px', color: '#ff4500', fontWeight: '800' }}>⚠️ esperando</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{
                    background: order.table_number ? '#17a2b822' : '#1a1a1a',
                    color: order.table_number ? '#17a2b8' : '#444',
                    padding: '7px 12px', borderRadius: '8px', fontWeight: '800', fontSize: '14px',
                    border: `1px solid ${order.table_number ? '#17a2b844' : '#222'}`,
                  }}>
                    {order.table_number ? `Mesa ${order.table_number}` : 'Barra'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#333', textAlign: 'right' }}>
                    ⏱ {elapsed(order.created_at)}
                  </div>
                </div>
              </div>

              {/* L3+4: Products + modifiers */}
              <div style={{ borderTop: '1px solid #111', paddingTop: '12px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(order.order_items || []).map((item, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontSize: '18px', fontWeight: '900', color: cfg.color, minWidth: '24px' }}>{item.quantity}×</span>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: '#f0f0f0' }}>{item.products?.name || '—'}</span>
                    </div>
                    {item.order_item_modifiers?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingLeft: '30px', marginTop: '3px' }}>
                        {item.order_item_modifiers.map((m, j) => (
                          <span key={j} style={{ fontSize: '11px', color: '#555', background: '#111', padding: '2px 8px', borderRadius: '20px', border: '1px solid #1e1e1e' }}>
                            {m.modifier_name}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <p style={{ margin: '3px 0 0 30px', fontSize: '12px', color: '#444', fontStyle: 'italic' }}>📝 {item.notes}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', color: '#333', fontWeight: '600' }}>
                  {order.payment_method === 'CASH' ? '💵 Efectivo' : '📲 Digital'}
                </span>
                <span style={{ fontSize: '16px', fontWeight: '900', color: '#22c55e' }}>
                  ${Number(order.total).toLocaleString('es-AR')}
                </span>
              </div>

              {/* L2: Action + secondary actions */}
              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                {/* Cancel (only for pending/paid) */}
                {['PENDING_PAYMENT', 'PENDING_PAYMENT_CASH', 'PAID'].includes(order.status) && (
                  <button onClick={() => cancelOrder(order.id)}
                    style={{ padding: '12px', background: '#111', color: '#444', border: '1px solid #1e1e1e', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700', flexShrink: 0 }}>
                    ✕
                  </button>
                )}

                {/* Print button */}
                <button onClick={() => handlePrint(order)}
                  style={{ padding: '12px', background: '#111', color: '#444', border: '1px solid #1e1e1e', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', flexShrink: 0 }}>
                  🖨️
                </button>

                {/* Main action */}
                <button
                  onClick={() => advance(order)}
                  disabled={loading}
                  style={{
                    flex: 1, padding: '14px',
                    background: loading ? '#111' : cfg.color,
                    color: loading ? '#555' : (order.status === 'READY' ? '#000' : '#fff'),
                    border: 'none', borderRadius: '10px',
                    fontSize: '15px', fontWeight: '900',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: order.status === 'READY' ? `0 4px 20px ${cfg.color}44` : 'none',
                    transition: 'all 0.2s',
                  }}
                  onMouseDown={e => { if (!loading) e.currentTarget.style.transform = 'scale(0.97)'; }}
                  onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  {loading ? '...' : cfg.action}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {/* ── PHONE CAPTURE MODAL ── */}
      {captureModal && (() => {
        const order = orders.find(o => o.id === captureModal.orderId);
        if (!order) return null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div style={{ background: '#111', borderRadius: '24px 24px 0 0', padding: '28px 20px 40px', width: '100%', maxWidth: '480px', animation: 'slideUp 0.3s ease' }}>
              <p style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: '900', color: 'white' }}>💳 Confirmar pago #{order.display_number}</p>
              <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#555' }}>¿El cliente dejó su WhatsApp? (opcional — suma puntos de fidelidad)</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                <input type="text" placeholder="Nombre del cliente"
                  value={captureModal.name || ''}
                  onChange={e => setCaptureModal(prev => ({ ...prev, name: e.target.value }))}
                  style={{ padding: '12px 14px', background: '#1a1a1a', border: '1px solid #222', borderRadius: '10px', color: 'white', fontSize: '15px', outline: 'none' }}
                />
                <input type="tel" placeholder="WhatsApp (ej: 3624123456)"
                  value={captureModal.currentPhone}
                  onChange={e => setCaptureModal(prev => ({ ...prev, currentPhone: e.target.value }))}
                  style={{ padding: '12px 14px', background: '#1a1a1a', border: '1px solid #222', borderRadius: '10px', color: 'white', fontSize: '15px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => {
                  const o = orders.find(x => x.id === captureModal.orderId);
                  setCaptureModal(null);
                  if (o) doAdvance(o);
                }}
                  style={{ flex: 1, padding: '14px', background: '#1a1a1a', color: '#666', border: '1px solid #222', borderRadius: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                  Saltar
                </button>
                <button onClick={() => {
                  const o = orders.find(x => x.id === captureModal.orderId);
                  const overrides = {};
                  if (captureModal.currentPhone?.trim()) overrides.customer_phone = captureModal.currentPhone.replace(/\D/g, '');
                  if (captureModal.name?.trim()) overrides.customer_name = captureModal.name.trim();
                  setCaptureModal(null);
                  if (o) doAdvance(o, overrides);
                }}
                  style={{ flex: 2, padding: '14px', background: '#f59e0b', color: 'black', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '900', cursor: 'pointer' }}>
                  ✅ Confirmar pago
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── LOYALTY TOAST ── */}
      {loyaltyToast && loyaltyToast.phone && (() => {
        const isReady = loyaltyToast.type === 'READY';
        return (
          <div style={{ position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 4000, background: isReady ? '#001a2c' : '#0f1f0f', border: `1px solid ${isReady ? '#003a5c' : '#1a3a1a'}`, borderRadius: '16px', padding: '16px 18px', maxWidth: '340px', width: 'calc(100% - 32px)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)', animation: 'slideUp 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <p style={{ margin: '0 0 3px 0', fontSize: '14px', fontWeight: '900', color: isReady ? '#38bdf8' : '#4ade80' }}>
                  {isReady ? '🔔 ¡Pedido listo!' : '✅ Pago confirmado'}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: isReady ? '#7dd3fc' : '#2a6a2a' }}>
                  {loyaltyToast.name || 'Cliente'} — {loyaltyToast.totalOrders}º pedido
                </p>
              </div>
              <button onClick={() => setLoyaltyToast(null)}
                style={{ background: 'transparent', border: 'none', color: '#222', fontSize: '16px', cursor: 'pointer', padding: '0 0 0 10px' }}>✕</button>
            </div>
            
            <button onClick={() => {
              const msg = isReady 
                ? `¡Hola ${loyaltyToast.name || ''}! Tu pedido ya está listo para retirar en *${business?.name}* 🍺`
                : openWhatsAppLoyalty({ phone: loyaltyToast.phone, businessName: business?.name || 'AlToque', customerName: loyaltyToast.name, totalOrders: loyaltyToast.totalOrders });
              
              if (isReady) {
                const url = `https://wa.me/${loyaltyToast.phone}?text=${encodeURIComponent(msg)}`;
                window.open(url, '_blank');
              }
            }}
              style={{ width: '100%', padding: '11px', background: '#25d366', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <span>📲</span> {isReady ? 'Avisar por WhatsApp' : 'Enviar mensaje de puntos'}
            </button>
          </div>
        );
      })()}

      <style>{`@keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}
