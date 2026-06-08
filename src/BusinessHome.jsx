import React, { useState } from 'react';
import LiveOrders from './LiveOrders';
import AdminProducts from './AdminProducts';
import AdminDashboard from './AdminDashboard';
import { supabase } from './supabaseClient';
import { getLoyaltyTier, openWhatsAppLoyalty } from './customerRetention';
import { useEffect } from 'react';

const getTabs = (isShop) => [
  { key: 'orders',   label: isShop ? '⚡ Pedidos' : '💻 Pedidos', icon: '⚡' },
  { key: 'dashboard',label: 'Métricas', icon: '📈' },
  { key: 'menu',     label: isShop ? 'Productos' : 'Menú',       icon: '📋' },
  { key: 'customers', label: 'Clientes',  icon: '👥' },
  { key: 'settings', label: 'Configuración', icon: '⚙️' },
];

export default function BusinessHome({ business, onBack }) {
  const isShop = business?.business_type !== 'BAR';
  const [tab, setTab] = useState('orders');

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: 'white', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* ── TOP BAR ── */}
      <div style={{ background: '#0c0c0c', borderBottom: '1px solid #111', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onBack && (
            <button onClick={onBack}
              style={{ background: 'transparent', border: 'none', color: '#555', fontSize: '18px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px' }}>
              ←
            </button>
          )}
          <div>
            <div style={{ fontSize: '16px', fontWeight: '900', color: 'white', lineHeight: 1 }}>{business.name}</div>
            <div style={{ fontSize: '11px', color: isShop ? '#6366f1' : '#FF4500', fontWeight: '700', marginTop: '2px', textTransform: 'uppercase' }}>
              {isShop ? `🛍️ ${business.business_type}` : '🍺 Bar / Restaurante'}
            </div>
          </div>
        </div>

        {/* Quick links for public menu access */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <a href={`/${business.slug}`} target="_blank"
            style={{ padding: '6px 14px', background: isShop ? '#6366f1' : '#FF4500', color: 'white', borderRadius: '8px', textDecoration: 'none', fontSize: '12px', fontWeight: '800' }}>
            {isShop ? 'Ver Tienda ↗' : 'Ir a mi Menú ↗'}
          </a>
        </div>
      </div>

      {/* ── TOP NAVIGATION ── */}
      <div style={{ background: '#0f0f0f', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'center', gap: '8px', padding: '12px 16px', zIndex: 100 }}>
        {getTabs(isShop).map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                background: active ? '#FF4500' : 'transparent',
                color: active ? 'white' : '#888',
                border: active ? 'none' : '1px solid #222',
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
              }}>
              <span>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
      {tab === 'orders' && (
         <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {!isShop && (
              <div style={{ padding: '10px 20px', background: '#111', borderBottom: '1px solid #222', display: 'flex', gap: '10px', overflowX: 'auto' }}>
                <p style={{ margin: '0 8px 0 0', color: '#666', fontSize: '12px', fontWeight: '800', alignSelf: 'center', whiteSpace: 'nowrap' }}>VISTAS ADICIONALES:</p>
                <a href={`/b/${business.slug}/cashier`} target="_blank" rel="noreferrer" style={{ background: '#222', color: '#aaa', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', textDecoration: 'none', fontWeight: 'bold' }}>💵 Caja (Fullscreen)</a>
                <a href={`/b/${business.slug}/kitchen`} target="_blank" rel="noreferrer" style={{ background: '#222', color: '#aaa', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', textDecoration: 'none', fontWeight: 'bold' }}>🔥 Cocina</a>
                <a href={`/b/${business.slug}/bar`} target="_blank" rel="noreferrer" style={{ background: '#222', color: '#aaa', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', textDecoration: 'none', fontWeight: 'bold' }}>🍺 Barra</a>
                <a href={`/b/${business.slug}/display`} target="_blank" rel="noreferrer" style={{ background: '#222', color: '#aaa', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', textDecoration: 'none', fontWeight: 'bold' }}>📺 Pantalla Pública</a>
              </div>
            )}
            <LiveOrders businessId={business.id} business={business} />
         </div>
      )}
      {tab === 'dashboard' && <AdminDashboard businessId={business.id} business={business} />}
      {tab === 'menu'      && <AdminProducts businessId={business.id} business={business} />}
      {tab === 'customers' && <CustomersPanel businessId={business.id} businessName={business.name} />}
      {tab === 'settings'  && <BusinessSettings business={business} />}
      </div>
    </div>
  );
}

// ── Inline settings panel ────────────────────────────────────────────────────
function BusinessSettings({ business }) {
  const [name, setName]         = useState(business.name || '');
  const [whatsapp, setWhatsapp] = useState(business.whatsapp_number || '');
  const [outputMode, setOutputMode] = useState(business.order_output_mode || 'SCREEN');
  const [paperWidth, setPaperWidth] = useState(business.paper_width || 80);
  const [openHour, setOpenHour]     = useState(business.open_time_hour ?? 16);
  const [closeHour, setCloseHour]   = useState(business.close_time_hour ?? 4);

  const isShop = business?.business_type !== 'BAR';
  const [openHour2, setOpenHour2]   = useState(business.open_time_hour_2 ?? -1);
  const [closeHour2, setCloseHour2] = useState(business.close_time_hour_2 ?? -1);

  // Branding
  const [logoUrl, setLogoUrl] = useState(business.logo_url || '');
  const [bannerUrl, setBannerUrl] = useState(business.banner_url || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);

  const save = async () => {
    setSaving(true);
    const slug = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    await supabase.from('businesses').update({
      name,
      slug: slug + '-' + business.id.slice(0, 4),
      whatsapp_number: whatsapp || null,
      order_output_mode: outputMode,
      paper_width: paperWidth,
      open_time_hour: openHour,
      close_time_hour: closeHour,
      open_time_hour_2: isShop ? openHour2 : null,
      close_time_hour_2: isShop ? closeHour2 : null,
    }).eq('id', business.id);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleBrandingUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    const isLogo = field === 'logo_url';
    if (isLogo) setUploadingLogo(true); else setUploadingBanner(true);
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${business.id}/branding_${field}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('products').upload(fileName, file);
    if (uploadError) {
      alert("Error al subir: " + uploadError.message);
    } else {
      const { data } = supabase.storage.from('products').getPublicUrl(fileName);
      const url = data.publicUrl;
      await supabase.from('businesses').update({ [field]: url }).eq('id', business.id);
      if (isLogo) setLogoUrl(url); else setBannerUrl(url);
    }
    if (isLogo) setUploadingLogo(false); else setUploadingBanner(false);
  };

  const field = (label, child) => (
    <div style={{ marginBottom: '20px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: '#555', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
        {label}
      </label>
      {child}
    </div>
  );

  const inputStyle = { width: '100%', padding: '12px 14px', background: '#111', border: '1px solid #222', borderRadius: '10px', color: 'white', fontSize: '15px', boxSizing: 'border-box', outline: 'none' };
  const selectStyle = { ...inputStyle, cursor: 'pointer' };

  return (
    <div style={{ padding: '20px 16px', maxWidth: '520px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: '900' }}>⚙️ Configuración</h2>

      {field('Nombre del negocio',
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Ej: Black House Patio Cervecero" />
      )}

      {field('WhatsApp del negocio',
        <div>
          <input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value.replace(/\D/g, ''))}
            style={inputStyle} placeholder="Ej: 5493624123456" />
          <p style={{ fontSize: '11px', color: '#facc15', margin: '5px 0 0 0', fontWeight: 'bold' }}>⚠️ Importante: Debe iniciar con 549 (código país y área). Si no tiene 549, los links pueden fallar.</p>
        </div>
      )}

      {/* BRANDING */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '16px', padding: '16px', marginBottom: '24px', display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '11px', color: '#555', fontWeight: '800', textTransform: 'uppercase', marginBottom: '8px' }}>Logo Circular</label>
          <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '50%', background: '#080808', border: '2px dashed #222', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {logoUrl ? <img src={logoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '24px' }}>📸</span>}
            <input type="file" onChange={e => handleBrandingUpload(e, 'logo_url')} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} disabled={uploadingLogo} />
            {uploadingLogo && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>Subiendo...</div>}
          </div>
        </div>
        <div style={{ flex: 2 }}>
          <label style={{ display: 'block', fontSize: '11px', color: '#555', fontWeight: '800', textTransform: 'uppercase', marginBottom: '8px' }}>Portada (Banner)</label>
          <div style={{ position: 'relative', width: '100%', height: '80px', borderRadius: '10px', background: '#080808', border: '2px dashed #222', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {bannerUrl ? <img src={bannerUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '24px' }}>🖼️</span>}
            <input type="file" onChange={e => handleBrandingUpload(e, 'banner_url')} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} disabled={uploadingBanner} />
            {uploadingBanner && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>Subiendo...</div>}
          </div>
        </div>
      </div>

      {/* HORARIOS */}
      <p style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight:'bold', color: '#888' }}>TURNO 1</p>
      <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          {field('Abre a las',
            <select value={openHour} onChange={e => setOpenHour(Number(e.target.value))} style={selectStyle}>
              <option value={-1}>Siempre Abierto (24h)</option>
              {Array.from({length: 24}).map((_, i) => <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>)}
            </select>
          )}
        </div>
        <div style={{ flex: 1, opacity: openHour === -1 ? 0.3 : 1, pointerEvents: openHour === -1 ? 'none' : 'auto' }}>
          {field('Cierra a las',
            <select value={closeHour} onChange={e => setCloseHour(Number(e.target.value))} style={selectStyle}>
               <option value={-1}>Siempre Abierto (24h)</option>
               {Array.from({length: 24}).map((_, i) => <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>)}
            </select>
          )}
        </div>
      </div>

      {isShop && openHour !== -1 && (
        <>
          <p style={{ margin: '15px 0 10px 0', fontSize: '12px', fontWeight:'bold', color: '#888', borderTop: '1px solid #222', paddingTop: '15px' }}>TURNO 2 (Opcional)</p>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
            <div style={{ flex: 1 }}>
              {field('Abre a las',
                <select value={openHour2} onChange={e => setOpenHour2(Number(e.target.value))} style={selectStyle}>
                  <option value={-1}>No aplica</option>
                  {Array.from({length: 24}).map((_, i) => <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>)}
                </select>
              )}
            </div>
            <div style={{ flex: 1, opacity: openHour2 === -1 ? 0.3 : 1, pointerEvents: openHour2 === -1 ? 'none' : 'auto' }}>
              {field('Cierra a las',
                <select value={closeHour2} onChange={e => setCloseHour2(Number(e.target.value))} style={selectStyle}>
                   <option value={-1}>No aplica</option>
                   {Array.from({length: 24}).map((_, i) => <option key={i} value={i}>{String(i).padStart(2,'0')}:00</option>)}
                </select>
              )}
            </div>
          </div>
        </>
      )}
      <p style={{ margin: '-10px 0 24px 0', fontSize: '11px', color: '#888' }}>
        Si cierras después de la medianoche (ej: abre 18:00 y cierra 04:00), los reportes no se cortarán a las 00:00. Usa "Siempre Abierto" para kioscos 24h.
      </p>

      {business.business_type !== 'SHOP' && (
        <>
          {field('Modo de salida de pedidos',
            <select value={outputMode} onChange={e => setOutputMode(e.target.value)} style={selectStyle}>
              <option value="SCREEN">🖥️ Solo pantalla</option>
              <option value="PRINT">🖨️ Solo imprimir</option>
              <option value="BOTH">📟 Pantalla + Impresora</option>
            </select>
          )}

          {field('Tamaño de papel de impresión',
            <select value={paperWidth} onChange={e => setPaperWidth(Number(e.target.value))} style={selectStyle}>
              <option value={80}>80mm (estándar)</option>
              <option value={58}>58mm (portátil / Bluetooth)</option>
            </select>
          )}
        </>
      )}

      {/* URL info */}
      <div style={{ background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '14px', marginBottom: '24px' }}>
        <p style={{ fontSize: '11px', color: '#555', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px 0' }}>Enlace del negocio</p>
        <p style={{ fontSize: '13px', color: '#888', margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {window.location.origin}/b/{business.slug || '(guardá para generar)'}
        </p>
      </div>

      {/* QR Links */}
      <div style={{ background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '10px', padding: '14px', marginBottom: '24px' }}>
        <p style={{ fontSize: '11px', color: '#555', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px 0' }}>Enlace para tus clientes (QR)</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <a href={`/${business.slug}`} target="_blank"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#151515', borderRadius: '8px', textDecoration: 'none', color: '#ccc', fontSize: '14px', border: '1px solid #222', fontWeight: 'bold' }}>
            <span>📱 Menú Público Oficial</span>
            <span style={{ color: '#FF4500', fontSize: '14px' }}>↗</span>
          </a>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        style={{ width: '100%', padding: '16px', background: saved ? '#22c55e' : '#FF4500', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '900', cursor: 'pointer', transition: 'all 0.3s' }}>
        {saving ? 'Guardando...' : saved ? '✅ Guardado' : 'Guardar cambios'}
      </button>
    </div>
  );
}

// ── Customers Loyalty Panel ──────────────────────────────────────────────────
function CustomersPanel({ businessId, businessName }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDay, setSelectedDay] = useState('ALL'); // ALL, 0=Dom, 5=Vie, 6=Sab...

  const WEEKDAYS = [
    { v: 'ALL', l: 'Todos los días' },
    { v: '5',   l: 'Viernes' },
    { v: '6',   l: 'Sábados' },
    { v: '0',   l: 'Domingos' },
    { v: '1',   l: 'Lunes' },
    { v: '2',   l: 'Martes' },
    { v: '3',   l: 'Miércoles' },
    { v: '4',   l: 'Jueves' },
  ];

  useEffect(() => {
    fetchCustomers();
  }, [businessId, selectedDay]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      let query = supabase.from('customers').select('*').eq('business_id', businessId);
      
      if (selectedDay !== 'ALL') {
        const { data: phones, error: rpcErr } = await supabase.rpc('get_customers_by_weekday', { 
          p_business_id: businessId, 
          p_dow: parseInt(selectedDay) 
        });
        
        if (rpcErr) {
          console.error("RPC Error:", rpcErr);
          setCustomers([]); // Clear if filter fails
          setLoading(false);
          return;
        }

        if (phones && phones.length > 0) {
          query = query.in('phone', phones.map(p => p.phone));
        } else {
          setCustomers([]);
          setLoading(false);
          return;
        }
      }

      const { data } = await query.order('total_orders', { ascending: false });
      if (data) setCustomers(data);
    } catch (err) {
      console.error("Fetch Err:", err);
    }
    setLoading(false);
  };



  const filtered = customers.filter(c => {
    const s = searchTerm.toLowerCase();
    return (c.name || '').toLowerCase().includes(s) || 
           (c.phone || '').includes(s) || 
           (c.last_items || '').toLowerCase().includes(s);
  });

  const handleSalute = (c) => {
    const clean = c.phone.replace(/\D/g, '');
    const defaultMsg = `¡Hola ${c.name || ''}! Te saludamos de *${businessName}* 🍺`;
    const finalMsg = broadcastMsg.trim() ? broadcastMsg : defaultMsg;
    const url = `https://wa.me/${clean}?text=${encodeURIComponent(finalMsg)}`;
    window.open(url, '_blank');
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>👥 Mis Clientes</h2>
        <span style={{ fontSize: '12px', color: '#555', fontWeight: '700', background: '#111', padding: '4px 10px', borderRadius: '20px' }}>
          {customers.length} registrados
        </span>
      </div>

      {/* Weekday Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
        {WEEKDAYS.map(day => (
          <button key={day.v} onClick={() => setSelectedDay(day.v)}
            style={{ whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '800', border: '1px solid', background: selectedDay === day.v ? '#FF4500' : '#111', borderColor: selectedDay === day.v ? '#FF4500' : '#222', color: selectedDay === day.v ? 'white' : '#555', cursor: 'pointer' }}>
            {day.l}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input 
          placeholder="🔍 Buscar por nombre, cel o producto..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ flex: 1, background: '#111', border: '1px solid #222', borderRadius: '10px', padding: '10px 14px', color: 'white', fontSize: '13px', outline: 'none' }}
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} style={{ background: '#1a1a1a', color: '#888', border: 'none', borderRadius: '10px', padding: '0 12px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>✕</button>
        )}
      </div>

      {/* Broadcast Message Box */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: '16px', padding: '16px', marginBottom: '24px' }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '11px', fontWeight: '900', color: '#444', textTransform: 'uppercase', letterSpacing: '1px' }}>💬 Mensaje Masivo / Oferta</p>
        <textarea 
          placeholder="Escribe algo aquí (ej: ¡Hoy 2x1 en pintas!) y presiona 'Saludar' en cada cliente para enviarlo."
          value={broadcastMsg}
          onChange={e => setBroadcastMsg(e.target.value)}
          style={{ width: '100%', minHeight: '80px', background: '#080808', border: '1px solid #222', borderRadius: '10px', color: 'white', padding: '12px', fontSize: '14px', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
        />
        <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#333' }}>
          {broadcastMsg.length > 0 ? '⚠️ El botón "Saludar" enviará este mensaje personalizado.' : '💡 Si dejas esto vacío, se enviará un saludo por defecto.'}
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#333' }}>Cargando clientes...</div>
      ) : customers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#0c0c0c', borderRadius: '20px', border: '1px dashed #222' }}>
          <p style={{ fontSize: '40px', margin: '0 0 10px 0' }}>🤫</p>
          <p style={{ margin: 0, color: '#444', fontWeight: '700' }}>Aún no tienes clientes registrados.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(c => {
            const lastDate = c.last_order_at ? new Date(c.last_order_at).toLocaleDateString('es-AR') : '—';
            return (
              <div key={c.id} style={{ background: '#0e0e0e', border: '1px solid #1a1a1a', borderRadius: '16px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontWeight: '900', fontSize: '16px', color: 'white' }}>{c.name || 'Cliente'}</span>
                    <span style={{ fontSize: '11px', color: '#333' }}>{c.phone}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: '#22c55e', fontWeight: '800' }}>
                         🔥 {c.total_orders} pedido{c.total_orders !== 1 ? 's' : ''}
                      </span>
                      <span style={{ fontSize: '11px', color: '#444' }}>Último: {lastDate}</span>
                    </div>
                    {c.last_items && (
                      <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic', background: '#151515', padding: '6px 10px', borderRadius: '8px', marginTop: '4px', borderLeft: '3px solid #222' }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '10px', fontWeight: '900', color: '#333', textTransform: 'uppercase' }}>📜 Últimos consumos:</p>
                        {c.last_items}
                      </div>
                    )}
                  </div>
                </div>
                
                <button 
                  onClick={() => handleSalute(c)}
                  style={{ background: broadcastMsg.trim() ? '#a855f722' : '#25d36622', color: broadcastMsg.trim() ? '#a855f7' : '#25d366', border: `1px solid ${broadcastMsg.trim() ? '#a855f744' : '#25d36644'}`, padding: '10px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: '900', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  📲 Saludar
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: '30px', padding: '16px', background: '#111', borderRadius: '16px', border: '1px solid #1a1a1a' }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '11px', fontWeight: '900', color: '#444', textTransform: 'uppercase', letterSpacing: '1px' }}>¿Cómo funciona?</p>
        <p style={{ margin: 0, fontSize: '13px', color: '#666', lineHeight: '1.5' }}>
          Tus clientes se registran automáticamente cuando capturas su WhatsApp en el panel de <b>Pedidos</b> al confirmar un pago. 
          Aquí puedes ver su historial de visitas y contactarlos rápidamente con ofertas personalizadas.
        </p>
      </div>
    </div>
  );
}
