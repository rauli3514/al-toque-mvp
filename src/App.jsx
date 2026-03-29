import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import CustomerUI from './CustomerUI';
import AdminDashboard from './AdminDashboard';
import AdminProducts from './AdminProducts';
import KitchenView from './KitchenView';
import BarView from './BarView';
import CashierView from './CashierView';
import PublicDisplay from './PublicDisplay';
import MenuImport from './MenuImport';
import ShopUI from './ShopUI';

function App() {
  const queryParams = new URLSearchParams(window.location.search);
  const businessId = queryParams.get('business_id');
  const view = queryParams.get('view') || 'customer';

  const [business, setBusiness] = useState(null);
  const [businessesList, setBusinessesList] = useState([]);
  const [loadingBusiness, setLoadingBusiness] = useState(!!businessId);

  useEffect(() => {
    if (businessId) {
      supabase.from('businesses').select('*').eq('id', businessId).single()
        .then(({ data }) => { if (data) setBusiness(data); setLoadingBusiness(false); });
    } else {
      supabase.from('businesses').select('*').order('created_at', { ascending: false })
        .then(({ data }) => { if (data) setBusinessesList(data); });
    }
  }, [businessId]);

  const createBusiness = async (type) => {
    const emoji = type === 'SHOP' ? '🛍️' : '🍺';
    const label = type === 'SHOP' ? 'Tienda Demo AlToque' : 'Bar Demo AlToque';
    const { data, error } = await supabase.from('businesses')
      .insert({ name: `${emoji} ${label}`, business_type: type })
      .select().single();
    if (error) return alert("Error conectando a Supabase. ¿Ya corriste el SQL de migración?");
    if (data) window.location.href = `/?business_id=${data.id}&view=products`;
  };

  const deleteBusiness = async (id, name) => {
    if (window.confirm(`¿Seguro que deseas ELIMINAR "${name}"?\n\nEsto borrará permanentemente sus productos, órdenes y categorías.`)) {
      const { error } = await supabase.from('businesses').delete().eq('id', id);
      if (error) alert("Error al eliminar: " + error.message);
      else setBusinessesList(businessesList.filter(b => b.id !== id));
    }
  };

  // ─── ROUTES FOR KNOWN BUSINESS ────────────────────────────────────────────
  if (businessId) {
    if (loadingBusiness) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#121212', color: '#888', fontSize: '18px' }}>Cargando...</div>;

    const isShop = business?.business_type === 'SHOP';

    // Admin & operational views (available for all types)
    if (view === 'import')   return <MenuImport     businessId={businessId} />;
    if (view === 'admin')    return <AdminDashboard businessId={businessId} />;
    if (view === 'products') return <AdminProducts  businessId={businessId} business={business} />;

    // BAR-only views
    if (!isShop && view === 'display') return <PublicDisplay businessId={businessId} />;
    if (!isShop && view === 'kitchen') return <KitchenView   businessId={businessId} />;
    if (!isShop && view === 'bar')     return <BarView       businessId={businessId} />;
    if (!isShop && view === 'cashier') return <CashierView   businessId={businessId} />;

    // Customer-facing: route by business type
    if (isShop) return <ShopUI businessId={businessId} business={business} />;
    return <CustomerUI businessId={businessId} />;
  }

  // ─── SUPER ADMIN LANDING ──────────────────────────────────────────────────
  const barBusinesses  = businessesList.filter(b => b.business_type !== 'SHOP');
  const shopBusinesses = businessesList.filter(b => b.business_type === 'SHOP');

  return (
    <div style={{ padding: '30px 20px', minHeight: '100vh', background: '#0f0f0f', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: "'Inter', sans-serif" }}>
      <h1 style={{ fontSize: '42px', fontWeight: '900', margin: '20px 0 4px 0', background: 'linear-gradient(90deg, #FF4500, #ff8c00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>⚡ AlToque</h1>
      <p style={{ fontSize: '16px', color: '#555', marginBottom: '40px' }}>Panel Super-Admin Multi-tenant</p>

      {/* CREATE NEW */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '50px', maxWidth: '700px', width: '100%' }}>
        <button onClick={() => createBusiness('BAR')}
          style={{ flex: 1, minWidth: '200px', padding: '18px', background: 'linear-gradient(135deg, #FF4500, #cc3700)', color: 'white', border: 'none', borderRadius: '14px', fontSize: '15px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 5px 20px rgba(255,69,0,0.3)' }}>
          🍺 Nuevo BAR / Restaurante
        </button>
        <button onClick={() => createBusiness('SHOP')}
          style={{ flex: 1, minWidth: '200px', padding: '18px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', border: 'none', borderRadius: '14px', fontSize: '15px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 5px 20px rgba(99,102,241,0.3)' }}>
          🛍️ Nueva TIENDA / Catálogo
        </button>
      </div>

      {/* BAR LIST */}
      {barBusinesses.length > 0 && (
        <div style={{ width: '100%', maxWidth: '700px', marginBottom: '40px' }}>
          <h3 style={{ color: '#FF4500', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 16px 0' }}>🍺 Bares & Restaurantes</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {barBusinesses.map(b => <BusinessCard key={b.id} b={b} type="BAR" onDelete={deleteBusiness} />)}
          </div>
        </div>
      )}

      {/* SHOP LIST */}
      {shopBusinesses.length > 0 && (
        <div style={{ width: '100%', maxWidth: '700px', marginBottom: '40px' }}>
          <h3 style={{ color: '#6366f1', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 16px 0' }}>🛍️ Tiendas & Catálogos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {shopBusinesses.map(b => <BusinessCard key={b.id} b={b} type="SHOP" onDelete={deleteBusiness} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function BusinessCard({ b, type, onDelete }) {
  const isShop = type === 'SHOP';
  const accent = isShop ? '#6366f1' : '#FF4500';

  return (
    <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '14px', border: `1px solid ${accent}22`, position: 'relative' }}>
      <button onClick={() => onDelete(b.id, b.name)}
        style={{ position: 'absolute', right: '16px', top: '16px', background: '#ff444422', color: '#ff6666', border: '1px solid #ff444433', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
        🗑️
      </button>

      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ margin: '0 0 2px 0', color: 'white', fontSize: '20px', paddingRight: '80px' }}>{b.name}</h2>
        <span style={{ fontSize: '11px', background: `${accent}22`, color: accent, padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>
          {isShop ? '🛍️ TIENDA' : '🍺 BAR'}
        </span>
        <p style={{ fontSize: '10px', color: '#444', marginTop: '6px', fontFamily: 'monospace' }}>{b.id}</p>
      </div>

      {/* CLIENT */}
      <p style={{ color: '#444', fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', textTransform: 'uppercase' }}>{isShop ? 'Catálogo' : 'Cliente'}</p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <a href={`/?business_id=${b.id}`} style={linkStyle(accent)}>{isShop ? '🛍️ Ver Tienda' : '📱 Menú QR'}</a>
        {!isShop && <a href={`/?business_id=${b.id}&view=display`} style={linkStyle('#9b59b6')}>📺 Pantalla</a>}
        <a href={`/?business_id=${b.id}&view=import`}  style={linkStyle('#e67e22')}>⚡ Importar Menú</a>
      </div>

      {/* OPERATIONS — BAR ONLY */}
      {!isShop && (
        <>
          <p style={{ color: '#444', fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', textTransform: 'uppercase' }}>Operación</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <a href={`/?business_id=${b.id}&view=cashier`} style={linkStyle('#FF4500')}>💵 Caja</a>
            <a href={`/?business_id=${b.id}&view=kitchen`} style={linkStyle('#b8860b')}>🔥 Cocina</a>
            <a href={`/?business_id=${b.id}&view=bar`}     style={linkStyle('#17a2b8')}>🍺 Barra</a>
          </div>
        </>
      )}

      {/* ADMIN */}
      <p style={{ color: '#444', fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', textTransform: 'uppercase' }}>Administración</p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {!isShop && <a href={`/?business_id=${b.id}&view=admin`}    style={linkStyle('#28a745')}>🧮 Dashboard</a>}
        <a href={`/?business_id=${b.id}&view=products`} style={linkStyle('#28a745')}>✏️ Productos</a>
      </div>
    </div>
  );
}

const linkStyle = (color) => ({
  background: `${color}15`,
  padding: '8px 14px',
  borderRadius: '8px',
  color: color,
  textDecoration: 'none',
  fontSize: '13px',
  fontWeight: '700',
  border: `1px solid ${color}33`,
  display: 'inline-block',
});

export default App;
