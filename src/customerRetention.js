/**
 * customerRetention.js
 * Shared utilities for the customer retention system.
 */

export function normalizePhone(phone) {
  if (!phone) return '';
  // 1. Clean all non-digits
  let clean = phone.replace(/\D/g, '');

  // 2. Argentine Logic:
  // If it has 10 digits (e.g. 3624123456), it's a local number without country code or mobile prefix (9)
  if (clean.length === 10) {
    clean = '549' + clean;
  }
  // If it starts with 0 (e.g. 0362...), remove the 0
  else if (clean.startsWith('0') && clean.length === 11) {
    clean = '549' + clean.substring(1);
  }
  // If it starts with 54 but is missing the 9 (e.g. 54362...), add the 9
  else if (clean.startsWith('54') && !clean.startsWith('549') && clean.length === 12) {
    clean = '549' + clean.substring(2);
  }

  return clean;
}

// ── Tiers ─────────────────────────────────────────────────────────────────────
export function getLoyaltyTier(totalOrders) {
  if (totalOrders >= 10) return { tier: 'GOLD',   emoji: '🏆', label: 'Cliente Gold',      next: null,          reward: '¡Recompensa Gold desbloqueada!' };
  if (totalOrders >= 5)  return { tier: 'SILVER', emoji: '⭐', label: 'Cliente frecuente', next: 10 - totalOrders, reward: '¡Recompensa desbloqueada! 🎁' };
  return                        { tier: 'BRONZE', emoji: '🌱', label: 'Cliente nuevo',      next: 5 - totalOrders,  reward: null };
}

// ── WhatsApp loyalty message ──────────────────────────────────────────────────
export function buildLoyaltyMessage({ businessName, customerName, totalOrders }) {
  const tier   = getLoyaltyTier(totalOrders);
  const name   = customerName ? `, ${customerName.split(' ')[0]}` : '';
  const orders = totalOrders;

  let msg = `¡Gracias por tu compra en *${businessName}* 🍺\n\n`;
  msg += `Llevás *${orders} pedido${orders !== 1 ? 's' : ''}* con nosotros ${tier.emoji}\n`;

  if (tier.tier === 'BRONZE' && tier.next !== null) {
    msg += `\nA los *5 pedidos* → recompensa especial 🎁\nTe faltan *${tier.next}* para llegar.`;
  } else if (tier.tier === 'SILVER') {
    msg += `\n¡Ya sos cliente frecuente! 🎉\nA los *10 pedidos* → recompensa Gold 🏆\nTe faltan *${tier.next}*.`;
  } else if (tier.tier === 'GOLD') {
    msg += `\n¡Sos cliente Gold! 🏆\n¡Contactanos para reclamar tu beneficio exclusivo!`;
  }

  return msg;
}

export function openWhatsAppLoyalty({ phone, businessName, customerName, totalOrders }) {
  const clean = normalizePhone(phone);
  if (!clean) return false;
  const msg = buildLoyaltyMessage({ businessName, customerName, totalOrders });
  const url = `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`;
  const w   = window.open(url, '_blank');
  if (!w) window.location.href = url; // fallback for mobile
  return true;
}

// ── Upsert customer (frontend fallback if trigger not set up) ─────────────────
export async function upsertCustomer(supabase, { businessId, phone, name }) {
  if (!phone?.trim()) return null;
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return null;

  const { data, error } = await supabase
    .from('customers')
    .upsert({
      business_id:   businessId,
      phone:         cleanPhone,
      name:          name?.trim() || null,
      total_orders:  1,
      last_order_at: new Date().toISOString(),
    }, {
      onConflict:   'business_id,phone',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  return error ? null : data;
}

// ── Fetch customer by phone ───────────────────────────────────────────────────
export async function fetchCustomer(supabase, { businessId, phone }) {
  const clean = normalizePhone(phone);
  if (!clean) return null;
  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('business_id', businessId)
    .eq('phone', clean)
    .single();
  return data || null;
}
