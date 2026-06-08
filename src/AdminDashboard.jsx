import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function AdminDashboard({ businessId, business }) {
  const getLogicalDateStr = (dateObj) => {
    const d = new Date(dateObj);
    let resetHour = 5; // Default for bars
    if (business?.business_type !== 'BAR') resetHour = 0; // Shops don't cross midnight heavily usually
    else if (business?.close_time_hour != null) {
      // If closes past midnight (0-11), shift logical day. If closes evening (12-23), don't shift.
      resetHour = business.close_time_hour < 12 ? business.close_time_hour + 1 : 0;
    }
    d.setHours(d.getHours() - resetHour);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [orders, setOrders] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => getLogicalDateStr(new Date()));

  useEffect(() => {
    fetchOrders();
    fetchProducts();

    const channel = supabase.channel('dashboard-orders-channel')
      .on('postgres_changes', {
        event: '*',  schema: 'public', table: 'orders', filter: `business_id=eq.${businessId}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          fetchSingleOrder(payload.new.id);
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o));
        } else if (payload.eventType === 'DELETE') {
          setOrders(prev => prev.filter(o => o.id !== payload.old.id));
        }
      }).subscribe();

    return () => { supabase.removeChannel(channel) };
  }, [businessId]);

  const fetchSingleOrder = async (orderId) => {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(quantity, product_id, unit_price, notes, products(name), order_item_modifiers(modifier_name))')
      .eq('id', orderId)
      .single();
    if (data) setOrders(prev => {
      const exists = prev.find(o => o.id === data.id);
      return exists ? prev.map(o => o.id === data.id ? data : o) : [data, ...prev];
    });
  };

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(quantity, product_id, unit_price, notes, products(name), order_item_modifiers(modifier_name))')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (!error) setOrders(data);
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('name')
      .eq('business_id', businessId)
      .eq('available', true)
      .is('deleted_at', null);
    
    if (!error && data) setAllProducts(data.map(p => p.name));
  };

  const todaysOrders = orders.filter(o => getLogicalDateStr(o.created_at) === selectedDate);
  const deliveredOrders = todaysOrders.filter(o => o.status === 'DELIVERED');
  const historyOrders = todaysOrders.filter(o => ['DELIVERED', 'CANCELLED'].includes(o.status));

  const ventasHoy = deliveredOrders.reduce((acc, o) => acc + Number(o.total), 0);
  const totalPedidosHoy = todaysOrders.length;

  // --- Metrics ---
  const productCounts = {};
  deliveredOrders.forEach(o => {
    if (o.items && o.items.length > 0) {
      o.items.forEach(i => {
        productCounts[i.name] = (productCounts[i.name] || 0) + i.quantity;
      });
    } else if (o.order_items && o.order_items.length > 0) {
      o.order_items.forEach(i => {
        const name = i.products?.name || 'Producto';
        productCounts[name] = (productCounts[name] || 0) + i.quantity;
      });
    }
  });
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const hourCounts = {};
  deliveredOrders.forEach(o => {
    const h = new Date(o.created_at).getHours();
    const hStr = String(h).padStart(2, '0') + ':00';
    hourCounts[hStr] = (hourCounts[hStr] || 0) + 1;
  });
  const topHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const typeCounts = { DELIVERY: 0, PICKUP: 0 };
  deliveredOrders.forEach(o => {
    if (o.order_type === 'DELIVERY') typeCounts.DELIVERY++;
    else typeCounts.PICKUP++;
  });
  const totalTypes = typeCounts.DELIVERY + typeCounts.PICKUP;
  const percDeliv = totalTypes > 0 ? Math.round((typeCounts.DELIVERY / totalTypes) * 100) : 0;
  const percPick = totalTypes > 0 ? Math.round((typeCounts.PICKUP / totalTypes) * 100) : 0;

  // --- Sugerencias Automáticas ---
  const sugerencias = [];
  if (topProducts.length > 0) {
    sugerencias.push({ icon: '🔥', title: `Producto estrella: ${topProducts[0][0]}`, text: 'Podés destacarlo o subir precio.' });
  }
  const zeroSales = allProducts.filter(p => !productCounts[p]);
  if (zeroSales.length > 0) {
    sugerencias.push({ icon: '⚠️', title: `${zeroSales.length} productos sin ventas`, text: 'Revisar precios o considerar eliminarlos.' });
  }
  if (topHours.length > 0) {
    sugerencias.push({ icon: '🕒', title: `Hora pico: ${topHours[0][0]}hs`, text: 'Activá alguna promo en ese horario puntual.' });
  }
  if (totalTypes > 0 && typeCounts.PICKUP > typeCounts.DELIVERY) {
    sugerencias.push({ icon: '📦', title: 'Predomina retiro', text: 'Podés optimizar tu atención en local.' });
  }
  
  const downloadCSV = () => {
    let csv = 'Pedido,Fecha,Hora,Cliente,Teléfono,Productos,Total,Tipo,Estado\n';
    historyOrders.forEach(o => {
      const d = new Date(o.created_at);
      const fecha = d.toLocaleDateString('es-AR');
      const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      
      let itemsStr = '';
      if (o.items && o.items.length > 0) {
        itemsStr = o.items.map(i => {
           let text = `${i.quantity}x ${i.name}${i.variant ? ` (${i.variant})` : ''}`;
           if (i.notes && i.notes.trim()) text += ` | Obs: ${i.notes.replace(/"/g, '""')}`;
           return text;
        }).join(' | ');
      } else {
        itemsStr = (o.order_items || []).map(i => {
          let text = `${i.quantity}x ${i.products?.name || 'Producto'}`;
          const mods = i.order_item_modifiers || [];
          if (mods.length > 0) text += ` (${mods.map(m => m.modifier_name).join(', ')})`;
          if (i.notes && i.notes.trim()) text += ` | Obs: ${i.notes.replace(/"/g, '""')}`;
          return text;
        }).join(' | ');
      }

      const tipo = o.order_type === 'DELIVERY' ? 'Envío' : 'Retiro';
      let estadoTxt = o.status === 'DELIVERED' ? 'Entregado' : 'Cancelado';

      csv += `"${o.display_number}","${fecha}","${hora}","${o.customer_name || ''}","${o.customer_phone || ''}","${itemsStr}","${o.total}","${tipo}","${estadoTxt}"\n`;
    });
    const blob = new Blob(['\\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ventas_${business.name}_${selectedDate}.csv`;
    a.click();
  };

  return (
    <div className="admin-layout" style={{background:'#121212', minHeight:'100vh', color:'white', padding:'20px'}}>
      
      {/* Top Bar Metrics & Date Filter */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#1a1a1a', padding:'20px', borderRadius:'15px', marginBottom:'20px', flexWrap:'wrap', gap:'15px'}}>
        <div>
          <h2 style={{margin:'0 0 10px 0', color: business?.business_type !== 'BAR' ? '#6366f1' : 'var(--primary)'}}>DASHBOARD</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              style={{ padding:'8px 12px', borderRadius:'8px', border:'1px solid #333', background:'#111', color:'white', fontWeight:'bold' }} />
            {historyOrders.length > 0 && (
               <button onClick={downloadCSV} style={{ padding:'8px 14px', background:'#22c55e22', color:'#22c55e', border:'1px solid #22c55e', borderRadius:'8px', fontWeight:'bold', cursor:'pointer' }}>
                 📥 Exportar CSV
               </button>
            )}
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <p style={{margin:0, color:'#aaa', fontSize:'14px', textTransform: 'uppercase'}}>Métricas ({selectedDate})</p>
          <div style={{display:'flex', gap:'20px', marginTop:'5px'}}>
             <span>Ventas: <b style={{color:'var(--success)', fontSize:'22px'}}>${ventasHoy}</b></span>
             <span>Pedidos: <b style={{color:'white', fontSize:'22px'}}>{totalPedidosHoy}</b></span>
          </div>
        </div>
      </div>

      {deliveredOrders.length > 0 && (
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '15px', flex: '1', minWidth: '250px' }}>
             <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold' }}>🏆 Productos más vendidos</p>
             {topProducts.length === 0 && <span style={{color: '#555', fontSize: '14px'}}>Sin datos operativos</span>}
             {topProducts.map(([name, qty], idx) => (
               <div key={idx} style={{ fontSize: '15px', marginBottom: '8px', color: '#eee', fontWeight: '500' }}>
                 {idx + 1}. {name} — <span style={{ color: 'var(--success)' }}>{qty} ventas</span>
               </div>
             ))}
          </div>

          <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '15px', flex: '1', minWidth: '250px' }}>
             <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold' }}>🔥 Horas más activas</p>
             {topHours.length === 0 && <span style={{color: '#555', fontSize: '14px'}}>Sin datos operativos</span>}
             {topHours.map(([hour, count], idx) => (
               <div key={idx} style={{ fontSize: '15px', marginBottom: '8px', color: '#eee', fontWeight: '500' }}>
                 {hour}hs → <span style={{ color: 'var(--success)' }}>{count} pedidos</span>
               </div>
             ))}
          </div>

          <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '15px', flex: '1', minWidth: '250px' }}>
             <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold' }}>📦 Tipo de pedido</p>
             {totalTypes === 0 && <span style={{color: '#555', fontSize: '14px'}}>Sin datos operativos</span>}
             {totalTypes > 0 && (
               <>
                 <div style={{ fontSize: '15px', marginBottom: '8px', color: '#eee', fontWeight: '500' }}>
                   Retiro: <span style={{ color: 'var(--success)' }}>{percPick}%</span> <span style={{ color: '#888', fontSize:'13px'}}>({typeCounts.PICKUP})</span>
                 </div>
                 <div style={{ fontSize: '15px', marginBottom: '8px', color: '#eee', fontWeight: '500' }}>
                   Envío: <span style={{ color: 'var(--success)' }}>{percDeliv}%</span> <span style={{ color: '#888', fontSize:'13px'}}>({typeCounts.DELIVERY})</span>
                 </div>
               </>
             )}
          </div>
        </div>
      )}

      {/* Sugerencias Automáticas */}
      {sugerencias.length > 0 && deliveredOrders.length > 0 && (
        <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '15px', marginBottom: '20px', borderLeft: '4px solid var(--primary)' }}>
          <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold' }}>💡 Sugerencias Inteligentes</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
            {sugerencias.slice(0,4).map((sug, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '24px' }}>{sug.icon}</span>
                <div>
                  <div style={{ fontSize: '14px', color: 'white', fontWeight: '700' }}>{sug.title}</div>
                  <div style={{ fontSize: '13px', color: '#aaa', marginTop: '2px' }}>{sug.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Grid */}
      <div style={{background:'#1a1a1a', padding:'25px', borderRadius:'15px'}}>
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
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item, idx) => (
                      <div key={idx} style={{display:'flex', gap:'10px', fontSize:'14px', marginBottom:'8px'}}>
                         <b style={{color:'#aaa'}}>{item.quantity}x</b>
                         <span style={{color:'#ccc'}}>{item.name}{item.variant ? ` (${item.variant})` : ''}</span>
                      </div>
                    ))
                  ) : (
                    order.order_items?.map((item, idx) => (
                      <div key={idx} style={{display:'flex', gap:'10px', fontSize:'14px', marginBottom:'8px'}}>
                         <b style={{color:'#aaa'}}>{item.quantity}x</b>
                         <span style={{color:'#ccc'}}>{item.products?.name}</span>
                      </div>
                    ))
                  )}
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
