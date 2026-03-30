import React, { useState } from 'react';
import LiveOrders from './LiveOrders';
import AdminProducts from './AdminProducts';
import AdminDashboard from './AdminDashboard';
import { supabase } from './supabaseClient';

const TABS = [
  { key: 'live',     label: 'Pedidos',       icon: '⚡', color: '#FF4500' },
  { key: 'menu',     label: 'Menú',          icon: '📋', color: '#0ea5e9' },
  { key: 'reports',  label: 'Reportes',      icon: '📊', color: '#22c55e' },
  { key: 'settings', label: 'Config',        icon: '⚙️', color: '#888'    },
];

export default function BusinessHome({ business, onBack }) {
  const [tab, setTab] = useState('live');
  const isShop = business?.business_type === 'SHOP';

  const businessTabs = isShop
    ? TABS.filter(t => t.key !== 'live')  // shops don't have live orders
    : TABS;

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
            <div style={{ fontSize: '11px', color: business.business_type === 'SHOP' ? '#6366f1' : '#FF4500', fontWeight: '700', marginTop: '2px' }}>
              {business.business_type === 'SHOP' ? '🛍️ Tienda' : '🍺 Bar / Restaurante'}
            </div>
          </div>
        </div>

        {/* Quick links for non-admin staff */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <a href={`/?business_id=${business.id}`} target="_blank"
            style={{ padding: '6px 12px', background: '#1a1a1a', color: '#555', borderRadius: '8px', textDecoration: 'none', fontSize: '12px', fontWeight: '700', border: '1px solid #222' }}>
            📱 QR
          </a>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: '72px' }}>
        {tab === 'live'     && <LiveOrders businessId={business.id} business={business} />}
        {tab === 'menu'     && <AdminProducts businessId={business.id} business={business} />}
        {tab === 'reports'  && <AdminDashboard businessId={business.id} />}
        {tab === 'settings' && <BusinessSettings business={business} />}
      </div>

      {/* ── BOTTOM TABS ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(10,10,10,0.97)', borderTop: '1px solid #1a1a1a',
        display: 'flex', backdropFilter: 'blur(12px)', zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {businessTabs.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '12px 4px 10px', background: 'transparent', border: 'none',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                transition: 'all 0.2s',
              }}>
              <span style={{ fontSize: '20px', filter: active ? 'none' : 'grayscale(1) opacity(0.4)' }}>{t.icon}</span>
              <span style={{ fontSize: '10px', fontWeight: '800', color: active ? t.color : '#333', letterSpacing: '0.3px' }}>
                {t.label}
              </span>
              {active && (
                <div style={{ width: '20px', height: '2px', background: t.color, borderRadius: '2px', marginTop: '1px' }} />
              )}
            </button>
          );
        })}
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
    }).eq('id', business.id);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
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
          <p style={{ fontSize: '11px', color: '#333', margin: '5px 0 0 0' }}>Formato internacional, sin + ni espacios</p>
        </div>
      )}

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
        <p style={{ fontSize: '11px', color: '#555', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px 0' }}>Vistas operacionales (para tablets/displays)</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { label: '📱 Menú cliente (QR)', url: `/?business_id=${business.id}` },
            { label: '💵 Caja', url: `/?business_id=${business.id}&view=cashier` },
            { label: '🔥 Cocina', url: `/?business_id=${business.id}&view=kitchen` },
            { label: '🍺 Barra', url: `/?business_id=${business.id}&view=bar` },
          ].map(link => (
            <a key={link.url} href={link.url} target="_blank"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#151515', borderRadius: '8px', textDecoration: 'none', color: '#888', fontSize: '13px', border: '1px solid #1e1e1e' }}>
              <span>{link.label}</span>
              <span style={{ color: '#333', fontSize: '11px' }}>↗</span>
            </a>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving}
        style={{ width: '100%', padding: '16px', background: saved ? '#22c55e' : '#FF4500', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '900', cursor: 'pointer', transition: 'all 0.3s' }}>
        {saving ? 'Guardando...' : saved ? '✅ Guardado' : 'Guardar cambios'}
      </button>
    </div>
  );
}
