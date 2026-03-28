import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function AdminProducts({ businessId }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [isUpsell, setIsUpsell] = useState(false);

  useEffect(() => {
    fetchData();
  }, [businessId]);

  const fetchData = async () => {
    const [catsReq, prodsReq] = await Promise.all([
      supabase.from('categories').select('*').eq('business_id', businessId),
      supabase.from('products').select('*').eq('business_id', businessId).is('deleted_at', null).order('created_at', { ascending: false })
    ]);
    if (catsReq.data) setCategories(catsReq.data);
    if (prodsReq.data) setProducts(prodsReq.data);
  };

  const addCategory = async () => {
    const catName = prompt('Nombre de la Categoría (Ej: Bebidas, Comida, Promos):');
    if (!catName) return;
    const { data, error } = await supabase.from('categories').insert({ business_id: businessId, name: catName }).select().single();
    if (data) setCategories([...categories, data]);
    if (error) alert("Error: " + error.message);
  };

  const addProduct = async (e) => {
    e.preventDefault();
    if (!name || !price || !categoryId) return alert("Llena todos los campos (Condición opcional)");
    
    // Convert to lowercase and sanitize slightly if provided
    const cleanDesc = description ? description.toLowerCase().trim() : null;

    const { error } = await supabase.from('products').insert({
      business_id: businessId,
      category_id: categoryId,
      name: name,
      description: cleanDesc,
      price: parseFloat(price),
      is_upsell_target: isUpsell,
      available: true
    });

    if (error) alert("Error guardando producto: " + error.message);
    else {
      setName('');
      setPrice('');
      setDescription('');
      setIsUpsell(false);
      fetchData(); // reload
    }
  };

  const toggleProductField = async (productId, field, currentValue) => {
    const { error } = await supabase.from('products').update({ [field]: !currentValue }).eq('id', productId);
    if (!error) fetchData();
  };

  const deleteProduct = async (productId, productName) => {
    if (window.confirm(`¿Seguro que deseas eliminar "${productName}"?`)) {
       // Using Soft Delete to prevent wiping historical Order Items that rely on this product ID
       const { error } = await supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', productId);
       if (!error) fetchData();
       else alert("Error al eliminar: " + error.message);
    }
  };

  return (
    <div style={{padding:'20px', background:'#121212', minHeight:'100vh', color:'white'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
         <h2 style={{color:'var(--primary)', margin:0}}>Gestor de Menú y Promos</h2>
         <button onClick={() => window.location.href = `/?business_id=${businessId}`} style={{background:'#28a745', color:'white', border:'none', padding:'10px 20px', borderRadius:'8px', fontWeight:'bold', cursor:'pointer'}}>
            👀 Ver Menú (Modo Cliente)
         </button>
      </div>

      <div style={{display:'flex', gap:'20px', flexWrap:'wrap', marginBottom:'40px'}}>
        {/* CARGADOR */}
        <div style={{flex:'1', minWidth:'300px', padding:'20px', background:'#1e1e1e', borderRadius:'12px'}}>
          <h4 style={{marginTop:0}}>Paso 1: Categorías</h4>
          <p style={{fontSize:'12px', color:'#aaa'}}>Las categorías son obligatorias.</p>
          <button onClick={addCategory} style={{padding:'10px', background:'#333', color:'#fff', border:'none', borderRadius:'8px', width:'100%', marginBottom:'20px'}}>+ Crear Categoría</button>

          <h4 style={{borderTop:'1px solid #333', paddingTop:'20px'}}>Paso 2: Nuevo Producto o Promo</h4>
          <form onSubmit={addProduct} style={{display:'flex', flexDirection:'column', gap:'15px'}}>     
            <input type="text" placeholder="Nombre (ej. Promo Happy Hour)" value={name} onChange={e => setName(e.target.value)} 
                    style={{padding:'15px', borderRadius:'10px', background:'#333', color:'white', border:'none'}}/>
                    
            <input type="number" placeholder="Precio (ej. 5000)" value={price} onChange={e => setPrice(e.target.value)} 
                    style={{padding:'15px', borderRadius:'10px', background:'#333', color:'white', border:'none'}}/>
                    
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{padding:'15px', borderRadius:'10px', background:'#333', color:'white', border:'none'}}>
              <option value="">Selecciona Categoría...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <label style={{display:'flex', alignItems:'center', gap:'10px', background:'#333', padding:'15px', borderRadius:'10px', cursor:'pointer', border: isUpsell ? '2px solid var(--primary)' : '2px solid transparent'}}>
              <input type="checkbox" checked={isUpsell} onChange={e => setIsUpsell(e.target.checked)} style={{width:'20px', height:'20px'}} />
              <span>🔥 Activar en Popup Sugerencias (Upsell)</span>
            </label>

            {isUpsell && (
              <div style={{background:'#222', padding:'15px', borderRadius:'10px', display:'flex', flexDirection:'column', gap:'10px'}}>
                 <label style={{fontSize:'12px', color:'#aaa'}}>
                    <b>Condición Estricta (Opcional)</b><br/>Si escribes una palabra aquí (ej: "pizza"), esta sugerencia <b>SOLO aparecerá</b> si el cliente compra algo que contenga esa palabra. Si lo dejas vacío, aparecerá aleatoriamente.
                 </label>
                 <input type="text" placeholder="Ej: pizza, hamburguesa, cerveza" value={description} onChange={e => setDescription(e.target.value)} style={{padding:'15px', borderRadius:'10px', background:'#111', color:'white', border:'1px solid #444'}}/>
              </div>
            )}

            <button type="submit" style={{padding:'15px', background:'var(--primary)', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', fontSize:'16px'}}>
              Agregar Producto
            </button>
          </form>
        </div>

        {/* LISTADO Y ADMINISTRACION */}
        <div style={{flex:'2', minWidth:'300px', padding:'20px', background:'#1a1a1a', borderRadius:'12px'}}>
          <h3 style={{marginTop:0, borderBottom:'1px solid #333', paddingBottom:'10px'}}>Tu Menú Activo</h3>
          {categories.length === 0 && <p style={{color:'#666'}}>No hay productos todavía.</p>}

          <div style={{display:'flex', flexDirection:'column', gap:'30px'}}>
             {categories.map(cat => {
                const catProds = products.filter(p => p.category_id === cat.id);
                if (catProds.length === 0) return null;
                return (
                  <div key={cat.id}>
                     <h4 style={{color:'var(--primary)', margin:'0 0 15px 0', borderBottom:'1px dashed #444', paddingBottom:'5px'}}>{cat.name}</h4>
                     
                     <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                        {catProds.map(p => (
                           <div key={p.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#222', padding:'10px 15px', borderRadius:'8px', opacity: p.available ? 1 : 0.4}}>
                              <div style={{flexGrow:1}}>
                                 <strong style={{fontSize:'16px', color: p.is_upsell_target ? 'var(--primary)' : 'white'}}>{p.name}</strong> 
                                 <span style={{color:'var(--success)', marginLeft:'10px', fontWeight:'bold'}}>${p.price}</span>
                                 {p.is_upsell_target && <span style={{marginLeft:'10px', fontSize:'10px', background:'var(--primary)', color:'white', padding:'2px 6px', borderRadius:'4px'}}>UPSELL</span>}
                              </div>
                              <div style={{display:'flex', gap:'10px'}}>
                                 <button onClick={() => toggleProductField(p.id, 'is_upsell_target', p.is_upsell_target)} style={{background: p.is_upsell_target ? 'var(--primary)' : '#444', color:'white', border:'none', padding:'8px 12px', borderRadius:'6px', cursor:'pointer', fontSize:'12px'}}>
                                    🔥 {p.is_upsell_target ? 'Quitar Popup' : 'Sugerir (Popup)'}
                                 </button>
                                 <button onClick={() => toggleProductField(p.id, 'available', p.available)} style={{background: p.available ? '#28a745' : '#444', color:'white', border:'none', padding:'8px 12px', borderRadius:'6px', cursor:'pointer', fontSize:'12px'}}>
                                    {p.available ? 'En Stock' : 'Agotado'}
                                 </button>
                                 <button onClick={() => deleteProduct(p.id, p.name)} style={{background:'transparent', color:'#ff4444', border:'1px solid #ff4444', padding:'8px 12px', borderRadius:'6px', cursor:'pointer', fontSize:'12px'}}>
                                    🗑️ Borrar
                                 </button>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
                )
             })}
          </div>
        </div>

      </div>
    </div>
  );
}
