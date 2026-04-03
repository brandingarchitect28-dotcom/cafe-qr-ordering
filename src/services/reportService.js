/**
 * reportService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure calculation + report-generation functions for SmartCafé OS.
 *
 * ADDITIVE ONLY — this is a new file that doesn't touch any existing file.
 *
 * Exports:
 *   calcOrderServiceCharge(order)      → number
 *   calcOrderPlatformFee(order, cafe)  → number
 *   calcFeeSummary(orders, cafe)       → { totalServiceCharge, totalPlatformFee,
 *                                          grossRevenue, gstCollected,
 *                                          netRevenue, finalNetAmount }
 *   downloadCSV(orders, cafe)          → void (triggers browser download)
 *   downloadPDFPrint(orders, cafe)     → void (opens print dialog)
 *
 * Backward compatibility guarantee:
 *   Any order that doesn't have serviceChargeAmount / platformFeeAmount
 *   is treated as 0 — old orders never break.
 */

// ─── Per-order extractors ─────────────────────────────────────────────────────

/**
 * Returns the service charge amount for a single order.
 * Reads `serviceChargeAmount` (new field) or falls back to 0.
 * Never throws — always returns a finite number.
 */
export const calcOrderServiceCharge = (order) => {
  // New orders store serviceChargeAmount; old ones have 0 / undefined
  const val = parseFloat(order.serviceChargeAmount ?? order.service_charge ?? 0);
  return isFinite(val) ? val : 0;
};

/**
 * Returns the platform fee for a single order.
 * Reads `platformFeeAmount` (new field) or computes from cafe settings as fallback.
 *
 * Platform fee logic (only if cafe.platformFeeEnabled === true):
 *   - type 'percentage' → subtotal × rate / 100
 *   - type 'fixed'      → fixed amount
 * Old orders / disabled → 0
 */
export const calcOrderPlatformFee = (order, cafe = {}) => {
  // If the order already has a stored platform fee, use it directly
  if (order.platformFeeAmount !== undefined && order.platformFeeAmount !== null) {
    const val = parseFloat(order.platformFeeAmount);
    return isFinite(val) ? val : 0;
  }

  // Fallback: compute from cafe settings (for orders created before this field existed)
  if (!cafe?.platformFeeEnabled) return 0;

  const subtotal = parseFloat(order.subtotalAmount ?? order.subtotal ?? 0) || 0;
  const type  = cafe.platformFeeType  || 'percentage';
  const value = parseFloat(cafe.platformFeeValue) || 0;

  if (type === 'fixed') return isFinite(value) ? value : 0;
  // percentage
  const computed = subtotal * value / 100;
  return isFinite(computed) ? parseFloat(computed.toFixed(2)) : 0;
};

// ─── Aggregate summary across all paid orders ─────────────────────────────────

/**
 * calcFeeSummary(orders, cafe)
 *
 * Aggregates service charge + platform fee across all paid orders.
 * Respects the enabled flags — if disabled the total is exactly 0.
 *
 * Returns:
 * {
 *   totalOrders:          number,   // count of paid orders
 *   grossRevenue:         number,   // sum of totalAmount on paid orders
 *   gstCollected:         number,   // sum of gstAmount + taxAmount on paid orders
 *   totalServiceCharge:   number,   // 0 if serviceChargeEnabled === false
 *   totalPlatformFee:     number,   // 0 if platformFeeEnabled === false
 *   netRevenue:           number,   // grossRevenue − gstCollected − totalServiceCharge
 *   finalNetAmount:       number,   // netRevenue − totalPlatformFee
 * }
 */
