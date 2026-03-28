import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function AdminProducts({ businessId }) {
  const [productsList, setProductsList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isUpsell, setIsUpsell] = useState(false);

  useEffect(() => {
    fetchData();
  }, [businessId]);

  const fetchData = async () => {
    const { data: cats } = await supabase.from('categories').select('*').eq('business_id', businessId);
    if (cats) setCategories(cats);
  };

  const addCategory = async () => {
    const catName = prompt('Nombre de la Categoría:');
    if (!catName) return;
    const { data } = await supabase.from('categories').insert({ business_id: businessId, name: catName }).select().single();
    if (data) setCategories([...categories, data]);
  };

  const addProduct = async (e) => {
    e.preventDefault();
    if (!name || !price || !categoryId) return alert("Llena los campos");
    
    const { error } = await supabase.from('products').insert({
      business_id: businessId,
      category_id: categoryId,
      name: name,
      price: parseFloat(price),
      is_upsell_target: isUpsell
    });

    if (error) alert("Error guardando producto: " + error.message);
    else {
      alert("✅ Guardado!");
      setName('');
      setPrice('');
      setIsUpsell(false);
    }
  };

  return (
    <div style={{padding:'20px', background:'#121212', minHeight:'100vh', color:'white'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
         <h2 style={{color:'var(--primary)', margin:0}}>Cargador Básico de Menú</h2>
         <button onClick={() => window.location.href = `/?business_id=${businessId}`} style={{background:'#28a745', color:'white', border:'none', padding:'10px 20px', borderRadius:'8px', fontWeight:'bold', cursor:'pointer'}}>
            👀 Ver Menú (Modo Cliente)
         </button>
      </div>

      <div style={{marginBottom:'30px', padding:'20px', background:'#1e1e1e', borderRadius:'12px'}}>
         <h4>Paso 1: Categorías</h4>
         <p style={{fontSize:'12px', color:'#aaa'}}>Las categorías son obligatorias.</p>
         <ul>{categories.map(c => <li key={c.id}>{c.name}</li>)}</ul>
         <button onClick={addCategory} style={{padding:'10px', background:'#333', color:'#fff', border:'none', borderRadius:'8px'}}>+ Crear Categoría</button>
      </div>

      <div style={{padding:'20px', background:'#1e1e1e', borderRadius:'12px'}}>
         <h4>Paso 2: Nuevo Producto</h4>
         <form onSubmit={addProduct} style={{display:'flex', flexDirection:'column', gap:'15px'}}>
           
           <input type="text" placeholder="Nombre (ej. Cerveza IPA)" value={name} onChange={e => setName(e.target.value)} 
                  style={{padding:'15px', borderRadius:'10px', background:'#333', color:'white', border:'none'}}/>
                  
           <input type="number" placeholder="Precio (ej. 5000)" value={price} onChange={e => setPrice(e.target.value)} 
                  style={{padding:'15px', borderRadius:'10px', background:'#333', color:'white', border:'none'}}/>
                  
           <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{padding:'15px', borderRadius:'10px', background:'#333', color:'white', border:'none'}}>
             <option value="">Selecciona Categoría...</option>
             {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
           </select>

           <label style={{display:'flex', alignItems:'center', gap:'10px', background:'#333', padding:'15px', borderRadius:'10px', cursor:'pointer'}}>
             <input type="checkbox" checked={isUpsell} onChange={e => setIsUpsell(e.target.checked)} style={{width:'20px', height:'20px'}} />
             <span>🔥 Marcar como producto Recomendado (Upsell)</span>
           </label>

           <button type="submit" style={{padding:'15px', background:'var(--primary)', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', fontSize:'16px'}}>
             Agregar Producto
           </button>
         </form>
      </div>
      
    </div>
  );
}
