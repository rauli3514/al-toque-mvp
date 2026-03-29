import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const IN_SCOPE = ['PAID', 'IN_PREPARATION'];

function elapsed(createdAt) {
  const diff = Math.floor((Date.now() - new Date(createdAt)) / 1000);
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m`;
}

function isUrgent(createdAt, status) {
  const mins = (Date.now() - new Date(createdAt)) / 60000;
  return status === 'PAID' && mins > 5;
}

export default function KitchenView({ businessId }) {
  const [orders, setOrders] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetchOrders();
    const channel = supabase.channel(`kitchen-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `business_id=eq.${businessId}` }, (payload) => {
        const status = (payload.new || payload.old)?.status;
        const id = (payload.new || payload.old)?.id;
        if (!id) return;
        if (payload.eventType === 'DELETE' || !IN_SCOPE.includes(status)) {
          setOrders(prev => prev.filter(o => o.id !== id));
        } else {
          fetchSingleOrder(id);
        }
      }).subscribe();

    // Timer to refresh elapsed times every 30s
    const timer = setInterval(() => setTick(t => t + 1), 30000);
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
    if (!IN_SCOPE.includes(data.status)) { setOrders(prev => prev.filter(o => o.id !== id)); return; }
    setOrders(prev => {
      const exists = prev.find(o => o.id === id);
      return exists
        ? prev.map(o => o.id === id ? data : o)
        : [...prev, data].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    });
  };

  const updateStatus = async (id, status) => {
    await supabase.from('orders').update({ status }).eq('id', id);
  };

  const kitchenOrders = orders.slice(0, 8);

  const inPrep  = orders.filter(o => o.status === 'IN_PREPARATION').length;
  const waiting = orders.filter(o => o.status === 'PAID').length;

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', padding: '16px', color: 'white', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '3px solid #d4a017' }}>
        <div>
          <h1 style={{ margin: 0, color: '#d4a017', fontSize: '26px', fontWeight: '900', letterSpacing: '-0.5px' }}>🔥 COCINA</h1>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#555', fontWeight: '600' }}>
            {waiting > 0 && <span style={{ color: '#ff6b35', marginRight: '12px' }}>⏳ {waiting} esperando</span>}
            {inPrep > 0 && <span style={{ color: '#d4a017' }}>👨‍🍳 {inPrep} en preparación</span>}
            {kitchenOrders.length === 0 && <span style={{ color: '#444' }}>Sin pedidos pendientes</span>}
          </p>
        </div>
        <div style={{ background: kitchenOrders.length > 0 ? '#d4a017' : '#222', color: kitchenOrders.length > 0 ? '#000' : '#555', fontWeight: '900', padding: '10px 18px', borderRadius: '10px', fontSize: '26px', minWidth: '50px', textAlign: 'center', transition: 'all 0.3s' }}>
          {kitchenOrders.length}
        </div>
      </div>

      {/* EMPTY STATE */}
      {kitchenOrders.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '120px', gap: '12px' }}>
          <div style={{ fontSize: '60px' }}>✅</div>
          <p style={{ color: '#333', fontSize: '20px', fontWeight: '700', margin: 0 }}>Todo al día</p>
        </div>
      )}

      {/* ORDER CARDS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {kitchenOrders.map(order => {
          const urgent = isUrgent(order.created_at, order.status);
          const isPaid = order.status === 'PAID';
          const isPrep = order.status === 'IN_PREPARATION';

          const borderColor = isPrep ? '#d4a017' : urgent ? '#ff4500' : '#2a2a2a';
          const bgColor     = isPrep ? '#140f00' : urgent ? '#150500' : '#111';
          const accentColor = isPrep ? '#d4a017' : '#555';

          return (
            <div key={order.id} style={{
              background: bgColor,
              border: `3px solid ${borderColor}`,
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0',
              transition: 'border-color 0.3s',
              boxShadow: isPrep ? '0 0 20px rgba(212,160,23,0.15)' : urgent ? '0 0 20px rgba(255,69,0,0.15)' : 'none',
            }}>

              {/* ── LEVEL 1: NUMBER + TABLE ─── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ lineHeight: 1 }}>
                  <div style={{ fontSize: '72px', fontWeight: '900', color: 'white', letterSpacing: '-3px', lineHeight: 0.9 }}>
                    #{order.display_number}
                  </div>
                  <div style={{ fontSize: '12px', color: accentColor, fontWeight: '700', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    ⏱ {elapsed(order.created_at)}
                    {isPrep && ' · EN PREP'}
                    {isPaid && urgent && ' · ⚠️ ESPERANDO'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    background: order.table_number ? '#17a2b8' : '#1e1e1e',
                    color: order.table_number ? 'white' : '#555',
                    padding: '8px 14px', borderRadius: '10px', fontWeight: '800', fontSize: '15px',
                    border: order.table_number ? 'none' : '1px solid #2a2a2a'
                  }}>
                    {order.table_number ? `Mesa ${order.table_number}` : 'Sin mesa'}
                  </div>
                </div>
              </div>

              {/* ── LEVEL 3 + 4: PRODUCTS ─── */}
              <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: '14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {order.order_items.map((item, i) => (
                  <div key={i}>
                    {/* Product name — Level 3 */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '22px', fontWeight: '900', color: accentColor, minWidth: '28px' }}>{item.quantity}×</span>
                      <span style={{ fontSize: '18px', fontWeight: '700', color: '#f0f0f0' }}>{item.products?.name || '—'}</span>
                    </div>
                    {/* Modifiers — Level 4 */}
                    {item.order_item_modifiers?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingLeft: '36px', marginTop: '5px' }}>
                        {item.order_item_modifiers.map((m, j) => (
                          <span key={j} style={{ fontSize: '12px', color: '#888', background: '#1a1a1a', padding: '3px 9px', borderRadius: '20px', border: '1px solid #2a2a2a' }}>
                            {m.modifier_name}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Notes — Level 4 */}
                    {item.notes && (
                      <p style={{ margin: '5px 0 0 36px', fontSize: '13px', color: '#666', fontStyle: 'italic' }}>
                        📝 {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* ── LEVEL 2: ACTION BUTTON ─── */}
              {isPaid && (
                <button onClick={() => updateStatus(order.id, 'IN_PREPARATION')}
                  style={{ width: '100%', padding: '18px', background: '#d4a017', color: '#000', border: 'none', borderRadius: '12px', fontSize: '20px', fontWeight: '900', cursor: 'pointer', letterSpacing: '0.5px', transition: 'transform 0.1s', marginTop: 'auto' }}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  👨‍🍳 EN PREPARACIÓN
                </button>
              )}
              {isPrep && (
                <button onClick={() => updateStatus(order.id, 'READY')}
                  style={{ width: '100%', padding: '18px', background: '#22c55e', color: '#000', border: 'none', borderRadius: '12px', fontSize: '22px', fontWeight: '900', cursor: 'pointer', letterSpacing: '0.5px', boxShadow: '0 4px 20px rgba(34,197,94,0.3)', transition: 'transform 0.1s', marginTop: 'auto' }}
                  onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                  onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  ✅ LISTO
                </button>
              )}
            </div>
          );
        })}
      </div>

      {orders.length > 8 && (
        <p style={{ textAlign: 'center', marginTop: '20px', color: '#555', fontSize: '14px', fontWeight: '600' }}>
          +{orders.length - 8} pedidos más — hacé scroll ↓
        </p>
      )}
    </div>
  );
}
