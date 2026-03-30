import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// Business panel
import BusinessHome from './BusinessHome';
import ShopUI from './ShopUI';

// Staff / operational views (legacy direct URL access)
import CustomerUI from './CustomerUI';
import AdminDashboard from './AdminDashboard';
import AdminProducts from './AdminProducts';
import KitchenView from './KitchenView';
import BarView from './BarView';
import CashierView from './CashierView';
import PublicDisplay from './PublicDisplay';
import MenuImport from './MenuImport';

// ── Slug helper ──────────────────────────────────────────────────────────────
function generateSlug(name, id = '') {
  const safeName = (name || 'negocio').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const prefix = id ? `-${id.slice(0, 4)}` : '';
  return safeName + prefix;
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const queryParams = new URLSearchParams(window.location.search);
  const urlBusinessId = queryParams.get('business_id');
  const view          = queryParams.get('view') || 'customer';

  // Detect slug route: /b/:slug
  const slugMatch = window.location.pathname.match(/^\/b\/([^/?]+)/);
  const urlSlug   = slugMatch ? slugMatch[1] : null;

  const [business, setBusiness]           = useState(null);
  const [businessesList, setBusinessesList] = useState([]);
  const [loading, setLoading]             = useState(!!(urlBusinessId || urlSlug));

  useEffect(() => {
    if (urlSlug) {
      // Load by slug (Business Panel route)
      supabase.from('businesses').select('*').eq('slug', urlSlug).single()
        .then(({ data }) => { if (data) setBusiness(data); setLoading(false); });
    } else if (urlBusinessId) {
      // Load by UUID (legacy / staff route)
      supabase.from('businesses').select('*').eq('id', urlBusinessId).single()
        .then(({ data }) => { if (data) setBusiness(data); setLoading(false); });
    } else {
      // Platform admin: load all businesses
      supabase.from('businesses').select('*').order('created_at', { ascending: false })
        .then(({ data }) => { if (data) setBusinessesList(data); setLoading(false); });
    }
  }, [urlBusinessId, urlSlug]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#080808', color:'#444', fontSize:'16px', fontFamily:"'Inter', sans-serif" }}>
      <span>⚡ Cargando...</span>
    </div>
  );

  // ── SLUG ROUTE → Business Panel ────────────────────────────────────────────
  if (urlSlug) {
    if (!business) return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#080808', color:'#555', fontFamily:"'Inter', sans-serif", gap:'12px' }}>
        <div style={{ fontSize:'48px' }}>🔍</div>
        <p style={{ fontSize:'18px', fontWeight:'700' }}>Negocio no encontrado</p>
        <p style={{ fontSize:'13px', color:'#333' }}>Verificá el enlace</p>
        <a href="/" style={{ marginTop:'8px', padding:'10px 20px', background:'#1a1a1a', color:'#888', borderRadius:'10px', textDecoration:'none', fontSize:'13px', fontWeight:'700' }}>Ir al inicio</a>
      </div>
    );
    if (business.business_type === 'SHOP') return <ShopUI businessId={business.id} business={business} />;
    return <BusinessHome business={business} />;
  }

  // ── LEGACY ROUTES (?business_id=UUID&view=xxx) ─────────────────────────────
  if (urlBusinessId) {
    const isShop = business?.business_type === 'SHOP';

    if (view === 'import')   return <MenuImport     businessId={urlBusinessId} />;
    if (view === 'admin')    return <AdminDashboard businessId={urlBusinessId} />;
    if (view === 'products') return <AdminProducts  businessId={urlBusinessId} business={business} />;
    if (view === 'panel')    return business ? <BusinessHome business={business} /> : null;

    if (!isShop && view === 'display') return <PublicDisplay businessId={urlBusinessId} />;
    if (!isShop && view === 'kitchen') return <KitchenView   businessId={urlBusinessId} />;
    if (!isShop && view === 'bar')     return <BarView       businessId={urlBusinessId} />;
    if (!isShop && view === 'cashier') return <CashierView   businessId={urlBusinessId} />;

    if (isShop) return <ShopUI businessId={urlBusinessId} business={business} />;
    return <CustomerUI businessId={urlBusinessId} />;
  }

  // ── PLATFORM ADMIN (no business_id) ───────────────────────────────────────
  const createBusiness = async ({ name, type }) => {
    const { data, error } = await supabase.from('businesses')
      .insert({ name, business_type: type, slug: generateSlug(name) })
      .select().single();
    if (error) {
      // Slug conflict: add random suffix
      const { data: data2, error: e2 } = await supabase.from('businesses')
        .insert({ name, business_type: type, slug: generateSlug(name, Date.now().toString()) })
        .select().single();
      if (e2) return alert('Error al crear negocio: ' + e2.message);
      if (data2) return window.location.href = `/b/${data2.slug}`;
    }
    if (data) window.location.href = `/b/${data.slug}`;
  };

  const deleteBusiness = async (id, name) => {
    if (!window.confirm(`¿Eliminar "${name}"? Esto borrará todos sus datos.`)) return;
    const { error } = await supabase.from('businesses').delete().eq('id', id);
    if (error) alert('Error: ' + error.message);
    else setBusinessesList(businessesList.filter(b => b.id !== id));
  };

  const bars  = businessesList.filter(b => b.business_type !== 'SHOP');
  const shops = businessesList.filter(b => b.business_type === 'SHOP');

  return <PlatformAdmin bars={bars} shops={shops} onCreate={createBusiness} onDelete={deleteBusiness} />;
}

