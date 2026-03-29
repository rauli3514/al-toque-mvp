import React, { useState } from 'react';
import { supabase } from './supabaseClient';

const DRINK_KEYWORDS = ['cerveza', 'ipa', 'quilmes', 'heineken', 'stella', 'beer', 'vino', 'fernet', 'aperol', 'gin', 'vodka', 'whisky', 'clericot', 'limonada', 'gaseosa', 'agua', 'jugo', 'lata', '473', '1l', '1lt', 'litro'];

function detectCategory(name) {
  const lower = name.toLowerCase();
  return DRINK_KEYWORDS.some(k => lower.includes(k)) ? 'Bebidas' : 'Comida';
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Match last number (with optional dots/commas) as price
  const priceMatch = trimmed.match(/[\d.,]+\s*$/);
  if (!priceMatch) return null;
  const priceStr = priceMatch[0].replace(/[.,]/g, '').trim();
  const price = parseInt(priceStr);
  if (!price || price < 10) return null;
  const name = trimmed.slice(0, trimmed.lastIndexOf(priceMatch[0])).replace(/[-–|]+$/, '').trim();
  if (!name) return null;
  return { name, price, category: detectCategory(name) };
}

export default function MenuImport({ businessId }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState(null); // null | 'loading' | 'done' | 'error'
  const [imported, setImported] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const handleImport = async () => {
    const lines = text.split('\n');
    const parsed = lines.map(parseLine).filter(Boolean);
    if (parsed.length === 0) {
      setErrorMsg('No se encontraron productos con precio válido. Revisá el formato.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      // Get or create categories
      const categoryNames = [...new Set(parsed.map(p => p.category))];
      const { data: existingCats } = await supabase.from('categories').select('id, name').eq('business_id', businessId);
      const catMap = {};
      existingCats?.forEach(c => { catMap[c.name] = c.id; });

      for (const catName of categoryNames) {
        if (!catMap[catName]) {
          const { data: newCat } = await supabase.from('categories').insert({ business_id: businessId, name: catName }).select().single();
          if (newCat) catMap[catName] = newCat.id;
        }
      }

      // Insert products
      const toInsert = parsed.map(p => ({
        business_id: businessId,
        category_id: catMap[p.category],
        name: p.name,
        price: p.price,
        available: true,
        deleted_at: null,
        is_upsell_target: false,
      }));

      const { error } = await supabase.from('products').insert(toInsert);
      if (error) throw error;

      setImported(parsed);
      setStatus('done');
      setText('');
    } catch (e) {
      setErrorMsg('Error al importar: ' + e.message);
      setStatus('error');
    }
  };

  return (
    <div style={{ background: '#121212', minHeight: '100vh', padding: '30px 20px', color: 'white', maxWidth: '700px', margin: '0 auto' }}>
      <h1 style={{ color: 'var(--primary)', margin: '0 0 5px 0', fontSize: '28px' }}>⚡ Importar Menú</h1>
      <p style={{ color: '#888', margin: '0 0 25px 0', fontSize: '14px' }}>
        Pegá tu menú en texto. Un producto por línea. El precio debe ser el último número.
      </p>

      <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '4px', marginBottom: '15px' }}>
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); setStatus(null); }}
          placeholder={`Ej:\nIPA Patagonia 473ml - 2500\nQuilmes 1L 3000\nHamburguesa completa - 4500\nPapas fritas - 1800\nEmpanadas x3 - 2200`}
          rows={14}
          style={{
            width: '100%', background: 'transparent', border: 'none', color: 'white',
            fontSize: '16px', lineHeight: '1.7', resize: 'vertical', outline: 'none',
            padding: '12px', boxSizing: 'border-box', fontFamily: 'monospace'
          }}
        />
      </div>

      {/* Preview */}
      {text.trim() && (
        <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', padding: '15px', marginBottom: '15px' }}>
          <p style={{ margin: '0 0 10px 0', color: '#888', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Vista previa ({text.split('\n').map(parseLine).filter(Boolean).length} productos)</p>
          {text.split('\n').map(parseLine).filter(Boolean).map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #222' }}>
              <div>
                <span style={{ color: 'white', fontWeight: 'bold' }}>{p.name}</span>
                <span style={{ marginLeft: '10px', fontSize: '11px', background: p.category === 'Bebidas' ? '#17a2b820' : '#b8860b20', color: p.category === 'Bebidas' ? '#17a2b8' : '#b8860b', padding: '2px 8px', borderRadius: '4px' }}>{p.category}</span>
              </div>
              <span style={{ color: 'var(--success)', fontWeight: '900' }}>${p.price.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleImport}
        disabled={!text.trim() || status === 'loading'}
        style={{ width: '100%', padding: '18px', background: status === 'loading' ? '#555' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 5px 20px rgba(255,69,0,0.3)' }}>
        {status === 'loading' ? '⏳ Importando...' : '⚡ Importar Menú'}
      </button>

      {status === 'done' && (
        <div style={{ marginTop: '20px', background: '#0d2b0d', border: '2px solid #28a745', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ color: '#28a745', margin: '0 0 10px 0' }}>✅ Menú cargado correctamente</h3>
          <p style={{ color: '#aaa', margin: 0 }}>{imported.length} productos importados.</p>
          <a href={`/?business_id=${businessId}&view=products`} style={{ display: 'inline-block', marginTop: '15px', color: '#17a2b8', fontWeight: 'bold' }}>Ver y editar productos →</a>
        </div>
      )}

      {status === 'error' && (
        <div style={{ marginTop: '20px', background: '#2b0d0d', border: '2px solid #dc3545', borderRadius: '12px', padding: '15px' }}>
          <p style={{ color: '#dc3545', margin: 0, fontWeight: 'bold' }}>❌ {errorMsg}</p>
        </div>
      )}

      <div style={{ marginTop: '30px', background: '#1a1a1a', borderRadius: '10px', padding: '15px', border: '1px solid #2a2a2a' }}>
        <p style={{ color: '#666', margin: '0 0 8px 0', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Formatos aceptados</p>
        <p style={{ color: '#555', fontSize: '13px', margin: 0, lineHeight: 1.8, fontFamily: 'monospace' }}>
          IPA Patagonia 473ml - 2500<br />
          Quilmes 1L 3000<br />
          Hamburguesa completa - 4.500<br />
          Papas fritas 1800
        </p>
      </div>
    </div>
  );
}
