import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function EventUI({ slug }) {
  const [event, setEvent] = useState(null);
  const [shops, setShops] = useState([]);
  const [dynamicCats, setDynamicCats] = useState([]);
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null);

  useEffect(() => {
    loadEventDetails();
  }, [slug]);

  const loadEventDetails = async () => {
    // 1. Obtener Evento
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('slug', slug)
      .single();

    if (eventError || !eventData) {
      setLoading(false);
      return;
    }
    
    setEvent(eventData);

    // 2. Obtener Tiendas del Evento con TODOS sus productos para búsqueda offline
    const { data: shopData } = await supabase
      .from('event_businesses')
      .select('businesses(*, products(id, name, price, image_url, available, description, is_upsell_target, category_id))')
      .eq('event_id', eventData.id);

    const eventShops = shopData ? shopData.map(item => item.businesses).filter(b => b) : [];

    // Extract categories
    const { data: catsData } = await supabase
      .from('categories')
      .select('id, name')
      .in('business_id', eventShops.map(s => s.id));

    if (catsData) {
      const cMap = new Map(catsData.map(c => [c.id, c.name]));
      eventShops.forEach(s => {
        if (s.products) {
          s.products.forEach(p => {
             p.categoryName = cMap.get(p.category_id) || '';
          });
        }
      });
    }

    // 3. Extraer categorías únicas reales basándonos en los productos de ESTAS tiendas
    const catSet = new Set();
    eventShops.forEach(shop => {
      (shop.products || []).forEach(p => {
         if (p.categoryName) catSet.add(p.categoryName);
      });
    });

    const uniqueCats = Array.from(catSet).map(name => {
         const lower = name.toLowerCase();
         let icon = '🛍️';
         if (lower.includes('hamburguesa') || lower.includes('burger') || lower.includes('comida') || lower.includes('pizza') || lower.includes('lomo')) icon = '🍔';
         else if (lower.includes('bebida') || lower.includes('trago') || lower.includes('cerveza')) icon = '🧃';
         else if (lower.includes('ropa') || lower.includes('indumentaria') || lower.includes('remera')) icon = '👕';
         else if (lower.includes('perfume') || lower.includes('fragancia')) icon = '🧴';
         else if (lower.includes('juego') || lower.includes('gaming') || lower.includes('consolas')) icon = '🎮';
         else if (lower.includes('regalo')) icon = '🎁';
         else if (lower.includes('postre') || lower.includes('dulce') || lower.includes('torta') || lower.includes('helado')) icon = '🍦';
         return { id: name, label: name, icon };
    });

    // 4. Extraer productos destacados (Promos) de ESTAS tiendas
    let eventPromos = [];
    eventShops.forEach(shop => {
      const shopPromos = (shop.products || []).filter(p => p.is_upsell_target && p.available);
      shopPromos.forEach(sp => {
        eventPromos.push({
          ...sp,
          businesses: { name: shop.name, slug: shop.slug, business_type: shop.business_type }
        });
      });
    });

    setShops(eventShops);
    setDynamicCats(uniqueCats);
    setPromos(eventPromos);
    setLoading(false);
  };

  const handleSearch = (query, categoryName = null) => {
    setSearchQuery(query);
    setSelectedCat(categoryName);

    const safeQuery = query.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    if (safeQuery.length < 2 && !categoryName) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    
    // Búsqueda inteligente: detectar si busca promos
    const isPromoSearch = ['promo', 'promos', 'promocion', 'promociones', 'oferta', 'ofertas', 'descuento', 'descuentos'].includes(safeQuery);
    const searchTokens = safeQuery.split(/\s+/).filter(t => t.length > 0);

    const grouped = [];

    shops.forEach(shop => {
      const shopName = shop.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      let matchedProducts = [];
      let shopMatched = false;

      if (categoryName) {
        // Filtrar por categoría
        const catNormal = categoryName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        matchedProducts = (shop.products || []).filter(p => {
           if (!p.available) return false;
           const pCat = (p.categoryName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
           return pCat.includes(catNormal);
        });
      } 
      else if (isPromoSearch) {
        // Si busca "promociones", traemos todos los destacados
        matchedProducts = (shop.products || []).filter(p => p.available && p.is_upsell_target);
      }
      else {
        // Búsqueda por texto (Tokenizada e intuitiva)
        shopMatched = searchTokens.every(token => shopName.includes(token));
        
        matchedProducts = (shop.products || []).filter(p => {
          if (!p.available) return false;
          const pName = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const pDesc = (p.description || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const pCat = (p.categoryName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          
          return searchTokens.every(token => 
            pName.includes(token) || pDesc.includes(token) || pCat.includes(token)
          );
        });
      }

      if (shopMatched || matchedProducts.length > 0) {
         grouped.push({
           ...shop,
           matchedProducts
         });
      }
    });

    setResults(grouped);
    setIsSearching(false);
  };

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F8FAFC', color:'#38BDF8', fontFamily:"'Inter', sans-serif" }}>
        <style>{`@keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(0.95); } 100% { opacity: 1; transform: scale(1); } } .loader { animation: pulse 1.5s infinite; font-weight: 700; font-size: 18px; }`}</style>
        <span className="loader">Cargando evento...</span>
      </div>
    );
  }

  if (!event) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#F8FAFC', color:'#0F172A', fontFamily:"'Inter', sans-serif", gap:'12px' }}>
        <div style={{ fontSize:'48px' }}>🎪</div>
        <p style={{ fontSize:'18px', fontWeight:'700' }}>Evento no encontrado</p>
        <p style={{ fontSize:'13px', color:'#64748B' }}>O ya no está activo</p>
        <a href="/" style={{ marginTop:'8px', padding:'10px 20px', background:'#38BDF8', color:'white', borderRadius:'10px', textDecoration:'none', fontSize:'13px', fontWeight:'700' }}>Volver al inicio</a>
      </div>
    );
  }

  const isShowingResults = searchQuery.trim().length >= 2 || selectedCat;



  return (
    <div style={{ minHeight:'100vh', background:'#F8FAFC', color:'#0F172A', fontFamily:"'Inter', sans-serif", paddingBottom:'90px', overflowX:'hidden' }}>
      
      {/* GLOBAL STYLES MOBILE FIRST */}
      <style>
        {`
          * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
          ::-webkit-scrollbar { width: 0px; height: 0px; background: transparent; }
          
          .sticky-header {
            position: sticky; top: 0; z-index: 50;
            background: rgba(248, 250, 252, 0.95);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border-bottom: 1px solid #E2E8F0;
            padding: 16px 20px 12px;
          }
          
          .search-input-wrapper { position: relative; width: 100%; max-width: 600px; margin: 12px auto 0; }
          .search-input {
            width: 100%; padding: 14px 40px 14px 44px;
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 16px; color: #0F172A; font-size: 15px; font-weight: 500;
            outline: none; transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.02);
          }
          .search-input:focus { border-color: #38BDF8; box-shadow: 0 0 0 4px #E0F2FE; }
          .search-input::placeholder { color: #94A3B8; }
          .search-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #64748B; font-size: 16px; }
          .clear-btn { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); background: #F1F5F9; border: none; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; color: #64748B; font-size: 10px; cursor: pointer; }

          .horizontal-scroll {
            display: flex; gap: 12px; overflow-x: auto; padding: 20px;
            max-width: 600px; margin: 0 auto; scroll-behavior: smooth;
          }
          
          .pill-btn {
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
            padding: 12px 16px; border-radius: 16px; min-width: 76px;
            background: #FFFFFF; border: 1px solid #E2E8F0;
            color: #0F172A; font-size: 13px; font-weight: 600;
            cursor: pointer; transition: all 0.2s ease;
            box-shadow: 0 2px 6px rgba(0,0,0,0.02);
          }
          .pill-btn:active { transform: scale(0.96); background: #F8FAFC; }
          .pill-btn.active { background: #E0F2FE; border-color: #38BDF8; color: #0284C7; }

          .promo-card {
            min-width: 140px; width: 140px; border-radius: 16px; padding: 0;
            background: #FFFFFF; display: flex; flex-direction: column; 
            position: relative; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);
            text-decoration: none; border: 1px solid #E2E8F0;
            transition: transform 0.2s;
          }
          .promo-card:active { transform: scale(0.97); }

          .bottom-nav {
            position: fixed; bottom: 0; left: 0; right: 0;
            background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
            border-top: 1px solid #E2E8F0; padding: 12px 20px 24px;
            display: flex; justify-content: space-around; align-items: center;
            z-index: 100; box-shadow: 0 -4px 20px rgba(0,0,0,0.03);
          }
          .nav-item {
            display: flex; flex-direction: column; align-items: center; gap: 4px;
            color: #64748B; font-size: 11px; font-weight: 600; text-decoration: none;
            transition: color 0.2s;
          }
          .nav-item.active { color: #0F172A; }
          .nav-icon { width: 24px; height: 24px; margin-bottom: 2px; }
        `}
      </style>

      {/* HEADER DINÁMICO DEL EVENTO & BÚSQUEDA STICKY */}
      <div className="sticky-header">
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ width: '20px', height: '20px', background: '#0F172A', borderRadius: '4px', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'10px', fontWeight:'900' }}>🎪</div>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Evento Especial</span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>
            {event.name}
          </h1>
          <p style={{ color: '#64748B', fontSize: '14px', fontWeight: '500', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {event.description || 'Descubrí qué podés comprar'}
          </p>
          
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Buscar pizza, bebidas, regalos..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value, null)}
            />
            {searchQuery && (
              <button className="clear-btn" onClick={() => handleSearch('', null)}>✕</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        
        {/* VISTA DE RESULTADOS AGRUPADOS (TIPO PEDIDOSYA) */}
        {isShowingResults ? (
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom:'20px', fontSize:'14px', color:'#64748B' }}>
              Resultados para: <span style={{ color:'#0F172A', fontWeight:'700' }}>"{selectedCat || searchQuery}"</span>
            </div>

            {results.length === 0 && !isSearching && (
              <div style={{ textAlign:'center', padding:'40px 20px', color:'#64748B' }}>
                <div style={{ fontSize:'40px', marginBottom:'12px' }}>🕵️‍♂️</div>
                <h3 style={{ fontSize:'16px', fontWeight:'700', color:'#0F172A', marginBottom:'6px' }}>Sin resultados</h3>
                <p style={{ fontSize:'14px' }}>Prueba buscar con otras palabras o navega las categorías.</p>
              </div>
            )}

            {results.map(shop => (
              <div key={shop.id} style={{ marginBottom: '32px' }}>
                {/* Header de la tienda */}
                <a href={`/${shop.slug}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none', color: '#0F172A', marginBottom: '12px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: shop.logo_url ? `url(${shop.logo_url}) center/cover` : '#F1F5F9', border: '1px solid #E2E8F0', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                     <div style={{ fontSize: '16px', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                       {shop.name}
                     </div>
                     <div style={{ fontSize: '13px', color: '#64748B', marginTop:'2px', fontWeight:'500' }}>
                       {shop.matchedProducts.length > 0 ? `${shop.matchedProducts.length} coincidencias` : 'Ver catálogo completo'}
                     </div>
                  </div>
                </a>
                
                {/* Productos Matcheados en Carrusel Horizontal */}
                {shop.matchedProducts.length > 0 && (
                  <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', scrollBehavior: 'smooth', marginRight: '-20px', paddingRight: '20px' }}>
                     {shop.matchedProducts.map(prod => (
                        <a key={prod.id} href={`/${shop.slug}`} style={{ minWidth: '130px', width: '130px', textDecoration: 'none', color: '#0F172A', display: 'flex', flexDirection: 'column' }}>
                           <div style={{ width: '100%', height: '110px', borderRadius: '12px', background: prod.image_url ? `url(${prod.image_url}) center/cover` : '#F1F5F9', border: '1px solid #E2E8F0', marginBottom: '8px', flexShrink: 0 }} />
                           <div style={{ fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '2px' }}>{prod.name}</div>
                           <div style={{ fontSize: '14px', fontWeight: '800', color: '#22C55E' }}>${parseFloat(prod.price).toLocaleString('es-AR')}</div>
                        </a>
                     ))}
                  </div>
                )}
                <div style={{ height: '1px', background: '#F1F5F9', margin: '24px 0 0 0' }} />
              </div>
            ))}

          </div>
        ) : (
          
          /* VISTA PRINCIPAL (FEED DE NAVEGACIÓN) */
          <div>
            {/* CATEGORÍAS REALES DEL EVENTO */}
            {dynamicCats.length > 0 && (
              <div className="horizontal-scroll">
                {dynamicCats.map(cat => (
                  <button
                    key={cat.id}
                    className={`pill-btn ${selectedCat === cat.id ? 'active' : ''}`}
                    onClick={() => handleSearch(cat.label, selectedCat === cat.id ? null : cat.id)}
                  >
                    <span style={{ fontSize: '24px' }}>{cat.icon}</span>
                    {cat.label}
                  </button>
                ))}
              </div>
            )}

            {/* CAROUSEL PROMOS DEL EVENTO */}
            {promos.length > 0 && (
              <div style={{ padding: '0 20px', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '12px', color:'#0F172A', display:'flex', alignItems:'center', gap:'6px' }}>
                  🔥 Promos del evento
                </h2>
                <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '10px', scrollBehavior: 'smooth', marginRight:'-20px', paddingRight:'20px' }}>
                  {promos.map((promo, index) => {
                    return (
                      <a key={promo.id} href={`/${promo.businesses.slug}`} className="promo-card">
                        <div style={{ width: '100%', height: '110px', background: promo.image_url ? `url(${promo.image_url}) center/cover` : '#F1F5F9', position: 'relative' }}>
                           <div style={{ position:'absolute', top:'8px', right:'8px', background:'#EF4444', color:'white', fontSize:'10px', fontWeight:'800', padding:'2px 6px', borderRadius:'8px' }}>🔥 PROMO</div>
                        </div>
                        <div style={{ padding: '12px' }}>
                           <div style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '2px' }}>{promo.name}</div>
                           <div style={{ fontSize: '14px', fontWeight: '800', color: '#22C55E', marginBottom: '4px' }}>${parseFloat(promo.price).toLocaleString('es-AR')}</div>
                           <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🏪 {promo.businesses.name}</div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* COMERCIOS DEL EVENTO COMPACTOS */}
            <div style={{ padding: '0 20px 20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '12px', color:'#0F172A' }}>
                🏪 Tiendas Participantes
              </h2>
              
              <div style={{ display: 'flex', flexDirection:'column' }}>
                {shops.map(shop => {
                  const activeProds = shop.products?.filter(p => p.available) || [];
                  
                  return (
                    <div key={shop.id} style={{ marginBottom: '32px' }}>
                      {/* Shop Header */}
                      <a href={`/${shop.slug}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none', color: '#0F172A', marginBottom: '12px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: shop.logo_url ? `url(${shop.logo_url}) center/cover` : '#E2E8F0', border: '1px solid #F1F5F9', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '16px', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {shop.name}
                          </div>
                          <div style={{ fontSize: '13px', color: '#64748B', fontWeight: '500', marginTop: '2px' }}>
                            {shop.business_type === 'SHOP' ? 'Tienda' : shop.business_type} • {activeProds.length} productos
                          </div>
                        </div>
                      </a>
                      
                      {/* Products Carousel */}
                      {activeProds.length > 0 && (
                        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', scrollBehavior: 'smooth', marginRight: '-20px', paddingRight: '20px' }}>
                          {activeProds.slice(0, 8).map(prod => (
                            <a key={prod.id} href={`/${shop.slug}`} style={{ minWidth: '130px', width: '130px', textDecoration: 'none', color: '#0F172A', display: 'flex', flexDirection: 'column' }}>
                              <div style={{ width: '100%', height: '110px', borderRadius: '12px', background: prod.image_url ? `url(${prod.image_url}) center/cover` : '#F1F5F9', border: '1px solid #E2E8F0', marginBottom: '8px', flexShrink: 0 }} />
                              <div style={{ fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '2px' }}>{prod.name}</div>
                              <div style={{ fontSize: '14px', fontWeight: '800', color: '#22C55E' }}>${parseFloat(prod.price).toLocaleString('es-AR')}</div>
                            </a>
                          ))}
                        </div>
                      )}
                      
                      <div style={{ height: '1px', background: '#F1F5F9', margin: '24px 0 0 0' }} />
                    </div>
                  );
                })}
                
                {shops.length === 0 && (
                  <div style={{ color: '#64748B', textAlign:'center', padding:'40px 20px', background:'#FFFFFF', borderRadius:'16px', border:'1px solid #E2E8F0' }}>
                    <p>Aún no hay tiendas participando en este evento.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* BOTTOM NAVIGATION FIXED */}
      <div className="bottom-nav">
        <a href={`/eventos/${slug}`} className="nav-item active">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
          <span>Inicio</span>
        </a>
        <a href="#" className="nav-item" onClick={(e)=>{ e.preventDefault(); window.scrollTo(0,0); document.querySelector('.search-input').focus(); }}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <span>Buscar</span>
        </a>
        <a href="#" className="nav-item" onClick={(e)=>{ e.preventDefault(); window.scrollTo(0,0); handleSearch('promos', null); }}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="2"></circle><circle cx="15" cy="15" r="2"></circle><line x1="19" y1="5" x2="5" y2="19"></line></svg>
          <span>Promos</span>
        </a>
      </div>

    </div>
  );
}
