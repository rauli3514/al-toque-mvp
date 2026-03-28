import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import CustomerUI from './CustomerUI';
import AdminDashboard from './AdminDashboard';
import AdminProducts from './AdminProducts';

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

  if (!businessId) {
    return (
      <div style={{padding: '30px', textAlign:'center', minHeight:'100vh', background:'#121212', color:'white', display:'flex', flexDirection:'column', alignItems:'center'}}>
         <h1 style={{color:'var(--primary)', fontSize:'48px', margin:'20px 0'}}>⚡ AlToque</h1>
         <p style={{fontSize:'18px', color:'#aaa', marginBottom:'40px'}}>Panel Super-Admin Multi-tenant</p>
         
         {businessesList.length > 0 && (
           <div style={{width:'100%', maxWidth:'600px', display:'flex', flexDirection:'column', gap:'15px', marginBottom:'40px'}}>
              <h3 style={{textAlign:'left', color:'#888', margin:0}}>TUS BARES REGISTRADOS:</h3>
              {businessesList.map(b => (
                 <div key={b.id} style={{background:'#1e1e1e', padding:'20px', borderRadius:'12px', border:'1px solid #333', textAlign:'left', position:'relative'}}>
                    <button onClick={() => deleteBusiness(b.id, b.name)} style={{position:'absolute', right:'20px', top:'20px', background:'#ff4444', color:'white', border:'none', borderRadius:'6px', padding:'5px 10px', cursor:'pointer', fontWeight:'bold'}}>🗑️ Eliminar</button>
                    <h2 style={{margin:'0 0 5px 0', color:'white', fontSize:'24px', paddingRight:'80px'}}>{b.name}</h2>
                    <p style={{fontSize:'12px', color:'#666', marginBottom:'20px', fontFamily:'monospace'}}>BusinessID: {b.id}</p>
                    <div style={{display:'flex', gap:'15px', flexWrap:'wrap'}}>
                       <a href={`/?business_id=${b.id}`} style={{background:'#333', padding:'10px 15px', borderRadius:'8px', color:'var(--primary)', textDecoration:'none', fontSize:'14px', fontWeight:'bold'}}>
                         📱 Ver Menú QR
                       </a>
                       <a href={`/?business_id=${b.id}&view=admin`} style={{background:'#333', padding:'10px 15px', borderRadius:'8px', color:'var(--success)', textDecoration:'none', fontSize:'14px', fontWeight:'bold'}}>
                         🧮 Pantalla de Caja
                       </a>
                       <a href={`/?business_id=${b.id}&view=products`} style={{background:'#333', padding:'10px 15px', borderRadius:'8px', color:'#17a2b8', textDecoration:'none', fontSize:'14px', fontWeight:'bold'}}>
                         ✏️ Subir Bebidas/Precios
                       </a>
                    </div>
                 </div>
              ))}
           </div>
         )}

         <div style={{background:'#1e1e1e', padding:'30px', borderRadius:'20px', border:'1px solid #333', maxWidth:'600px', width:'100%', marginBottom:'50px'}}>
            <h3 style={{marginTop:0}}>¿Necesitas armar un nuevo comercio?</h3>
            <button onClick={createDemoBusiness} style={{background:'var(--success)', color:'white', border:'none', padding:'15px', width:'100%', borderRadius:'12px', fontSize:'16px', fontWeight:'bold', cursor:'pointer', boxShadow:'0 5px 15px rgba(40,167,69,0.3)'}}>
              + Crear Nuevo Bar al Instante 🚀
            </button>
         </div>
      </div>
    );
  }

  if (view === 'admin') return <AdminDashboard businessId={businessId} />;
  if (view === 'products') return <AdminProducts businessId={businessId} />;
  return <CustomerUI businessId={businessId} />;
}

export default App;
