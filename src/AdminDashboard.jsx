import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function AdminDashboard({ businessId }) {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('active'); // active | history

  useEffect(() => {
    fetchOrders();

    const channel = supabase.channel('dashboard_updates')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders',
        filter: `business_id=eq.${businessId}`
      }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel) };
  }, [businessId]);

  const fetchOrders = async () => {
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
      fetchOrders();
    } catch (e) {
      alert("Error cambiando estado: " + e.message);
    }
  };

  // Metrics
  const today = new Date().toISOString().split('T')[0];
  const todaysOrders = orders.filter(o => o.created_at.startsWith(today));
  const ventasHoy = todaysOrders.filter(o => o.status === 'DELIVERED').reduce((acc, o) => acc + Number(o.total), 0);
  const totalPedidosHoy = todaysOrders.length;

  // History tab orders
  const historyOrders = orders.filter(o => ['DELIVERED', 'CANCELLED'].includes(o.status));

  // Kanban filters
  const getFiltered = (statusStr) => orders.filter(o => o.status === statusStr || (statusStr==='PENDING_PAYMENT_CASH' && o.status==='PENDING_PAYMENT'));

  // Render a single Kanban Column
  const renderColumn = (title, statusFilter, nextActionStr, nextStatusKey, colColor) => (
    <div className="admin-card" style={{minWidth:'280px', minHeight:'60vh', borderTop:`4px solid ${colColor}`, padding:'15px', background:'#1a1a1a', borderRadius:'0 0 10px 10px'}}>
      <h3 style={{marginTop:0, borderBottom:'1px solid #333', paddingBottom:'10px', color:'#ccc'}}>
        {title} <span className="add-btn" style={{fontSize:'12px', padding:'4px 8px'}}>{getFiltered(statusFilter).length}</span>
      </h3>
      
      {getFiltered(statusFilter).map(order => (
        <div key={order.id} style={{background:'#111', padding:'15px', borderRadius:'10px', marginBottom:'15px', border:'1px solid #444'}}>
          <div className="admin-card-head" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
            <span style={{fontSize:'32px', color:'white', fontWeight:'900'}}>#{order.display_number}</span>
            <span style={{color: 'var(--success)', fontSize:'20px', fontWeight:'bold'}}>${order.total}</span>
          </div>
          
          <div style={{color:'#ddd', fontSize:'15px', marginBottom:'15px', padding:'10px 0', borderTop:'1px solid #333', borderBottom:'1px solid #333'}}>
            {order.order_items?.map((item, idx) => (
               <div key={idx} style={{marginBottom:'4px'}}>• {item.quantity}x {item.products?.name}</div>
            ))}
          </div>

          <button 
            className="btn-primary" 
            style={{width:'100%', padding:'12px', fontSize:'15px', fontWeight:'bold', border:'none', borderRadius:'8px', cursor:'pointer', background: nextStatusKey==='PAID' ? 'var(--success)' : nextStatusKey==='IN_PREPARATION' ? '#b8860b' : nextStatusKey==='READY' ? '#17a2b8' : 'var(--primary)' }}
            onClick={() => updateStatus(order.id, nextStatusKey)}
          >
            {nextActionStr}
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="admin-layout" style={{background:'#121212', minHeight:'100vh', color:'white', padding:'20px'}}>
      
      {/* Top Bar Metrics */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#1a1a1a', padding:'20px', borderRadius:'15px', marginBottom:'20px', flexWrap:'wrap', gap:'15px'}}>
        <h2 style={{margin:0, color:'var(--primary)'}}>DASHBOARD</h2>
        <div style={{textAlign:'right'}}>
          <p style={{margin:0, color:'#aaa', fontSize:'14px'}}>MÉTRICAS DEL DÍA</p>
          <div style={{display:'flex', gap:'20px', marginTop:'5px'}}>
             <span>Ventas: <b style={{color:'var(--success)', fontSize:'22px'}}>${ventasHoy}</b></span>
             <span>Pedidos: <b style={{color:'white', fontSize:'22px'}}>{totalPedidosHoy}</b></span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
         <button onClick={() => setTab('active')} style={{flex:1, padding:'15px', borderRadius:'10px', border:'none', fontSize:'16px', fontWeight:'bold', background: tab === 'active' ? 'var(--primary)' : '#222', color: tab==='active'?'white':'#888', cursor:'pointer'}}>⏱ En Curso (Kanban)</button>
         <button onClick={() => setTab('history')} style={{flex:1, padding:'15px', borderRadius:'10px', border:'none', fontSize:'16px', fontWeight:'bold', background: tab === 'history' ? '#444' : '#222', color: tab === 'history'?'white':'#888', cursor:'pointer'}}>📜 Historial del Día</button>
      </div>

      {/* Kanban Layout - Only visible in 'active' tab */}
      {tab === 'active' && (
        <div className="kanban-grid" style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'20px'}}>
          {renderColumn('1. CAJA (Esperando Pago)', 'PENDING_PAYMENT_CASH', 'Aceptar Pago', 'PAID', '#e03e00')}
          {renderColumn('2. PAGADOS (Cocina)', 'PAID', 'En Preparación', 'IN_PREPARATION', '#b8860b')}
          {renderColumn('3. EN PREPARACIÓN', 'IN_PREPARATION', 'Listo a Barra', 'READY', '#17a2b8')}
          {renderColumn('4. LISTOS EN BARRA', 'READY', 'Entregado ✔️', 'DELIVERED', '#28a745')}
        </div>
      )}

      {/* History Grid - Only visible in 'history' tab */}
      {tab === 'history' && (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'20px'}}>
          {historyOrders.length === 0 && <p style={{color:'#666', marginTop:'20px', width:'100%'}}>No hay órdenes finalizadas hoy.</p>}
          {historyOrders.map(order => (
            <div key={order.id} style={{background:'#1e1e1e', padding:'20px', borderRadius:'15px', border:'1px solid #333', opacity: order.status === 'CANCELLED' ? 0.5 : 1}}>
               <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px', alignItems:'center'}}>
                  <span style={{fontSize:'32px', fontWeight:'900', color:'white'}}>#{order.display_number}</span>
                  <span style={{fontSize:'22px', color:'var(--success)', fontWeight:'900'}}>${order.total}</span>
               </div>
               <div style={{background:'#111', color:'#555', padding:'6px 12px', borderRadius:'6px', display:'inline-block', fontSize:'13px', fontWeight:'bold', marginBottom:'15px'}}>
                 {order.status}
               </div>
               <div style={{borderTop:'1px solid #333', paddingTop:'15px'}}>
                  {order.order_items?.map((item, idx) => (
                    <div key={idx} style={{display:'flex', gap:'10px', fontSize:'14px', marginBottom:'8px'}}>
                       <b style={{color:'#aaa'}}>{item.quantity}x</b>
                       <span style={{color:'#ccc'}}>{item.products?.name}</span>
                    </div>
                  ))}
               </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
