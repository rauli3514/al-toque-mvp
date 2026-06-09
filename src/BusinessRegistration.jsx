import React, { useState } from 'react';
import { supabase } from './supabaseClient';

function generateSlug(name, id = '') {
  const safeName = (name || 'negocio').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const prefix = id ? `-${id.slice(0, 4)}` : '';
  return safeName + prefix;
}

export default function BusinessRegistration() {
  const [name, setName] = useState('');
  const [type, setType] = useState('SHOP');
  const [whatsapp, setWhatsapp] = useState('');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) {
      setErrorMsg('El nombre es obligatorio.');
      return;
    }

    setCreating(true);
    setErrorMsg('');

    let finalSlug = generateSlug(name);
    
    // First try
    const { data, error } = await supabase.from('businesses')
      .insert({ 
        name: name.trim(), 
        business_type: type, 
        slug: finalSlug,
        whatsapp_number: whatsapp.trim() || null
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation (slug exists)
        finalSlug = generateSlug(name, Date.now().toString());
        const { data: d2, error: e2 } = await supabase.from('businesses')
          .insert({ 
            name: name.trim(), 
            business_type: type, 
            slug: finalSlug,
            whatsapp_number: whatsapp.trim() || null
          })
          .select()
          .single();
          
        if (e2) {
          setErrorMsg('Hubo un error al crear tu tienda. Intenta nuevamente.');
          setCreating(false);
        } else if (d2) {
          window.location.href = `/b/${d2.slug}`;
        }
      } else {
        setErrorMsg('Error de conexión. Intenta más tarde.');
        setCreating(false);
      }
    } else if (data) {
      // Redirect to admin panel of the newly created store
      window.location.href = `/b/${data.slug}`;
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      
      <div style={{ width: '100%', maxWidth: '450px', background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: '24px', padding: '40px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '900', margin: '0 0 8px 0', background: 'linear-gradient(90deg, #FF4500, #ff8c00)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-1px' }}>
            ⚡ AlToque
          </h1>
          <p style={{ color: '#888', fontSize: '15px', margin: 0 }}>Crea tu catálogo online en segundos.</p>
        </div>

        {errorMsg && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: '12px', marginBottom: '20px', color: '#dc2626', fontSize: '14px', fontWeight: 'bold', textAlign: 'center' }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Nombre */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#ccc', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Nombre del Negocio</label>
            <input
              type="text"
              placeholder="Ej: Mi Tienda Online"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%', padding: '16px', background: '#111', border: '1px solid #222', borderRadius: '12px', color: 'white', fontSize: '15px', outline: 'none', transition: 'border 0.2s', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#FF4500'}
              onBlur={e => e.target.style.borderColor = '#222'}
            />
          </div>

          {/* Rubro */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#ccc', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rubro</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              style={{ width: '100%', padding: '16px', background: '#111', border: '1px solid #222', borderRadius: '12px', color: 'white', fontSize: '15px', cursor: 'pointer', outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none' }}
            >
              <option value="SHOP">🛍️ Tienda (General)</option>
              <option value="FOOD">🍔 Alimentos / Gastronomía</option>
              <option value="DRINKS">🧃 Bebidas</option>
              <option value="FASHION">👗 Indumentaria / Moda</option>
              <option value="BEAUTY">💅 Belleza / Cosméticos</option>
              <option value="TECH">💻 Tecnología</option>
              <option value="MERCH">🎨 Merch / Artesanías</option>
              <option value="GIFTS">🎁 Regalos e Insignias</option>
              <option value="MEDIA">📸 Fotos / Videos</option>
              <option value="OTHER">🧩 Otros</option>
            </select>
          </div>

          {/* WhatsApp */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#ccc', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              WhatsApp (Opcional)
            </label>
            <input
              type="tel"
              placeholder="Ej: 3624123456"
              value={whatsapp}
              onChange={e => setWhatsapp(e.target.value)}
              style={{ width: '100%', padding: '16px', background: '#111', border: '1px solid #222', borderRadius: '12px', color: 'white', fontSize: '15px', outline: 'none', transition: 'border 0.2s', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#25d366'}
              onBlur={e => e.target.style.borderColor = '#222'}
            />
            <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#666' }}>Si lo dejas en blanco, tu página funcionará solo como <strong>catálogo</strong> (sin carrito de compras).</p>
          </div>

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            style={{ 
              marginTop: '10px', width: '100%', padding: '18px', 
              background: name.trim() ? 'linear-gradient(90deg, #FF4500, #ff8c00)' : '#1a1a1a', 
              color: name.trim() ? 'white' : '#555', 
              border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '16px', 
              cursor: name.trim() ? 'pointer' : 'default', transition: 'all 0.2s',
              boxShadow: name.trim() ? '0 4px 15px rgba(255,69,0,0.3)' : 'none'
            }}
          >
            {creating ? 'Creando tienda...' : 'Crear Tienda Ahora'}
          </button>
          
          <div style={{ textAlign: 'center', marginTop: '10px' }}>
             <a href="/" style={{ color: '#888', textDecoration: 'none', fontSize: '13px', fontWeight: '600' }}>← Volver al inicio</a>
          </div>

        </div>
      </div>
    </div>
  );
}
