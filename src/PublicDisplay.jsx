import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

export default function PublicDisplay({ businessId }) {
  const [preparing, setPreparing] = useState([]);
  const [ready, setReady] = useState([]);
  const [newReady, setNewReady] = useState(new Set()); // tracks freshly-READY order ids for flash
  const prevReadyIds = useRef(new Set());

  useEffect(() => {
    fetchOrders();
    const channel = supabase.channel(`public-display-${businessId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `business_id=eq.${businessId}`
      }, (payload) => {
        fetchOrders();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [businessId]);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('display_number, status, id')
      .eq('business_id', businessId)
      .in('status', ['PAID', 'IN_PREPARATION', 'READY'])
      .order('created_at', { ascending: true })
      .limit(30);

    if (!data) return;

    const prep = data.filter(o => o.status === 'PAID' || o.status === 'IN_PREPARATION');
    const rdyOrders = data.filter(o => o.status === 'READY');

    // Detect newly READY orders
    const currentReadyIds = new Set(rdyOrders.map(o => o.id));
    const newlyReady = new Set([...currentReadyIds].filter(id => !prevReadyIds.current.has(id)));
    prevReadyIds.current = currentReadyIds;

    if (newlyReady.size > 0) {
      setNewReady(newlyReady);
      setTimeout(() => setNewReady(new Set()), 4000); // remove flash after 4s
    }

    setPreparing(prep);
    setReady(rdyOrders);
  };

  const NumberBadge = ({ order, isReady }) => {
    const isNew = newReady.has(order.id);
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isNew ? '#28a745' : isReady ? '#1a3320' : '#1a1a1a',
        border: `3px solid ${isNew ? '#5dde7a' : isReady ? '#28a745' : '#333'}`,
        borderRadius: '16px',
        padding: '20px 15px',
        animation: isNew ? 'flashGreen 4s ease-in-out' : 'none',
        transition: 'all 0.3s',
        minWidth: '120px',
      }}>
        <span style={{
          fontSize: 'clamp(48px, 6vw, 80px)',
          fontWeight: '900',
          color: isNew ? 'white' : isReady ? '#5dde7a' : '#ffffff',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}>
          {order.display_number}
        </span>
      </div>
    );
  };

  return (
    <div style={{ background: '#080808', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '20px 30px', background: '#111', borderBottom: '2px solid #222' }}>
        <span style={{ fontSize: 'clamp(22px, 3vw, 36px)', fontWeight: '900', color: '#aaaaaa' }}>⏳ EN PREPARACIÓN</span>
        <span style={{ fontSize: 'clamp(14px, 2vw, 20px)', color: '#444', fontWeight: 'bold' }}>AL TOQUE</span>
        <span style={{ fontSize: 'clamp(22px, 3vw, 36px)', fontWeight: '900', color: '#28a745' }}>✅ LISTOS PARA RETIRAR</span>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* LEFT: Preparing */}
        <div style={{ flex: 1, padding: '25px', borderRight: '3px solid #1a1a1a', overflowY: 'auto' }}>
          {preparing.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#333', marginTop: '80px', fontSize: '24px' }}>—</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'center', alignContent: 'flex-start' }}>
              {preparing.slice(0, 15).map(o => <NumberBadge key={o.id} order={o} isReady={false} />)}
            </div>
          )}
        </div>

        {/* RIGHT: Ready */}
        <div style={{ flex: 1, padding: '25px', overflowY: 'auto' }}>
          {ready.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#333', marginTop: '80px', fontSize: '24px' }}>—</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'center', alignContent: 'flex-start' }}>
              {ready.slice(0, 15).map(o => <NumberBadge key={o.id} order={o} isReady={true} />)}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes flashGreen {
          0%, 100% { background: #28a745; box-shadow: 0 0 0 0 rgba(93,222,122,0); }
          20% { background: #5dde7a; box-shadow: 0 0 40px 20px rgba(93,222,122,0.6); }
          60% { background: #28a745; box-shadow: 0 0 0 0 rgba(93,222,122,0); }
        }
      `}</style>
    </div>
  );
}
