import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { printOrder } from './printOrder';

const IN_SCOPE = ['PENDING_PAYMENT', 'PENDING_PAYMENT_CASH'];

export default function CashierView({ businessId }) {
  const [orders, setOrders]       = useState([]);
  const [business, setBusiness]   = useState(null);
  const [printing, setPrinting]   = useState({}); // { [orderId]: true }

  useEffect(() => {
    // Load business config (for print mode + name)
    supabase.from('businesses').select('id, name, order_output_mode, paper_width').eq('id', businessId).single()
      .then(({ data }) => { if (data) setBusiness(data); });

    fetchOrders();

    const channel = supabase.channel(`cashier-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `business_id=eq.${businessId}` }, (payload) => {
        const status = (payload.new || payload.old)?.status;
        const id     = (payload.new || payload.old)?.id;
        if (!id) return;
        if (payload.eventType === 'DELETE' || !IN_SCOPE.includes(status)) {
          setOrders(prev => prev.filter(o => o.id !== id));
        } else {
          fetchSingleOrder(id);
        }
      }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [businessId]);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(quantity, unit_price, notes, products(name), order_item_modifiers(modifier_name))')
      .eq('business_id', businessId)
      .in('status', IN_SCOPE)
      .order('created_at', { ascending: true });
    if (data) setOrders(data);
  };

  const fetchSingleOrder = async (id) => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(quantity, unit_price, notes, products(name), order_item_modifiers(modifier_name))')
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

  const confirmPayment = async (order) => {
    // 1. Mark as PAID
    const { error } = await supabase.from('orders').update({ status: 'PAID' }).eq('id', order.id);
    if (error) { alert('Error al confirmar pago: ' + error.message); return; }

    // 2. Print if mode requires it
    const mode = business?.order_output_mode || 'SCREEN';
    const width = business?.paper_width || 80;
    if (mode === 'PRINT' || mode === 'BOTH') {
      setPrinting(prev => ({ ...prev, [order.id]: true }));
      await printOrder(supabase, order.id, business?.name || 'AlToque', width);
      setPrinting(prev => { const n = { ...prev }; delete n[order.id]; return n; });
    }
  };

  const handleManualPrint = async (order) => {
    const width = business?.paper_width || 80;
    setPrinting(prev => ({ ...prev, [order.id]: true }));
    await printOrder(supabase, order.id, business?.name || 'AlToque', width);
    setPrinting(prev => { const n = { ...prev }; delete n[order.id]; return n; });
  };

  const cancelOrder = async (id) => {
    if (window.confirm('¿Cancelar este pedido?')) {
      await supabase.from('orders').update({ status: 'CANCELLED' }).eq('id', id);
    }
  };

  const outputMode  = business?.order_output_mode || 'SCREEN';
  const showPrintBtn = outputMode === 'SCREEN' || outputMode === 'BOTH'; // manual print always visible on SCREEN/BOTH

  return (
    <div style={{ background: '#0d0a00', minHeight: '100vh', padding: '15px', color: 'white', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '3px solid #FF4500', paddingBottom: '12px' }}>
        <div>
          <h1 style={{ margin: 0, color: '#FF4500', fontSize: '26px', fontWeight: '900' }}>💵 CAJA</h1>
          <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#555', fontWeight: '600' }}>
            {outputMode === 'PRINT' && '🖨️ Impresión automática al cobrar'}
            {outputMode === 'BOTH'  && '🖨️ Imprime + muestra en pantalla'}
            {outputMode === 'SCREEN' && '🖥️ Solo pantalla'}
          </p>
        </div>
        <div style={{ background: orders.length > 0 ? '#FF4500' : '#1a0d00', color: 'white', fontWeight: '900', padding: '10px 18px', borderRadius: '10px', fontSize: '26px', minWidth: '50px', textAlign: 'center' }}>
          {orders.length}
        </div>
      </div>

      {/* EMPTY STATE */}
      {orders.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: '100px', color: '#444', fontSize: '24px' }}>✅ Sin cobros pendientes</div>
      )}

      {/* ORDER CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
        {orders.map(order => (
          <div key={order.id} style={{ background: '#1a0d00', border: '3px solid #FF4500', borderRadius: '14px', padding: '20px' }}>

            {/* L1: Number + Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ lineHeight: 0.9 }}>
                <div style={{ fontSize: '64px', fontWeight: '900', color: 'white', letterSpacing: '-3px' }}>#{order.display_number}</div>
                {order.table_number ? (
                  <span style={{ fontSize: '13px', background: '#17a2b8', color: '#000', fontWeight: '800', padding: '3px 10px', borderRadius: '6px', display: 'inline-block', marginTop: '6px' }}>
                    📍 Mesa {order.table_number}
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', color: '#555', marginTop: '4px', display: 'block' }}>Sin mesa · Barra</span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '30px', fontWeight: '900', color: '#22c55e' }}>${Number(order.total).toLocaleString('es-AR')}</div>
                <div style={{ fontSize: '12px', background: '#222', color: '#888', padding: '3px 8px', borderRadius: '5px', marginTop: '4px' }}>
                  {order.payment_method === 'CASH' ? '💵 Efectivo' : '📲 Digital'}
                </div>
              </div>
            </div>

            {/* L3: Items */}
            <div style={{ borderTop: '1px solid #2a1500', paddingTop: '10px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {order.order_items?.map((item, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span>
                      <span style={{ color: '#FF4500', fontWeight: '900', marginRight: '6px' }}>{item.quantity}×</span>
                      <span style={{ color: '#ddd', fontSize: '15px' }}>{item.products?.name}</span>
                    </span>
                    <span style={{ color: '#888', fontSize: '13px' }}>${(item.unit_price * item.quantity).toLocaleString('es-AR')}</span>
                  </div>
                  {/* L4: Modifiers */}
                  {item.order_item_modifiers?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', paddingLeft: '24px', marginTop: '4px' }}>
                      {item.order_item_modifiers.map((m, j) => (
                        <span key={j} style={{ fontSize: '11px', color: '#666', background: '#111', padding: '2px 7px', borderRadius: '20px', border: '1px solid #222' }}>
                          {m.modifier_name}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* L4: Notes */}
                  {item.notes && (
                    <p style={{ margin: '4px 0 0 24px', fontSize: '12px', color: '#555', fontStyle: 'italic' }}>📝 {item.notes}</p>
                  )}
                </div>
              ))}
            </div>

            {/* L2: Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {/* Cancel */}
              <button onClick={() => cancelOrder(order.id)}
                style={{ padding: '12px 14px', background: '#1e1e1e', color: '#666', border: '1px solid #333', borderRadius: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold' }}>
                ✕
              </button>

              {/* Manual print (visible when SCREEN or BOTH) */}
              {showPrintBtn && (
                <button onClick={() => handleManualPrint(order)}
                  disabled={printing[order.id]}
                  style={{ padding: '12px 14px', background: '#1e293b', color: '#60a5fa', border: '1px solid #1e3a5f', borderRadius: '10px', fontSize: '14px', cursor: 'pointer', fontWeight: '700', whiteSpace: 'nowrap' }}>
                  {printing[order.id] ? '...' : '🖨️'}
                </button>
              )}

              {/* Confirm payment */}
              <button onClick={() => confirmPayment(order)}
                disabled={printing[order.id]}
                style={{ flex: 1, padding: '15px', background: '#22c55e', color: '#000', border: 'none', borderRadius: '10px', fontSize: '17px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 0 20px rgba(34,197,94,0.25)', transition: 'transform 0.1s' }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {outputMode === 'PRINT' ? '✅ COBRAR + IMPRIMIR' : '✅ CONFIRMAR PAGO'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