export const calcFeeSummary = (orders = [], cafe = {}) => {
  const scEnabled = cafe?.serviceChargeEnabled === true;
  const pfEnabled = cafe?.platformFeeEnabled   === true;

  const paidOrders = orders.filter(o => o.paymentStatus === 'paid');

  let grossRevenue       = 0;
  let gstCollected       = 0;
  let totalServiceCharge = 0;
  let totalPlatformFee   = 0;

  paidOrders.forEach(order => {
    grossRevenue += parseFloat(order.totalAmount ?? order.total ?? 0) || 0;

    // GST: sum both gstAmount (legacy) and taxAmount
    gstCollected += (parseFloat(order.gstAmount ?? 0) || 0)
                  + (parseFloat(order.taxAmount  ?? 0) || 0);

    if (scEnabled) {
      totalServiceCharge += calcOrderServiceCharge(order);
    }

    if (pfEnabled) {
      totalPlatformFee += calcOrderPlatformFee(order, cafe);
    }
  });

  // Round everything to 2dp
  grossRevenue       = parseFloat(grossRevenue.toFixed(2));
  gstCollected       = parseFloat(gstCollected.toFixed(2));
  totalServiceCharge = parseFloat(totalServiceCharge.toFixed(2));
  totalPlatformFee   = parseFloat(totalPlatformFee.toFixed(2));

  // Net revenue = gross − GST − service charge (service charge goes back to cafe, not counted as net)
  const netRevenue    = parseFloat((grossRevenue - gstCollected).toFixed(2));
  // Final net = net revenue − platform fee (platform fee is a cost/deduction)
  const finalNetAmount = parseFloat((netRevenue - totalPlatformFee).toFixed(2));

  return {
    totalOrders:        paidOrders.length,
    grossRevenue,
    gstCollected,
    totalServiceCharge,
    totalPlatformFee,
    netRevenue,
    finalNetAmount,
  };
};

// ─── CSV Download ─────────────────────────────────────────────────────────────

/**
 * downloadCSV(orders, cafe)
 *
 * Generates a GST + financial summary CSV and triggers a browser download.
 * Includes service charge and platform fee columns when enabled.
 * Old orders without fee fields just show 0.
 */
