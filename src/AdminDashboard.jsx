import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function AdminDashboard({ businessId }) {
  const [orders, setOrders] = useState([]);
  
  useEffect(() => {
    // Initial fetch from supabase where logic will run
    // For now we populate dummy data simulating DB Realtime load
    setOrders([
      { id: '1', display_number: 145, status: 'PENDING_PAYMENT_CASH', total: 6500, customer_notes: 'Sin hielo' },
      { id: '2', display_number: 142, status: 'PAID', total: 4200, customer_notes: 'QR Pagado' },
      { id: '3', display_number: 139, status: 'IN_PREPARATION', total: 8900, customer_notes: 'Combo grande' },
      { id: '4', display_number: 130, status: 'READY', total: 3500, customer_notes: 'Cerveza' }
    ]);

    // Real-time Dashboard Update
    const channel = supabase.channel('hq_tracker')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders',
        filter: `business_id=eq.${businessId}`
      }, (payload) => {
        // Here we'd map the incoming orders to the board. 
        // We ensure a ding plays only when moving to PAID.
      })
      .subscribe();

    return () => { supabase.removeChannel(channel) };
  }, [businessId]);

  const updateStatus = async (orderId, newStatus) => {
    // Simular el Flow Estricto que implementamos en Postgres
    
    // Play sound on PAID only
    if (newStatus === 'PAID') {
      new Audio('/notification.mp3').play().catch(e => console.log('Audio error on autoplay'));
    }

    setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    
    // In valid code: await supabase.from('orders').update({status: newStatus}).eq('id', orderId);
  };

  const getFilteredOrders = (statusList) => {
    return orders.filter(o => statusList.includes(o.status));
  };

  const renderColumn = (title, statusList, nextActionStr, nextStatusKey, colColor) => (
    <div className="admin-card" style={{minHeight:'80vh', borderTop:`4px solid ${colColor}`}}>
      <h3 style={{marginTop:0, borderBottom:'1px solid #333', paddingBottom:'10px', color:'#ccc'}}>
        {title} <span className="add-btn" style={{fontSize:'12px', padding:'4px 8px'}}>{getFilteredOrders(statusList).length}</span>
      </h3>
      {getFilteredOrders(statusList).map(order => (
        <div key={order.id} style={{background:'#111', padding:'15px', borderRadius:'10px', marginBottom:'15px', border:'1px solid #444'}}>
          <div className="admin-card-head">
            <span style={{fontSize:'32px', color:'white'}}>#{order.display_number}</span>
            <span style={{color: 'var(--success)', fontSize:'18px'}}>${order.total}</span>
          </div>
          <p className="admin-items">🗣 {order.customer_notes || 'Pedidos listos'}</p>
          <button 
            className="btn-primary" 
            style={{padding:'10px', fontSize:'14px', ...nextStatusKey==='PAID'?{background: 'var(--success)', boxShadow: 'none'}:nextStatusKey==='DELIVERED'?{background:'#444', color:'#999', boxShadow:'none'}:{}}}
            onClick={() => updateStatus(order.id, nextStatusKey)}
          >
            {nextActionStr}
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="admin-layout">
      <div className="store-header" style={{background:'#1a1a1a', border:'none', marginBottom:'20px', display:'flex', justifyContent:'space-between'}}>
        <h2 style={{color:'white'}}>🥃 AlToque (DASHBOARD)</h2>
        <div style={{color:'#aaa', fontWeight:'bold'}}>
           <span style={{marginRight:'20px'}}>HOY: $23,100</span>
           <span>PEDIDOS: 18</span>
        </div>
      </div>

      <div className="kanban-grid">
        {renderColumn('1. CAJA (Efectivo/Pendiente)', ['PENDING_PAYMENT_CASH', 'PENDING_PAYMENT'], 'Aceptar Pago (PAID)', 'PAID', '#e03e00')}
        {renderColumn('2. PAGADOS (No servidos)', ['PAID'], 'A Cocina/Barra', 'IN_PREPARATION', '#b8860b')}
        {renderColumn('3. EN PREPARACIÓN', ['IN_PREPARATION'], 'Listo para Retirar', 'READY', '#17a2b8')}
        {renderColumn('4. LISTOS EN BARRA', ['READY'], 'Entregado ✔️', 'DELIVERED', '#28a745')}
      </div>
    </div>
  );
}
