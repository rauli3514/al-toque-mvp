/**
 * printOrder.js
 * Browser-based order printing utility for AlToque.
 * Opens a new window with a receipt-formatted page and triggers window.print().
 * Compatible with: Browser print dialog, PDF save, and most network/USB printers via Chrome.
 */

/**
 * Fetch full order data with items, modifiers and notes.
 * @param {object} supabase - Supabase client
 * @param {string} orderId
 * @returns {Promise<object|null>}
 */
export async function fetchOrderForPrint(supabase, orderId) {
  const { data } = await supabase
    .from('orders')
    .select(`
      id, display_number, table_number, total, payment_method, created_at,
      order_items (
        quantity, unit_price, notes,
        products ( name ),
        order_item_modifiers ( modifier_name )
      )
    `)
    .eq('id', orderId)
    .single();
  return data || null;
}

/**
 * Generate receipt HTML string.
 * @param {object} order        - Full order object with nested items
 * @param {string} businessName
 * @param {number} paperWidth   - 58 or 80 (mm). Default 80.
 * @returns {string} HTML string
 */
export function generateReceiptHTML(order, businessName = 'AlToque', paperWidth = 80) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-AR');

  // Layout tweaks per paper width
  const w          = `${paperWidth}mm`;
  const baseFontPx = paperWidth === 58 ? 12 : 14;   // smaller font fits 58mm
  const numFontPx  = paperWidth === 58 ? 36 : 42;   // order number size

  const location = order.table_number ? `Mesa ${order.table_number}` : 'Retiro en barra';
  const payment = order.payment_method === 'CASH' ? 'Efectivo' : 'Digital';

  const itemsHTML = (order.order_items || []).map(item => {
    const mods = (item.order_item_modifiers || []).map(m =>
      `<div class="mod">+ ${m.modifier_name}</div>`
    ).join('');
    const note = item.notes
      ? `<div class="note">📝 ${item.notes}</div>`
      : '';
    return `
      <div class="item">
        <div class="item-row">
          <span class="qty">${item.quantity}x</span>
          <span class="pname">${item.products?.name || '—'}</span>
          <span class="price">$${(item.unit_price * item.quantity).toLocaleString('es-AR')}</span>
        </div>
        ${mods}
        ${note}
      </div>`;
  }).join('<div class="divider"></div>');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Pedido #${order.display_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${baseFontPx}px;
      color: #000;
      background: #fff;
      width: ${w};
      padding: 5mm 3mm;
    }

    /* ── HEADER ── */
    .header { text-align: center; margin-bottom: 6px; }
    .business { font-size: ${baseFontPx + 4}px; font-weight: 900; letter-spacing: 1px; }
    .sub      { font-size: ${baseFontPx - 2}px; color: #555; margin-top: 2px; }

    /* ── SEPARATOR ── */
    .sep { border: none; border-top: 1px dashed #000; margin: 6px 0; }

    /* ── ORDER NUMBER ── */
    .order-num {
      text-align: center;
      font-size: ${numFontPx}px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -1px;
      margin: 4px 0;
    }
    .order-label { text-align: center; font-size: ${baseFontPx - 2}px; color: #555; margin-bottom: 2px; }

    /* ── META ── */
    .meta { font-size: ${baseFontPx}px; margin: 3px 0; }
    .meta strong { font-weight: 900; }

    /* ── ITEMS ── */
    .items { margin: 4px 0; }
    .item  { margin: 3px 0; }
    .item-row { display: flex; justify-content: space-between; align-items: baseline; }
    .qty   { font-weight: 900; min-width: 22px; }
    .pname { flex: 1; padding: 0 3px; word-break: break-word; }
    .price { text-align: right; min-width: 36px; white-space: nowrap; }
    .mod   { font-size: ${baseFontPx - 2}px; color: #444; padding-left: 22px; }
    .note  { font-size: ${baseFontPx - 2}px; color: #666; padding-left: 22px; font-style: italic; }
    .divider { border-top: 1px dotted #bbb; margin: 3px 0; }

    /* ── TOTAL ── */
    .total-row {
      display: flex; justify-content: space-between;
      font-size: ${baseFontPx + 3}px; font-weight: 900; margin-top: 3px;
    }

    /* ── FOOTER ── */
    .footer { text-align: center; font-size: ${baseFontPx - 3}px; color: #888; margin-top: 8px; }

    /* ── PRINT ONLY ── */
    @media print {
      body { width: ${w}; }
      @page { size: ${w} auto; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="business">⚡ ${businessName.toUpperCase()}</div>
    <div class="sub">${dateStr} — ${timeStr}</div>
  </div>

  <hr class="sep">

  <div class="order-label">PEDIDO</div>
  <div class="order-num">#${order.display_number}</div>

  <hr class="sep">

  <div class="meta"><strong>📍 ${location}</strong></div>
  <div class="meta">Pago: ${payment}</div>

  <hr class="sep">

  <div class="items">${itemsHTML}</div>

  <hr class="sep">

  <div class="total-row">
    <span>TOTAL</span>
    <span>$${Number(order.total).toLocaleString('es-AR')}</span>
  </div>

  <hr class="sep">

  <div class="footer">gracias por elegirnos 🙌</div>

  <script>
    window.onload = function() {
      window.print();
      // Close print window after dialog (small delay)
      setTimeout(function() { window.close(); }, 1000);
    };
  <\/script>
</body>
</html>`;
}

/**
 * Main print function — fetches order and opens print window.
 * @param {object} supabase
 * @param {string} orderId
 * @param {string} businessName
 * @param {number} paperWidth  - 58 or 80 (mm). Default 80.
 */
export async function printOrder(supabase, orderId, businessName = 'AlToque', paperWidth = 80) {
  const order = await fetchOrderForPrint(supabase, orderId);
  if (!order) { console.error('printOrder: order not found', orderId); return; }

  const html = generateReceiptHTML(order, businessName, paperWidth);
  const winW  = paperWidth === 58 ? 300 : 420;
  const w = window.open('', '_blank', `width=${winW},height=600,toolbar=0,menubar=0,scrollbars=1`);
  if (!w) {
    alert('El navegador bloqueó la ventana de impresión. Permití popups para este sitio.');
    return;
  }
  w.document.write(html);
  w.document.close();
}