export const downloadCSV = (orders = [], cafe = {}) => {
  const scEnabled = cafe?.serviceChargeEnabled === true;
  const pfEnabled = cafe?.platformFeeEnabled   === true;
  const CUR       = cafe?.currencySymbol || '₹';

  const paidOrders = orders.filter(o => o.paymentStatus === 'paid');
  const summary    = calcFeeSummary(orders, cafe);

  // ── Per-order rows ──────────────────────────────────────────────────────────
  const headers = [
    'Order #',
    'Date',
    'Customer',
    'Items',
    `Subtotal (${CUR})`,
    `GST / Tax (${CUR})`,
    ...(scEnabled ? [`Service Charge (${CUR})`] : []),
    ...(pfEnabled ? [`Platform Fee (${CUR})`]   : []),
    `Total (${CUR})`,
    'Payment Status',
    'Payment Mode',
  ];

  const rows = paidOrders.map(order => {
    const num     = order.orderNumber ? `#${String(order.orderNumber).padStart(3,'0')}` : order.id?.slice(-6) || '-';
    const date    = order.createdAt?.toDate?.()?.toLocaleDateString('en-IN') || '';
    const items   = (order.items || []).map(i => `${i.name} ×${i.quantity}`).join(' | ');
    const subtotal = parseFloat(order.subtotalAmount ?? order.subtotal ?? 0) || 0;
    const gst      = (parseFloat(order.gstAmount ?? 0) || 0) + (parseFloat(order.taxAmount ?? 0) || 0);
    const sc       = scEnabled ? calcOrderServiceCharge(order)   : null;
    const pf       = pfEnabled ? calcOrderPlatformFee(order, cafe) : null;
    const total    = parseFloat(order.totalAmount ?? order.total ?? 0) || 0;

    return [
      num,
      date,
      order.customerName || '',
      items,
      subtotal.toFixed(2),
      gst.toFixed(2),
      ...(scEnabled ? [sc.toFixed(2)]  : []),
      ...(pfEnabled ? [pf.toFixed(2)]  : []),
      total.toFixed(2),
      order.paymentStatus || '',
      order.paymentMode   || '',
    ];
  });

  // ── Summary rows at bottom ──────────────────────────────────────────────────
  const blank  = headers.map(() => '');
  const border = headers.map(() => '─────────');

  const summaryRows = [
    blank,
    [...border],
    ['FINANCIAL SUMMARY', '', '', '', '', '', ...(scEnabled ? [''] : []), ...(pfEnabled ? [''] : [])],
    [`Total Orders`,      summary.totalOrders,          '', '', '', '', ...(scEnabled ? [''] : []), ...(pfEnabled ? [''] : [])],
    [`Gross Revenue`,     `${CUR}${summary.grossRevenue.toFixed(2)}`,       '', '', '', '', ...(scEnabled ? [''] : []), ...(pfEnabled ? [''] : [])],
    [`GST Collected`,     `${CUR}${summary.gstCollected.toFixed(2)}`,       '', '', '', '', ...(scEnabled ? [''] : []), ...(pfEnabled ? [''] : [])],
    ...(scEnabled ? [[`Service Charges`,   `${CUR}${summary.totalServiceCharge.toFixed(2)}`,  '', '', '', '', '', ...(pfEnabled ? [''] : [])]] : []),
    ...(pfEnabled ? [[`Platform Fees`,     `${CUR}${summary.totalPlatformFee.toFixed(2)}`,    '', '', '', '', ...(scEnabled ? [''] : []), '']] : []),
    [`Net Revenue`,       `${CUR}${summary.netRevenue.toFixed(2)}`,         '', '', '', '', ...(scEnabled ? [''] : []), ...(pfEnabled ? [''] : [])],
    [`Final Net Amount`,  `${CUR}${summary.finalNetAmount.toFixed(2)}`,     '', '', '', '', ...(scEnabled ? [''] : []), ...(pfEnabled ? [''] : [])],
  ];

  // ── Build CSV string ────────────────────────────────────────────────────────
  const escape = (val) => {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const allRows = [
    headers,
    ...rows,
    ...summaryRows,
  ];

  const csv = allRows.map(row => row.map(escape).join(',')).join('\n');

  // ── Trigger download ────────────────────────────────────────────────────────
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `smartcafe-report-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ─── PDF Print ───────────────────────────────────────────────────────────────

/**
 * downloadPDFPrint(orders, cafe, fromDate, toDate)
 *
 * Opens a styled print window with a full financial breakdown.
 * No jsPDF dependency — uses the browser's native print-to-PDF.
 * Includes "Payment Breakdown" section per the spec.
 */
export const downloadPDFPrint = (orders = [], cafe = {}, fromDate = '', toDate = '') => {
  const scEnabled = cafe?.serviceChargeEnabled === true;
  const pfEnabled = cafe?.platformFeeEnabled   === true;
  const CUR       = cafe?.currencySymbol || '₹';
  const cafeName  = cafe?.name || 'SmartCafé';
  const summary   = calcFeeSummary(orders, cafe);

  const paidOrders     = orders.filter(o => o.paymentStatus === 'paid');
  const dateRangeLabel = (fromDate && toDate) ? `${fromDate} → ${toDate}` : 'All Time';
  const generatedAt    = new Date().toLocaleString('en-IN');

  // ── Per-order table rows ────────────────────────────────────────────────────
  const orderRows = paidOrders.map(order => {
    const num    = order.orderNumber ? `#${String(order.orderNumber).padStart(3,'0')}` : order.id?.slice(-6) || '-';
    const date   = order.createdAt?.toDate?.()?.toLocaleDateString('en-IN') || '';
    const total  = parseFloat(order.totalAmount ?? order.total ?? 0) || 0;
    const gst    = (parseFloat(order.gstAmount ?? 0) || 0) + (parseFloat(order.taxAmount ?? 0) || 0);
    const sc     = scEnabled ? calcOrderServiceCharge(order) : null;
    const pf     = pfEnabled ? calcOrderPlatformFee(order, cafe) : null;

    return `
      <tr>
        <td>${num}</td>
        <td>${date}</td>
        <td>${order.customerName || '—'}</td>
        <td style="text-align:right">${CUR}${total.toFixed(2)}</td>
        <td style="text-align:right">${CUR}${gst.toFixed(2)}</td>
        ${scEnabled ? `<td style="text-align:right">${CUR}${sc.toFixed(2)}</td>` : ''}
        ${pfEnabled ? `<td style="text-align:right">${CUR}${pf.toFixed(2)}</td>` : ''}
      </tr>`;
  }).join('');

  // ── Payment Breakdown section ───────────────────────────────────────────────
  const breakdownRows = [
    { label: 'Total Orders',        value: summary.totalOrders,                         color: '#111', bold: false, isMoney: false },
    { label: 'Gross Revenue',       value: summary.grossRevenue,                        color: '#111', bold: false, isMoney: true  },
    { label: 'GST Collected',       value: summary.gstCollected,                        color: '#555', bold: false, isMoney: true  },
    ...(scEnabled ? [{ label: 'Service Charges Collected', value: summary.totalServiceCharge, color: '#1a6f3c', bold: false, isMoney: true }] : []),
    ...(pfEnabled ? [{ label: 'Platform Fees Deducted',    value: summary.totalPlatformFee,   color: '#c0392b', bold: false, isMoney: true }] : []),
    { label: 'Net Revenue',         value: summary.netRevenue,                          color: '#111', bold: false, isMoney: true  },
    { label: 'Final Net Amount',    value: summary.finalNetAmount,                      color: '#1a4d2e', bold: true, isMoney: true  },
  ];

  const breakdownHTML = breakdownRows.map((row, i) => {
    const isLast = i === breakdownRows.length - 1;
    return `
      <tr style="${isLast ? 'border-top:2px solid #C9A84C; background:#fdf8ec;' : ''}">
        <td style="padding:10px 14px; font-weight:${row.bold ? '700' : '400'}; color:${row.color}; ${isLast ? 'font-size:15px;' : ''}">
          ${row.label}
        </td>
        <td style="padding:10px 14px; text-align:right; font-weight:${row.bold ? '700' : '600'}; color:${row.color}; ${isLast ? 'font-size:15px;' : ''}">
          ${row.isMoney ? `${CUR}${Number(row.value).toFixed(2)}` : row.value}
        </td>
      </tr>`;
  }).join('');

  // ── Top items ───────────────────────────────────────────────────────────────
  const itemCounts = {};
  paidOrders.forEach(order => {
    (order.items || []).forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + (item.quantity || 1);
    });
  });
  const topItemsHTML = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, qty]) => `<tr><td style="padding:6px 14px">${name}</td><td style="padding:6px 14px;text-align:right">${qty}</td></tr>`)
    .join('');

  // ── Full HTML document ──────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${cafeName} — Analytics Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      color: #111;
      background: #fff;
      padding: 32px 40px;
      font-size: 13px;
      line-height: 1.5;
    }

    /* ── Header ── */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 20px;
      border-bottom: 3px solid #C9A84C;
      margin-bottom: 28px;
    }
    .report-header h1 {
      font-family: 'Playfair Display', serif;
      font-size: 26px;
      color: #0F0F0F;
      letter-spacing: -0.5px;
    }
    .report-header .meta {
      text-align: right;
      color: #666;
      font-size: 12px;
      line-height: 1.8;
    }
    .gold-badge {
      display: inline-block;
      background: #C9A84C;
      color: #fff;
      padding: 2px 10px;
      border-radius: 2px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    /* ── Section titles ── */
    .section-title {
      font-family: 'Playfair Display', serif;
      font-size: 16px;
      color: #0F0F0F;
      border-left: 4px solid #C9A84C;
      padding-left: 10px;
      margin: 28px 0 14px;
    }

    /* ── Payment Breakdown ── */
    .breakdown-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      overflow: hidden;
    }
    .breakdown-table th {
      background: #0F0F0F;
      color: #C9A84C;
      padding: 10px 14px;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .breakdown-table th:last-child { text-align: right; }
    .breakdown-table tr:nth-child(even) td { background: #f9f9f9; }
    .breakdown-divider {
      height: 4px;
      background: linear-gradient(to right, #C9A84C, transparent);
      margin: 6px 0;
    }

    /* ── Orders table ── */
    .orders-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .orders-table th {
      background: #0F0F0F;
      color: #C9A84C;
      padding: 9px 12px;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }
    .orders-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #f0f0f0;
      color: #222;
    }
    .orders-table tr:last-child td { border-bottom: none; }
    .orders-table tr:hover td { background: #fdf8ec; }

    /* ── Top items ── */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .items-table th {
      background: #1a1a1a;
      color: #C9A84C;
      padding: 8px 14px;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
    }
    .items-table td {
      padding: 7px 14px;
      border-bottom: 1px solid #f0f0f0;
    }
    .items-table tr:nth-child(even) td { background: #f9f9f9; }

    /* ── Footer ── */
    .report-footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e5e5e5;
      color: #aaa;
      font-size: 11px;
      display: flex;
      justify-content: space-between;
    }

    @media print {
      body { padding: 20px 24px; }
      @page { margin: 10mm; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="report-header">
    <div>
      <div class="gold-badge">Analytics Report</div>
      <h1>${cafeName}</h1>
      <p style="color:#666; margin-top:4px; font-size:12px">Period: ${dateRangeLabel}</p>
      ${cafe?.gstNumber ? `<p style="color:#888; font-size:11px">GST No: ${cafe.gstNumber}</p>` : ''}
    </div>
    <div class="meta">
      <p><strong>Generated</strong></p>
      <p>${generatedAt}</p>
      <p style="margin-top:8px">Powered by SmartCafé OS</p>
    </div>
  </div>

  <!-- Payment Breakdown -->
  <h2 class="section-title">Payment Breakdown</h2>
  <table class="breakdown-table">
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${breakdownHTML}
    </tbody>
  </table>

  ${(scEnabled || pfEnabled) ? `
  <div style="margin-top:10px; padding:10px 14px; background:#f9f6ed; border-left:3px solid #C9A84C; font-size:12px; color:#555; border-radius:2px;">
    ${scEnabled ? `<p>Service Charge (${cafe?.serviceChargeRate || 0}%): collected from customers and included in revenue.</p>` : ''}
    ${pfEnabled ? `<p style="margin-top:${scEnabled ? 4 : 0}px">Platform Fee${cafe?.platformFeeType === 'fixed' ? ` (fixed ${CUR}${cafe?.platformFeeValue || 0})` : ` (${cafe?.platformFeeValue || 0}%)`}: deducted from net revenue as an operating cost.</p>` : ''}
  </div>` : ''}

  <!-- Order Details -->
  ${paidOrders.length > 0 ? `
  <h2 class="section-title">Order Details — Paid Orders (${summary.totalOrders})</h2>
  <table class="orders-table">
    <thead>
      <tr>
        <th>Order #</th>
        <th>Date</th>
        <th>Customer</th>
        <th style="text-align:right">Total</th>
        <th style="text-align:right">GST/Tax</th>
        ${scEnabled ? `<th style="text-align:right">Serv. Charge</th>` : ''}
        ${pfEnabled ? `<th style="text-align:right">Platform Fee</th>` : ''}
      </tr>
    </thead>
    <tbody>
      ${orderRows}
    </tbody>
  </table>` : '<p style="color:#888; margin-top:12px">No paid orders in this period.</p>'}

  <!-- Top Items -->
  ${topItemsHTML ? `
  <h2 class="section-title">Top Selling Items</h2>
  <table class="items-table">
    <thead>
      <tr>
        <th>Item Name</th>
        <th style="text-align:right">Qty Sold</th>
      </tr>
    </thead>
    <tbody>${topItemsHTML}</tbody>
  </table>` : ''}

  <!-- Footer -->
  <div class="report-footer">
    <span>${cafeName} — Analytics Report</span>
    <span>Period: ${dateRangeLabel} | Generated: ${generatedAt}</span>
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  // Open in a new window — browser handles print-to-PDF natively
  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
};
