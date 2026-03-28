import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function AdminDashboard({ businessId }) {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    fetchOrders();

    const channel = supabase.channel('dashboard_updates')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders',
        filter: `business_id=eq.${businessId}`
      }, (payload) => {
        // Refetch complete orders list on change for complete sync with items
        fetchOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel) };
  }, [businessId]);

  const fetchOrders = async () => {
    // Bring orders and their nested items. 
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          quantity,
          product_id,
          unit_price,
          products ( name )
        )
      `)
      .eq('business_id', businessId)
      .neq('status', 'DELIVERED') // Hide delivered for cleaner board
      .neq('status', 'CANCELLED')
      .order('created_at', { ascending: false });

    if (error) console.error("Error fetching orders", error);
    else setOrders(data);
  };

  const updateStatus = async (orderId, newStatus) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);
        
      if (error) throw error;
      fetchOrders(); // Optimistic refresh handled via trigger or manually
    } catch (e) {
      alert("Error cambiando estado: " + e.message);
    }
  };

  const getFiltered = (statusStr) => orders.filter(o => o.status === statusStr || (statusStr==='PENDING_PAYMENT_CASH' && o.status==='PENDING_PAYMENT'));

  const renderColumn = (title, statusFilter, nextActionStr, nextStatusKey, colColor) => (
    <div className="admin-card" style={{minWidth:'280px', minHeight:'80vh', borderTop:`4px solid ${colColor}`}}>
      <h3 style={{marginTop:0, borderBottom:'1px solid #333', paddingBottom:'10px', color:'#ccc'}}>
        {title} <span className="add-btn" style={{fontSize:'12px', padding:'4px 8px'}}>{getFiltered(statusFilter).length}</span>
      </h3>
      
      {getFiltered(statusFilter).map(order => (
        <div key={order.id} style={{background:'#111', padding:'15px', borderRadius:'10px', marginBottom:'15px', border:'1px solid #444'}}>
          <div className="admin-card-head">
            <span style={{fontSize:'36px', color:'white'}}>#{order.display_number}</span>
            <span style={{color: 'var(--success)', fontSize:'18px'}}>${order.total}</span>
          </div>
          
          <div style={{color:'#ddd', fontSize:'14px', marginBottom:'15px', lineHeight:'1.5'}}>
            {order.order_items?.map((item, idx) => (
               <div key={idx}>• {item.quantity}x {item.products?.name}</div>
            ))}
          </div>

          <button 
            className="btn-primary" 
            style={{padding:'12px', fontSize:'15px', ...nextStatusKey==='PAID'?{background: 'var(--success)'}:{}}}
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
      <div className="store-header" style={{background:'#1a1a1a', border:'none', marginBottom:'20px'}}>
        <h2 style={{color:'white'}}>DASHBOARD ALTOQUE</h2>
      </div>

      <div className="kanban-grid">
        {renderColumn('1. CAJA (Esperando Pago)', 'PENDING_PAYMENT_CASH', 'Aceptar Pago', 'PAID', '#e03e00')}
        {renderColumn('2. PAGADOS (Pasar a Cocina)', 'PAID', 'En Preparación', 'IN_PREPARATION', '#b8860b')}
        {renderColumn('3. EN PREPARACIÓN', 'IN_PREPARATION', 'Listo a Barra', 'READY', '#17a2b8')}
        {renderColumn('4. LISTOS EN BARRA', 'READY', 'Entregado ✔️', 'DELIVERED', '#28a745')}
      </div>
    </div>
  );
}