// ── Platform Admin UI ─────────────────────────────────────────────────────────
function PlatformAdmin({ bars, shops, onCreate, onDelete }) {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('BAR');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    await onCreate({ name: newName.trim(), type: newType });
    setCreating(false);
    setNewName('');
  };

  return (
    <div style={{ padding:'30px 20px', minHeight:'100vh', background:'#080808', color:'white', display:'flex', flexDirection:'column', alignItems:'center', fontFamily:"'Inter', system-ui, sans-serif" }}>
      <h1 style={{ fontSize:'36px', fontWeight:'900', margin:'20px 0 4px 0', background:'linear-gradient(90deg, #FF4500, #ff8c00)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
        ⚡ AlToque
      </h1>
      <p style={{ fontSize:'13px', color:'#333', marginBottom:'40px', fontWeight:'600' }}>Plataforma · Panel interno</p>

      {/* ── CREATE BUSINESS ── */}
      <div style={{ width:'100%', maxWidth:'600px', background:'#0f0f0f', border:'1px solid #1a1a1a', borderRadius:'16px', padding:'20px', marginBottom:'40px' }}>
        <p style={{ fontSize:'11px', color:'#555', fontWeight:'800', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 14px 0' }}>Nuevo negocio</p>
        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Nombre del negocio..."
            style={{ flex:1, minWidth:'180px', padding:'12px 14px', background:'#111', border:'1px solid #222', borderRadius:'10px', color:'white', fontSize:'14px', outline:'none' }}
          />
          <select value={newType} onChange={e => setNewType(e.target.value)}
            style={{ padding:'12px 14px', background:'#111', border:'1px solid #222', borderRadius:'10px', color:'white', fontSize:'14px', cursor:'pointer' }}>
            <option value="BAR">🍺 Bar / Restaurante</option>
            <option value="SHOP">🛍️ Tienda / Catálogo</option>
          </select>
          <button onClick={handleCreate} disabled={creating || !newName.trim()}
            style={{ padding:'12px 20px', background: newName.trim() ? '#FF4500' : '#1a1a1a', color: newName.trim() ? 'white' : '#333', border:'none', borderRadius:'10px', fontWeight:'900', fontSize:'14px', cursor: newName.trim() ? 'pointer' : 'default', transition:'all 0.2s' }}>
            {creating ? '...' : '+ Crear'}
          </button>
        </div>
      </div>

      {/* ── BAR LIST ── */}
      {bars.length > 0 && (
        <Section title="🍺 Bares & Restaurantes" color="#FF4500">
          {bars.map(b => <AdminBusinessCard key={b.id} b={b} onDelete={onDelete} />)}
        </Section>
      )}

      {/* ── SHOP LIST ── */}
      {shops.length > 0 && (
        <Section title="🛍️ Tiendas & Catálogos" color="#6366f1">
          {shops.map(b => <AdminBusinessCard key={b.id} b={b} onDelete={onDelete} />)}
        </Section>
      )}

      {bars.length === 0 && shops.length === 0 && (
        <p style={{ color:'#222', fontSize:'16px', fontWeight:'700', marginTop:'40px' }}>Sin negocios registrados. Creá el primero ↑</p>
      )}
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <div style={{ width:'100%', maxWidth:'600px', marginBottom:'40px' }}>
      <p style={{ color, fontSize:'11px', fontWeight:'800', textTransform:'uppercase', letterSpacing:'2px', margin:'0 0 14px 0' }}>{title}</p>
      <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>{children}</div>
    </div>
  );
}

function AdminBusinessCard({ b, onDelete }) {
  if (!b) return null;
  const isShop  = b.business_type === 'SHOP';
  const name    = b.name || 'Sin nombre';
  const accent  = isShop ? '#6366f1' : '#FF4500';
  const slug    = b.slug || generateSlug(name, b.id);
  const panelUrl = `/b/${slug}`;

  return (
    <div style={{ background:'#0f0f0f', border:`1px solid ${accent}22`, borderRadius:'14px', padding:'16px 18px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px' }}>
        <div>
          <div style={{ fontSize:'17px', fontWeight:'900', color:'white', marginBottom:'4px' }}>{name}</div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:'10px', background:`${accent}22`, color:accent, padding:'2px 7px', borderRadius:'4px', fontWeight:'800' }}>
              {isShop ? 'SHOP' : 'BAR'}
            </span>
            {b.whatsapp_number && (
              <span style={{ fontSize:'10px', background:'#25d36622', color:'#25d366', padding:'2px 7px', borderRadius:'4px', fontWeight:'700' }}>📲 WA</span>
            )}
            <span style={{ fontSize:'10px', color:'#333', fontFamily:'monospace' }}>/b/{slug}</span>
          </div>
        </div>
        <button onClick={() => onDelete(b.id, name)}
          style={{ background:'transparent', border:'none', color:'#333', fontSize:'14px', cursor:'pointer', padding:'4px 8px', borderRadius:'6px' }}>
          🗑️
        </button>
      </div>

      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
        <a href={panelUrl}
          style={{ padding:'8px 14px', background:`${accent}22`, color:accent, borderRadius:'8px', textDecoration:'none', fontSize:'13px', fontWeight:'800', border:`1px solid ${accent}33` }}>
          {isShop ? '🛍️ Abrir tienda' : '⚡ Panel del negocio'}
        </a>
        <a href={`/?business_id=${b.id}`} target="_blank"
          style={{ padding:'8px 14px', background:'#111', color:'#555', borderRadius:'8px', textDecoration:'none', fontSize:'13px', fontWeight:'700', border:'1px solid #1e1e1e' }}>
          📱 Ver menú
        </a>
        {!isShop && (
          <>
            <a href={`/?business_id=${b.id}&view=cashier`} target="_blank"
              style={{ padding:'8px 14px', background:'#111', color:'#555', borderRadius:'8px', textDecoration:'none', fontSize:'13px', fontWeight:'700', border:'1px solid #1e1e1e' }}>
              💵 Caja
            </a>
            <a href={`/?business_id=${b.id}&view=kitchen`} target="_blank"
              style={{ padding:'8px 14px', background:'#111', color:'#555', borderRadius:'8px', textDecoration:'none', fontSize:'13px', fontWeight:'700', border:'1px solid #1e1e1e' }}>
              🔥 Cocina
            </a>
          </>
        )}
      </div>
    </div>
  );
}
