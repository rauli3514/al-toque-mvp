import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// Business panel
import BusinessHome from './BusinessHome';
import ShopUI from './ShopUI';

import MarketplaceUI from './MarketplaceUI';
import EventUI from './EventUI';
import BusinessRegistration from './BusinessRegistration';

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
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const p1 = pathParts[0]; // e.g., 'admin', 'b', or '{slug}'
  const p2 = pathParts[1]; // slug (if /b/)
  const p3 = pathParts[2]; // sub-view (cashier, kitchen, etc)

  const [business, setBusiness]           = useState(null);
  const [businessesList, setBusinessesList] = useState([]);
  const [eventsList, setEventsList] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [adminAuth, setAdminAuth]         = useState(false);

  useEffect(() => {
    if (p1 === 'admin') {
      const pass = localStorage.getItem('al_toque_admin_auth');
      const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASS || 'secret2026';
      if (pass === ADMIN_PASS) {
        setAdminAuth(true);
        loadAllBusinesses();
      } else {
        const input = prompt('Contraseña de administrador:');
        if (input === ADMIN_PASS) {
          localStorage.setItem('al_toque_admin_auth', input);
          setAdminAuth(true);
          loadAllBusinesses();
        } else {
          window.location.href = '/';
        }
      }
    } else if (p1 === 'b' && p2) {
      localStorage.setItem('last_business_slug', p2);
      loadBusiness(p2);
    } else if (p1 && p1 !== 'admin' && p1 !== 'b' && p1 !== 'eventos' && p1 !== 'registro') {
      loadBusiness(p1);
    } else if (!p1 || p1 === 'registro') {
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, []);

  const loadAllBusinesses = async () => {
    const { data } = await supabase.from('businesses').select('*').order('created_at', { ascending: false });
    if (data) setBusinessesList(data);
    
    const { data: evData } = await supabase.from('events').select('*').order('created_at', { ascending: false });
    if (evData) setEventsList(evData);
    
    setLoading(false);
  };

  const loadBusiness = async (querySlug) => {
    const { data } = await supabase.from('businesses').select('*').eq('slug', querySlug).single();
    if (data) setBusiness(data);
    setLoading(false);
  };

  // ── Loading & Errors ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#080808', color:'#444', fontSize:'16px', fontFamily:"'Inter', sans-serif" }}>
      <span>⚡ Cargando...</span>
    </div>
  );

  if (p1 === 'eventos' && p2) {
    return <EventUI slug={p2} />;
  }

  if (p1 === 'registro') {
    return <BusinessRegistration />;
  }

  if (!p1) {
    return <MarketplaceUI />;
  }

  // ── BUSINESS OR PUBLIC MENU ROUTES ──────────────────────────────────────────
  if ((p1 === 'b' && p2) || (p1 && p1 !== 'admin' && p1 !== 'eventos')) {
    if (!business) return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#080808', color:'#555', fontFamily:"'Inter', sans-serif", gap:'12px' }}>
        <div style={{ fontSize:'48px' }}>🔍</div>
        <p style={{ fontSize:'18px', fontWeight:'700' }}>Negocio no encontrado</p>
        <p style={{ fontSize:'13px', color:'#333' }}>Verificá el enlace</p>
        <a href="/" style={{ marginTop:'8px', padding:'10px 20px', background:'#1a1a1a', color:'#888', borderRadius:'10px', textDecoration:'none', fontSize:'13px', fontWeight:'700' }}>Ir al inicio</a>
      </div>
    );

    const isShop = business.business_type !== 'BAR';

    // Public Menu (/:slug)
    if (p1 !== 'b') {
      if (isShop) return <ShopUI businessId={business.id} business={business} />;
      return <CustomerUI businessId={business.id} />;
    }

    // Admin / Operational Views (/b/:slug/...)
    if (p3 === 'display') return <PublicDisplay businessId={business.id} />;
    if (p3 === 'kitchen') return <KitchenView   businessId={business.id} />;
    if (p3 === 'bar')     return <BarView       businessId={business.id} />;
    if (p3 === 'cashier') return <CashierView   businessId={business.id} />;

    // Main Business Panel
    return <BusinessHome business={business} />;
  }

  // ── PLATFORM ADMIN (/admin) ─────────────────────────────────────────────────
  if (p1 === 'admin' && adminAuth) {
    const createBusiness = async ({ name, type }) => {
      let finalSlug = generateSlug(name);
      const { data, error } = await supabase.from('businesses').insert({ name, business_type: type, slug: finalSlug }).select().single();
      if (error) {
        finalSlug = generateSlug(name, Date.now().toString());
        const { data: d2, error: e2 } = await supabase.from('businesses').insert({ name, business_type: type, slug: finalSlug }).select().single();
        if (e2) return alert('Error al crear negocio: ' + e2.message);
        if (d2) window.location.href = `/b/${d2.slug}`;
      } else if (data) window.location.href = `/b/${data.slug}`;
    };

    const deleteBusiness = async (id, name) => {
      if (!window.confirm(`¿Eliminar "${name}"? Esto borrará todos sus datos.`)) return;
      const { error } = await supabase.from('businesses').delete().eq('id', id);
      if (error) alert('Error: ' + error.message);
      else setBusinessesList(businessesList.filter(b => b.id !== id));
    };

    const bars  = businessesList.filter(b => b.business_type === 'BAR');
    const shops = businessesList.filter(b => b.business_type !== 'BAR');

    return <PlatformAdmin bars={bars} shops={shops} events={eventsList} onCreate={createBusiness} onDelete={deleteBusiness} onRefreshEvents={loadAllBusinesses} />;
  }

  return null;
}

