import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function CashierView({ businessId }) {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    fetchOrders();
    const channel = supabase.channel('cashier-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `business_id=eq.${businessId}` }, (payload) => {
        if (payload.eventType === 'INSERT') fetchSingleOrder(payload.new.id);
        else if (payload.eventType === 'UPDATE') {
          setOrders(prev => {
            const updated = { ...prev.find(o => o.id === payload.new.id), ...payload.new };
            const inScope = ['PENDING_PAYMENT', 'PENDING_PAYMENT_CASH'].includes(updated.status);
            if (!inScope) return prev.filter(o => o.id !== payload.new.id);
            return prev.map(o => o.id === payload.new.id ? updated : o);
          });
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [businessId]);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders').select('*, order_items(quantity, unit_price, products(name))')
      .eq('business_id', businessId)
      .in('status', ['PENDING_PAYMENT', 'PENDING_PAYMENT_CASH'])
      .order('created_at', { ascending: true });
    if (data) setOrders(data);
  };

  const fetchSingleOrder = async (id) => {
    const { data } = await supabase.from('orders').select('*, order_items(quantity, unit_price, products(name))').eq('id', id).single();
    if (data && ['PENDING_PAYMENT', 'PENDING_PAYMENT_CASH'].includes(data.status)) {
      setOrders(prev => prev.find(o => o.id === id) ? prev.map(o => o.id === id ? data : o) : [...prev, data]);
    }
  };

  const confirmPayment = async (id) => {
    await supabase.from('orders').update({ status: 'PAID' }).eq('id', id);
  };

  const cancelOrder = async (id) => {
    if (window.confirm('¿Cancelar este pedido?')) {
      await supabase.from('orders').update({ status: 'CANCELLED' }).eq('id', id);
    }
  };

  return (
    <div style={{ background: '#0d0a00', minHeight: '100vh', padding: '15px', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '3px solid #FF4500', paddingBottom: '10px' }}>
        <h1 style={{ margin: 0, color: '#FF4500', fontSize: '28px', fontWeight: '900' }}>💵 CAJA</h1>
        <span style={{ background: '#FF4500', color: 'white', fontWeight: '900', padding: '8px 15px', borderRadius: '8px', fontSize: '20px' }}>{orders.length} pendientes</span>
      </div>

      {orders.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: '100px', color: '#444', fontSize: '24px' }}>
          ✅ Sin cobros pendientes
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
        {orders.map(order => (
          <div key={order.id} style={{ background: '#1a0d00', border: '3px solid #FF4500', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <span style={{ fontSize: '60px', fontWeight: '900', color: 'white', lineHeight: 1 }}>#{order.display_number}</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '32px', fontWeight: '900', color: '#28a745' }}>${order.total}</div>
                <div style={{ fontSize: '12px', background: '#333', color: '#aaa', padding: '4px 10px', borderRadius: '6px', marginTop: '4px' }}>
                  {order.payment_method === 'CASH' ? '💵 Efectivo' : '📲 Digital'}
                </div>
              </div>
            </div>

            {order.table_number && (
              <div style={{ background: '#17a2b8', color: 'black', fontWeight: 'bold', padding: '6px 12px', borderRadius: '6px', marginBottom: '12px', display: 'inline-block' }}>
                Mesa {order.table_number}
              </div>
            )}

            <div style={{ borderTop: '1px solid #333', paddingTop: '10px', marginBottom: '15px' }}>
              {order.order_items?.map((item, i) => (
                <div key={i} style={{ fontSize: '15px', marginBottom: '5px', color: '#ccc', display: 'flex', justifyContent: 'space-between' }}>
                  <span><span style={{ color: '#FF4500', fontWeight: 'bold' }}>{item.quantity}x</span> {item.products?.name}</span>
                  <span style={{ color: '#888' }}>${item.unit_price * item.quantity}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => cancelOrder(order.id)}
                style={{ padding: '12px', background: '#333', color: '#aaa', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold' }}>
                ✕ Cancelar
              </button>
              <button onClick={() => confirmPayment(order.id)}
                style={{ flex: 1, padding: '15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 0 20px rgba(40,167,69,0.4)' }}>
                ✅ CONFIRMAR PAGO
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
