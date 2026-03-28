import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function BarView({ businessId }) {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    fetchOrders();
    const channel = supabase.channel('bar-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `business_id=eq.${businessId}` }, (payload) => {
        if (payload.eventType === 'INSERT') fetchSingleOrder(payload.new.id);
        else if (payload.eventType === 'UPDATE') {
          setOrders(prev => {
            const updated = { ...prev.find(o => o.id === payload.new.id), ...payload.new };
            const inScope = ['IN_PREPARATION', 'READY'].includes(updated.status);
            if (!inScope) return prev.filter(o => o.id !== payload.new.id);
            return prev.map(o => o.id === payload.new.id ? updated : o);
          });
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [businessId]);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders').select('*, order_items(quantity, products(name))')
      .eq('business_id', businessId)
      .in('status', ['IN_PREPARATION', 'READY'])
      .order('created_at', { ascending: true });
    if (data) setOrders(data);
  };

  const fetchSingleOrder = async (id) => {
    const { data } = await supabase.from('orders').select('*, order_items(quantity, products(name))').eq('id', id).single();
    if (data && ['IN_PREPARATION', 'READY'].includes(data.status)) {
      setOrders(prev => prev.find(o => o.id === id) ? prev.map(o => o.id === id ? data : o) : [...prev, data]);
    }
  };

  const updateStatus = async (id, status) => {
    await supabase.from('orders').update({ status }).eq('id', id);
  };

  return (
    <div style={{ background: '#060d1a', minHeight: '100vh', padding: '15px', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '3px solid #17a2b8', paddingBottom: '10px' }}>
        <h1 style={{ margin: 0, color: '#17a2b8', fontSize: '28px', fontWeight: '900' }}>🍺 BARRA</h1>
        <span style={{ background: '#17a2b8', color: 'black', fontWeight: '900', padding: '8px 15px', borderRadius: '8px', fontSize: '20px' }}>{orders.length} pedidos</span>
      </div>

      {orders.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: '100px', color: '#444', fontSize: '24px' }}>
          ✅ Sin pedidos pendientes
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
        {orders.map(order => (
          <div key={order.id} style={{
            background: order.status === 'READY' ? '#002200' : '#0a1020',
            border: `3px solid ${order.status === 'READY' ? '#28a745' : '#17a2b8'}`,
            borderRadius: '12px', padding: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '70px', fontWeight: '900', color: 'white', lineHeight: 1 }}>#{order.display_number}</span>
              <span style={{ background: order.table_number ? '#17a2b8' : '#333', color: 'white', padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px' }}>
                {order.table_number ? `Mesa ${order.table_number}` : 'Barra'}
              </span>
            </div>

            <div style={{ borderTop: '1px solid #222', paddingTop: '12px', marginBottom: '15px' }}>
              {order.order_items?.map((item, i) => (
                <div key={i} style={{ fontSize: '20px', marginBottom: '8px', color: '#eee' }}>
                  <span style={{ color: '#17a2b8', fontWeight: '900', marginRight: '8px' }}>{item.quantity}x</span>
                  {item.products?.name}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {order.status !== 'READY' && (
                <button onClick={() => updateStatus(order.id, 'READY')}
                  style={{ flex: 1, padding: '15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: '900', cursor: 'pointer' }}>
                  🔔 LISTO
                </button>
              )}
              {order.status === 'READY' && (
                <button onClick={() => updateStatus(order.id, 'DELIVERED')}
                  style={{ flex: 1, padding: '15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '900', cursor: 'pointer', opacity: 0.7 }}>
                  ✅ ENTREGADO
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
