import React, { useState } from 'react';
import CustomerUI from './CustomerUI';
import AdminDashboard from './AdminDashboard';
import KitchenMode from './KitchenMode';

function App() {
  const [viewMode, setViewMode] = useState('selector');

  const businessInfo = {
    id: "altoque-bar-1",
    name: "Cervecería Patagonia"
  };

  if (viewMode === 'customer') {
    return (
      <div className="app-container customer-container" style={{background: '#121212'}}>
         <CustomerUI businessId={businessInfo.id} businessName={businessInfo.name} />
         <button className="back-btn" onClick={() => setViewMode('selector')}>↩ Modo Entwickler</button>
      </div>
    );
  }

  if (viewMode === 'admin') {
    return (
      <div className="admin-container" style={{background: '#111'}}>
         <AdminDashboard businessId={businessInfo.id} />
         <button className="back-btn-admin" style={{position:'fixed', bottom:'20px', left:'20px', background:'#333'}} onClick={() => setViewMode('selector')}>Volver Selector</button>
      </div>
    );
  }

  if (viewMode === 'kitchen') {
    return (
      <div className="admin-container" style={{background: '#0a0a0a'}}>
         <KitchenMode businessId={businessInfo.id} />
         <button className="back-btn-admin" style={{position:'fixed', bottom:'20px', left:'20px', background:'#333'}} onClick={() => setViewMode('selector')}>Volver Selector</button>
      </div>
    );
  }

  return (
    <div className="app-container" style={{display:'flex', justifyContent:'center', minHeight:'100vh', background:'#121212'}}>
      <main className="role-selector" style={{width:'100%', maxWidth:'400px'}}>
        <h1 className="demo-title">⚡ AlToque</h1>
        <p style={{color:'#a0a0a0', marginBottom:'40px', fontSize:'18px'}}>
          Selecciona tu Rol de Operación:
        </p>
        
        <button className="btn-primary" onClick={() => setViewMode('customer')}>
          Escanear QR MESA 12 📱
        </button>
        
        <button className="btn-outline" onClick={() => setViewMode('admin')}>
          Dashboard de Caja (Admin) 🧮
        </button>

        <button className="btn-outline" style={{borderColor: 'var(--primary)', color: 'var(--primary)'}} onClick={() => setViewMode('kitchen')}>
          Pantalla de Cocina / Barra 🔥
        </button>
      </main>
    </div>
  );
}

export default App;
