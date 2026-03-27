import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function KitchenMode({ businessId }) {
  const [prepOrders, setPrepOrders] = useState([
    // mock data
    { id: '1', display_number: 145, status: 'IN_PREPARATION', total: 6500, items: '2x Burguer Doble' },
    { id: '2', display_number: 142, status: 'IN_PREPARATION', total: 4200, items: '1x IPA, 1x Papas' },
    { id: '3', display_number: 139, status: 'IN_PREPARATION', total: 8900, items: 'Combo Familiar' },
  ]);

  useEffect(() => {
    // Escucha exclusiva para la cocina: Solo actualiza IN_PREPARATION -> READY
    const channel = supabase.channel('kitchen_tracker')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders',
        filter: `business_id=eq.${businessId}`
      }, (payload) => {
        // Recargar o empujar a la lista si status cambia a IN_PREPARATION
        // Lo dejamos preparado para la conexión real
      })
      .subscribe();

    return () => { supabase.removeChannel(channel) };
  }, [businessId]);

  const markAsReady = (id) => {
    // supabase.from('orders').update({status: 'READY'}).eq('id', id);
    setPrepOrders(prepOrders.filter(o => o.id !== id));
  };

  return (
    <div className="admin-layout" style={{background: '#0a0a0a'}}>
      <div className="store-header" style={{background: '#1a1a1a', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2 style={{color:'white', fontSize:'30px'}}>🍽️ COCINA VIVA (AlToque)</h2>
        <span style={{color:'#666', fontSize:'18px'}}>Solo Órdenes PAGADAS EN PREPARACIÓN</span>
      </div>

      <div className="kitchen-grid" style={{marginTop: '20px'}}>
        {prepOrders.map(o => (
           <div key={o.id} className="admin-card" style={{border: '2px solid #333'}}>
              <div className="admin-card-head" style={{fontSize:'36px'}}>
                 #{o.display_number}
              </div>
              <p className="admin-items" style={{fontSize:'20px'}}>
                 {o.items}
              </p>
              <button 
                className="btn-primary" 
                style={{background: 'var(--success)', marginTop:'20px', boxShadow: '0 6px 20px rgba(40,167,69,0.3)'}}
                onClick={() => markAsReady(o.id)}
              >
                ✔ ¡LISTO! A BARRA
              </button>
           </div>
        ))}
        {prepOrders.length === 0 && (
          <h1 style={{color: '#444', textAlign: 'center', width: '100vw'}}>La cocina está al día. 🚀</h1>
        )}
      </div>
    </div>
  );
}