// ── Platform Admin UI ─────────────────────────────────────────────────────────
function PlatformAdmin({ bars, shops, events, onCreate, onDelete, onRefreshEvents }) {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('BAR');
  const [creating, setCreating] = useState(false);

  const [newEventName, setNewEventName] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventLoc, setNewEventLoc] = useState('');
  const [newEventIG, setNewEventIG] = useState('');
  const [newEventContact, setNewEventContact] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);

  const handleCreateEvent = async () => {
    if (!newEventName.trim()) return;
    setCreatingEvent(true);
    const slug = newEventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { error } = await supabase.from('events').insert({
      name: newEventName,
      slug: slug,
      description: newEventDesc,
      location: newEventLoc,
      instagram: newEventIG,
      contact: newEventContact
    });
    if (error) alert('Error: ' + error.message);
    else {
      setNewEventName(''); setNewEventDesc(''); setNewEventLoc(''); setNewEventIG(''); setNewEventContact('');
      onRefreshEvents();
    }
    setCreatingEvent(false);
  };

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
      <p style={{ fontSize:'13px', color:'#333', marginBottom:'16px', fontWeight:'600' }}>Plataforma · Panel interno</p>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '40px' }}>
        <a href="/" target="_blank" style={{ padding:'8px 16px', background:'#22c55e', color:'white', borderRadius:'8px', textDecoration:'none', fontWeight:'800', fontSize:'14px' }}>
           🌍 Ver Marketplace General
        </a>
        <a href="/registro" target="_blank" style={{ padding:'8px 16px', background:'#3b82f6', color:'white', borderRadius:'8px', textDecoration:'none', fontWeight:'800', fontSize:'14px' }}>
           ➕ Enviar link de registro
        </a>
      </div>

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
            <option value="SHOP">🛍️ Tienda (General)</option>
            <option value="FOOD">🍔 Alimentos / Gastronomía</option>
            <option value="DRINKS">🧃 Bebidas</option>
            <option value="FASHION">👗 Indumentaria / Moda</option>
            <option value="BEAUTY">💅 Belleza / Cosméticos</option>
            <option value="TECH">💻 Tecnología</option>
            <option value="MERCH">🎨 Merch / Artesanías</option>
            <option value="GIFTS">🎁 Regalos e Insignias</option>
            <option value="RETAIL">📦 Retail</option>
            <option value="MEDIA">📸 Fotos / Videos</option>
            <option value="OTHER">🧩 Otros</option>
          </select>
          <button onClick={handleCreate} disabled={creating || !newName.trim()}
            style={{ padding:'12px 20px', background: newName.trim() ? '#FF4500' : '#1a1a1a', color: newName.trim() ? 'white' : '#333', border:'none', borderRadius:'10px', fontWeight:'900', fontSize:'14px', cursor: newName.trim() ? 'pointer' : 'default', transition:'all 0.2s' }}>
            {creating ? '...' : '+ Crear'}
          </button>
        </div>
      </div>

      {/* ── CREATE EVENT ── */}
      <div style={{ width:'100%', maxWidth:'600px', background:'#0f0f0f', border:'1px solid #1a1a1a', borderRadius:'16px', padding:'20px', marginBottom:'40px' }}>
        <p style={{ fontSize:'11px', color:'#555', fontWeight:'800', textTransform:'uppercase', letterSpacing:'1px', margin:'0 0 14px 0' }}>Nuevo Evento Especial</p>
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          <input value={newEventName} onChange={e => setNewEventName(e.target.value)} placeholder="Nombre del evento..." style={{ padding:'12px', background:'#111', border:'1px solid #222', borderRadius:'10px', color:'white', outline:'none' }} />
          <input value={newEventDesc} onChange={e => setNewEventDesc(e.target.value)} placeholder="Descripción..." style={{ padding:'12px', background:'#111', border:'1px solid #222', borderRadius:'10px', color:'white', outline:'none' }} />
          <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
            <input value={newEventLoc} onChange={e => setNewEventLoc(e.target.value)} placeholder="Ubicación" style={{ flex:1, padding:'12px', background:'#111', border:'1px solid #222', borderRadius:'10px', color:'white', outline:'none' }} />
            <input value={newEventIG} onChange={e => setNewEventIG(e.target.value)} placeholder="Instagram (@)" style={{ flex:1, padding:'12px', background:'#111', border:'1px solid #222', borderRadius:'10px', color:'white', outline:'none' }} />
            <input value={newEventContact} onChange={e => setNewEventContact(e.target.value)} placeholder="Contacto" style={{ flex:1, padding:'12px', background:'#111', border:'1px solid #222', borderRadius:'10px', color:'white', outline:'none' }} />
          </div>
          <button onClick={handleCreateEvent} disabled={creatingEvent || !newEventName.trim()}
            style={{ padding:'12px', background: newEventName.trim() ? '#FF0069' : '#1a1a1a', color: newEventName.trim() ? 'white' : '#333', border:'none', borderRadius:'10px', fontWeight:'900', cursor: newEventName.trim() ? 'pointer' : 'default', marginTop:'4px' }}>
            {creatingEvent ? '...' : '+ Crear Evento'}
          </button>
        </div>
      </div>

      {/* ── EVENTS LIST ── */}
      {events && events.length > 0 && (
        <Section title="🎪 Eventos Activos" color="#FF0069">
          {events.map(ev => <AdminEventCard key={ev.id} ev={ev} shops={shops} onRefresh={onRefreshEvents} />)}
        </Section>
      )}

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

