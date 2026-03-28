import React from 'react';
import { supabase } from './supabaseClient';
import CustomerUI from './CustomerUI';
import AdminDashboard from './AdminDashboard';
import AdminProducts from './AdminProducts';

function App() {
  const queryParams = new URLSearchParams(window.location.search);
  const businessId = queryParams.get('business_id');
  const view = queryParams.get('view') || 'customer';

  const createDemoBusiness = async () => {
    const { data, error } = await supabase.from('businesses').insert({ name: '🍺 Bar Demo AlToque' }).select().single();
    if (error) return alert("Error conectando a Supabase. ¿Ya pegaste las llaves en Vercel/.env y corriste el SQL?");
    if (data) {
      window.location.href = `/?business_id=${data.id}&view=products`;
    }
  };

  if (!businessId) {
    return (
      <div style={{padding: '30px', textAlign:'center', minHeight:'100vh', background:'#121212', color:'white', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
         <h1 style={{color:'var(--primary)', fontSize:'48px'}}>⚡ AlToque</h1>
         <p style={{fontSize:'18px', color:'#aaa', marginBottom:'40px'}}>Tu Motor de Ventas QR está listo para arrancar.</p>
         
         <div style={{background:'#1e1e1e', padding:'30px', borderRadius:'20px', border:'1px solid #333', maxWidth:'400px'}}>
            <h3 style={{marginTop:0}}>¿Aún no tienes un comercio creado?</h3>
            <p style={{fontSize:'14px', color:'#888', marginBottom:'25px'}}>Generaremos uno automáticamente en tu base de datos para que empieces a cargar tus bebidas al instante.</p>
            <button onClick={createDemoBusiness} style={{background:'var(--success)', color:'white', border:'none', padding:'15px', width:'100%', borderRadius:'12px', fontSize:'16px', fontWeight:'bold', cursor:'pointer', boxShadow:'0 5px 15px rgba(40,167,69,0.3)'}}>
              Crear mi primer Bar Demo 🚀
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
