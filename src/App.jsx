import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import CustomerUI from './CustomerUI';
import AdminDashboard from './AdminDashboard';
import AdminProducts from './AdminProducts';
import KitchenView from './KitchenView';
import BarView from './BarView';
import CashierView from './CashierView';

function App() {
  const queryParams = new URLSearchParams(window.location.search);
  const businessId = queryParams.get('business_id');
  const view = queryParams.get('view') || 'customer';

  const [businessesList, setBusinessesList] = useState([]);

  useEffect(() => {
    async function loadBusinesses() {
      if (!businessId) {
        const { data } = await supabase.from('businesses').select('*').order('created_at', { ascending: false });
        if (data) setBusinessesList(data);
      }
    }
    loadBusinesses();
  }, [businessId]);

  const createDemoBusiness = async () => {
    const { data, error } = await supabase.from('businesses').insert({ name: '🍺 Bar Demo AlToque' }).select().single();
    if (error) return alert("Error conectando a Supabase. ¿Ya pegaste las llaves en Vercel/.env y corriste el SQL?");
    if (data) {
      window.location.href = `/?business_id=${data.id}&view=products`;
    }
  };

  const deleteBusiness = async (id, name) => {
    if (window.confirm(`¿Seguro que deseas ELIMINAR el comercio "${name}"?\n\nEsto borrará permanentemente sus productos, órdenes y categorías. ¡No hay vuelta atrás!`)) {
      const { error } = await supabase.from('businesses').delete().eq('id', id);
      if (error) alert("Error al eliminar: " + error.message);
      else setBusinessesList(businessesList.filter(b => b.id !== id));
    }
  };

  // Route to role-based operational views
  if (businessId && view === 'kitchen')  return <KitchenView  businessId={businessId} />;
  if (businessId && view === 'bar')      return <BarView       businessId={businessId} />;
  if (businessId && view === 'cashier')  return <CashierView   businessId={businessId} />;
  if (businessId && view === 'admin')    return <AdminDashboard businessId={businessId} />;
  if (businessId && view === 'products') return <AdminProducts  businessId={businessId} />;
  if (businessId) return <CustomerUI businessId={businessId} />;

  return (
    <div style={{ padding: '30px', textAlign: 'center', minHeight: '100vh', background: '#121212', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h1 style={{ color: 'var(--primary)', fontSize: '48px', margin: '20px 0' }}>⚡ AlToque</h1>
      <p style={{ fontSize: '18px', color: '#aaa', marginBottom: '40px' }}>Panel Super-Admin Multi-tenant</p>

      {businessesList.length > 0 && (
        <div style={{ width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '40px' }}>
          <h3 style={{ textAlign: 'left', color: '#888', margin: 0 }}>TUS BARES REGISTRADOS:</h3>
          {businessesList.map(b => (
            <div key={b.id} style={{ background: '#1e1e1e', padding: '20px', borderRadius: '12px', border: '1px solid #333', textAlign: 'left', position: 'relative' }}>
              <button onClick={() => deleteBusiness(b.id, b.name)}
                style={{ position: 'absolute', right: '20px', top: '20px', background: '#ff4444', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontWeight: 'bold' }}>
                🗑️ Eliminar
              </button>
              <h2 style={{ margin: '0 0 5px 0', color: 'white', fontSize: '22px', paddingRight: '90px' }}>{b.name}</h2>
              <p style={{ fontSize: '11px', color: '#555', marginBottom: '15px', fontFamily: 'monospace' }}>{b.id}</p>

              {/* CUSTOMER */}
              <p style={{ color: '#666', fontSize: '11px', fontWeight: 'bold', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Cliente</p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
                <a href={`/?business_id=${b.id}`} style={linkStyle('#FF4500')}>📱 Menú QR (Cliente)</a>
              </div>

              {/* OPERATIONS */}
              <p style={{ color: '#666', fontSize: '11px', fontWeight: 'bold', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Operación en barra</p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
                <a href={`/?business_id=${b.id}&view=cashier`}  style={linkStyle('#FF4500')}>💵 Caja</a>
                <a href={`/?business_id=${b.id}&view=kitchen`}  style={linkStyle('#b8860b')}>🔥 Cocina</a>
                <a href={`/?business_id=${b.id}&view=bar`}      style={linkStyle('#17a2b8')}>🍺 Barra</a>
              </div>

              {/* ADMIN */}
              <p style={{ color: '#666', fontSize: '11px', fontWeight: 'bold', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Administración</p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <a href={`/?business_id=${b.id}&view=admin`}    style={linkStyle('#28a745')}>🧮 Dashboard</a>
                <a href={`/?business_id=${b.id}&view=products`} style={linkStyle('#28a745')}>✏️ Productos</a>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#1e1e1e', padding: '30px', borderRadius: '20px', border: '1px solid #333', maxWidth: '700px', width: '100%', marginBottom: '50px' }}>
        <h3 style={{ marginTop: 0 }}>¿Necesitas armar un nuevo comercio?</h3>
        <button onClick={createDemoBusiness}
          style={{ background: 'var(--success)', color: 'white', border: 'none', padding: '15px', width: '100%', borderRadius: '12px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 5px 15px rgba(40,167,69,0.3)' }}>
          + Crear Nuevo Bar al Instante 🚀
        </button>
      </div>
    </div>
  );
}

const linkStyle = (color) => ({
  background: '#2a2a2a',
  padding: '10px 16px',
  borderRadius: '8px',
  color: color,
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 'bold',
  border: `1px solid ${color}33`,
});

export default App;