function AdminEventCard({ ev, shops, onRefresh }) {
  const [assigning, setAssigning] = useState(false);
  const [shopIdToAdd, setShopIdToAdd] = useState('');
  
  const handleAddShop = async () => {
    if (!shopIdToAdd) return;
    setAssigning(true);
    const { error } = await supabase.from('event_businesses').insert({ event_id: ev.id, business_id: shopIdToAdd });
    if (error && error.code !== '23505') alert('Error: ' + error.message); // Ignore unique violation
    setShopIdToAdd('');
    setAssigning(false);
  };

  return (
    <div style={{ background:'#0f0f0f', border:`1px solid #FF006922`, borderRadius:'14px', padding:'16px 18px' }}>
      <div style={{ fontSize:'17px', fontWeight:'900', color:'white', marginBottom:'4px' }}>{ev.name}</div>
      <div style={{ fontSize:'12px', color:'#aaa', marginBottom:'12px' }}>/eventos/{ev.slug}</div>
      
      <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
         <a href={`/eventos/${ev.slug}`} target="_blank" style={{ padding:'6px 12px', background:'#FF006922', color:'#FF0069', borderRadius:'8px', textDecoration:'none', fontSize:'12px', fontWeight:'800' }}>Ver Evento</a>
      </div>

      <div style={{ display:'flex', gap:'10px' }}>
        <select value={shopIdToAdd} onChange={e => setShopIdToAdd(e.target.value)} style={{ flex:1, padding:'8px', background:'#111', border:'1px solid #222', borderRadius:'8px', color:'white', fontSize:'13px', outline:'none' }}>
          <option value="">Añadir tienda al evento...</option>
          {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={handleAddShop} disabled={assigning || !shopIdToAdd} style={{ padding:'8px 12px', background: shopIdToAdd ? '#FF0069' : '#111', border: shopIdToAdd ? 'none' : '1px solid #333', borderRadius:'8px', color:'white', cursor:shopIdToAdd ? 'pointer':'default', fontWeight:'800' }}>
          {assigning ? '...' : '+'}
        </button>
      </div>
    </div>
  );
}

function AdminBusinessCard({ b, onDelete }) {
  if (!b) return null;
  const isShop  = b.business_type !== 'BAR';
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
              {b.business_type}
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
          ⚡ Panel de gestión
        </a>
        <a href={`/${slug}`} target="_blank"
          style={{ padding:'8px 14px', background:'#111', color:'#555', borderRadius:'8px', textDecoration:'none', fontSize:'13px', fontWeight:'700', border:'1px solid #1e1e1e' }}>
          📱 Menú público
        </a>

        {!isShop && (
          <>
            <a href={`/b/${slug}/cashier`} target="_blank"
              style={{ padding:'8px 14px', background:'#111', color:'#555', borderRadius:'8px', textDecoration:'none', fontSize:'13px', fontWeight:'700', border:'1px solid #1e1e1e' }}>
              💵 Caja
            </a>
            <a href={`/b/${slug}/kitchen`} target="_blank"
              style={{ padding:'8px 14px', background:'#111', color:'#555', borderRadius:'8px', textDecoration:'none', fontSize:'13px', fontWeight:'700', border:'1px solid #1e1e1e' }}>
              🔥 Cocina
            </a>
          </>
        )}
      </div>
    </div>
  );
}
