import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function KitchenView({ businessId }) {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    fetchOrders();
    const channel = supabase.channel('kitchen-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `business_id=eq.${businessId}` }, (payload) => {
        if (payload.eventType === 'INSERT') fetchSingleOrder(payload.new.id);
        else if (payload.eventType === 'UPDATE') {
          setOrders(prev => {
            const updated = { ...prev.find(o => o.id === payload.new.id), ...payload.new };
            const inScope = ['PAID', 'IN_PREPARATION'].includes(updated.status);
            if (!inScope) return prev.filter(o => o.id !== payload.new.id);
            return prev.map(o => o.id === payload.new.id ? updated : o);
          });
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [businessId]);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders').select('*, order_items(quantity, unit_price, products(name, category_id))')
      .eq('business_id', businessId)
      .in('status', ['PAID', 'IN_PREPARATION'])
      .order('created_at', { ascending: true });
    if (data) setOrders(data);
  };

  const fetchSingleOrder = async (id) => {
    const { data } = await supabase.from('orders').select('*, order_items(quantity, unit_price, products(name, category_id))').eq('id', id).single();
    if (data && ['PAID', 'IN_PREPARATION'].includes(data.status)) {
      setOrders(prev => prev.find(o => o.id === id) ? prev.map(o => o.id === id ? data : o) : [...prev, data]);
    }
  };

  const updateStatus = async (id, status) => {
    await supabase.from('orders').update({ status }).eq('id', id);
  };

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', padding: '15px', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '3px solid #b8860b', paddingBottom: '10px' }}>
        <h1 style={{ margin: 0, color: '#b8860b', fontSize: '28px', fontWeight: '900' }}>🔥 COCINA</h1>
        <span style={{ background: '#b8860b', color: 'black', fontWeight: '900', padding: '8px 15px', borderRadius: '8px', fontSize: '20px' }}>{orders.length} pedidos</span>
      </div>

      {orders.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: '100px', color: '#444', fontSize: '24px' }}>
          ✅ Sin pedidos pendientes
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
        {orders.map(order => (
          <div key={order.id} style={{
            background: order.status === 'IN_PREPARATION' ? '#1a1200' : '#111',
            border: `3px solid ${order.status === 'IN_PREPARATION' ? '#b8860b' : '#333'}`,
            borderRadius: '12px', padding: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <span style={{ fontSize: '60px', fontWeight: '900', color: 'white', lineHeight: 1 }}>#{order.display_number}</span>
              <span style={{ background: order.table_number ? '#17a2b8' : '#555', color: 'white', padding: '6px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', textAlign: 'center' }}>
                {order.table_number ? `Mesa ${order.table_number}` : 'Barra'}
              </span>
            </div>

            <div style={{ borderTop: '1px solid #333', paddingTop: '12px', marginBottom: '15px' }}>
              {order.order_items?.map((item, i) => (
                <div key={i} style={{ fontSize: '18px', marginBottom: '6px', color: '#eee' }}>
                  <span style={{ color: '#b8860b', fontWeight: '900', marginRight: '8px' }}>{item.quantity}x</span>
                  {item.products?.name}
                </div>
              ))}
            </div>

            {order.status === 'PAID' && (
              <button onClick={() => updateStatus(order.id, 'IN_PREPARATION')}
                style={{ width: '100%', padding: '15px', background: '#b8860b', color: 'black', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: '900', cursor: 'pointer' }}>
                👨‍🍳 EN PREPARACIÓN
              </button>
            )}
            {order.status === 'IN_PREPARATION' && (
              <button onClick={() => updateStatus(order.id, 'READY')}
                style={{ width: '100%', padding: '15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: '900', cursor: 'pointer' }}>
                ✅ LISTO
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
