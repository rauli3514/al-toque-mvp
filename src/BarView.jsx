import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// Bar sees orders from PAID onwards (simultaneously with kitchen)
const IN_SCOPE = ['PAID', 'IN_PREPARATION', 'READY'];

function elapsed(createdAt) {
  const diff = Math.floor((Date.now() - new Date(createdAt)) / 1000);
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m`;
}

export default function BarView({ businessId }) {
  const [orders, setOrders] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetchOrders();
    const channel = supabase.channel(`bar-${businessId}`)
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

  const visibleOrders = orders.slice(0, 8);

  const countByStatus = (s) => orders.filter(o => o.status === s).length;

  return (
    <div style={{ background: '#05080f', minHeight: '100vh', padding: '16px', color: 'white', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '3px solid #0ea5e9' }}>
        <div>
          <h1 style={{ margin: 0, color: '#0ea5e9', fontSize: '26px', fontWeight: '900', letterSpacing: '-0.5px' }}>🍺 BARRA</h1>
          <p style={{ margin: '2px 0 0 0', fontSize: '12px', fontWeight: '600' }}>
            {countByStatus('PAID') > 0 && (
              <span style={{ color: '#f59e0b', marginRight: '12px' }}>⏳ {countByStatus('PAID')} nuevos</span>
            )}
            {countByStatus('IN_PREPARATION') > 0 && (
              <span style={{ color: '#0ea5e9', marginRight: '12px' }}>🔄 {countByStatus('IN_PREPARATION')} preparando</span>
            )}
            {countByStatus('READY') > 0 && (
              <span style={{ color: '#22c55e' }}>🔔 {countByStatus('READY')} listos</span>
            )}
            {orders.length === 0 && <span style={{ color: '#444' }}>Sin pedidos pendientes</span>}
          </p>
        </div>
        <div style={{
          background: orders.length > 0 ? '#0ea5e9' : '#0a1020',
          color: orders.length > 0 ? '#000' : '#555',
          fontWeight: '900', padding: '10px 18px', borderRadius: '10px',
          fontSize: '26px', minWidth: '50px', textAlign: 'center', transition: 'all 0.3s'
        }}>
          {orders.length}
        </div>
      </div>

      {/* EMPTY STATE */}
      {orders.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '120px', gap: '12px' }}>
          <div style={{ fontSize: '60px' }}>✅</div>
          <p style={{ color: '#333', fontSize: '20px', fontWeight: '700', margin: 0 }}>Barra libre</p>
        </div>
      )}

      {/* ORDER CARDS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {visibleOrders.map(order => {
          const isPaid  = order.status === 'PAID';
          const isPrep  = order.status === 'IN_PREPARATION';
          const isReady = order.status === 'READY';

          const borderColor = isReady ? '#22c55e' : isPaid ? '#f59e0b' : '#0ea5e9';
          const bgColor     = isReady ? '#001a0a' : isPaid ? '#120a00' : '#06101e';
          const accentColor = isReady ? '#22c55e' : isPaid ? '#f59e0b' : '#0ea5e9';

          return (
            <div key={order.id} style={{
              background: bgColor,
              border: `3px solid ${borderColor}`,
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              transition: 'border-color 0.3s',
              boxShadow: isReady
                ? '0 0 24px rgba(34,197,94,0.15)'
                : isPaid
                  ? '0 0 24px rgba(245,158,11,0.15)'
                  : '0 0 16px rgba(14,165,233,0.1)',
            }}>

              {/* ── LEVEL 1: NUMBER + TABLE ─── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '72px', fontWeight: '900', color: 'white', letterSpacing: '-3px', lineHeight: 0.9 }}>
                    #{order.display_number}
                  </div>
                  <div style={{ fontSize: '12px', color: accentColor, fontWeight: '700', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    ⏱ {elapsed(order.created_at)}
                    {isPaid  && ' · NUEVO'}
                    {isPrep  && ' · PREPARANDO'}
                    {isReady && ' · LISTO P/ ENTREGAR'}
                  </div>
                </div>
                <div style={{
                  background: order.table_number ? '#0ea5e922' : '#0e0e0e',
                  color: order.table_number ? '#0ea5e9' : '#444',
                  padding: '8px 14px', borderRadius: '10px', fontWeight: '800', fontSize: '15px',
                  border: `1px solid ${order.table_number ? '#0ea5e944' : '#1a1a1a'}`
                }}>
                  {order.table_number ? `📍 Mesa ${order.table_number}` : 'Sin mesa'}
                </div>
              </div>

              {/* ── LEVEL 3 + 4: PRODUCTS ─── */}
              <div style={{ borderTop: '1px solid #0f1a2a', paddingTop: '14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(order.order_items || []).map((item, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '22px', fontWeight: '900', color: accentColor, minWidth: '28px' }}>{item.quantity}×</span>
                      <span style={{ fontSize: '18px', fontWeight: '700', color: '#f0f0f0' }}>{item.products?.name || '—'}</span>
                    </div>
                    {item.order_item_modifiers?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingLeft: '36px', marginTop: '5px' }}>
                        {item.order_item_modifiers.map((m, j) => (
                          <span key={j} style={{ fontSize: '12px', color: '#666', background: '#0a1020', padding: '3px 9px', borderRadius: '20px', border: '1px solid #111e30' }}>
                            {m.modifier_name}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <p style={{ margin: '5px 0 0 36px', fontSize: '13px', color: '#555', fontStyle: 'italic' }}>
                        📝 {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* ── LEVEL 2: ACTION BUTTON ─── */}
              <div style={{ marginTop: 'auto' }}>
                {(isPaid || isPrep) && (
                  <button
                    onClick={() => updateStatus(order.id, 'READY')}
                    style={{ width: '100%', padding: '18px', background: '#22c55e', color: '#000', border: 'none', borderRadius: '12px', fontSize: '20px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 20px rgba(34,197,94,0.2)', transition: 'transform 0.1s' }}
                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    🔔 LISTO
                  </button>
                )}
                {isReady && (
                  <button
                    onClick={() => updateStatus(order.id, 'DELIVERED')}
                    style={{ width: '100%', padding: '18px', background: 'transparent', color: '#22c55e', border: '3px solid #22c55e', borderRadius: '12px', fontSize: '18px', fontWeight: '900', cursor: 'pointer', transition: 'transform 0.1s' }}
                    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                    onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    ✅ ENTREGADO
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {orders.length > 8 && (
        <p style={{ textAlign: 'center', marginTop: '20px', color: '#444', fontSize: '14px', fontWeight: '600' }}>
          +{orders.length - 8} pedidos más — hacé scroll ↓
        </p>
      )}
    </div>
  );
}
