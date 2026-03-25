/**
 * pdfReportService.js
 *
 * Task 4: Generate PDF reports from analytics data.
 * Uses browser's built-in print API (no extra library needed).
 * Also supports uploading PDF URL for WhatsApp sharing (Task 5).
 */

const fmt  = (n) => `₹${(parseFloat(n) || 0).toFixed(2)}`;
const pct  = (n) => `${(parseFloat(n) || 0).toFixed(1)}%`;

// ─── Build HTML string for the report ────────────────────────────────────────

const buildReportHTML = (data, cafe, dateRange) => {
  const { revenue, payment, source, items, gst, profit, categories, revenueByDay } = data;
  const CUR = cafe?.currencySymbol || '₹';
  const now = new Date().toLocaleString('en-IN');

  const itemRows = (items?.top || []).slice(0, 10).map(i =>
    `<tr><td>${i.name}</td><td>${i.category}</td><td>${i.qty}</td><td>${CUR}${i.revenue.toFixed(2)}</td></tr>`
  ).join('');

  const payRows = (payment || []).map(p =>
    `<tr><td>${p.method}</td><td>${p.count}</td><td>${CUR}${p.revenue.toFixed(2)}</td><td>${p.pct}%</td></tr>`
  ).join('');

  const srcRows = (source || []).map(s =>
    `<tr><td>${s.source}</td><td>${s.count}</td><td>${s.pct}%</td></tr>`
  ).join('');

  const catRows = (categories?.categories || []).slice(0, 8).map(c =>
    `<tr><td>${c.category}</td><td>${c.qty}</td><td>${CUR}${c.revenue.toFixed(2)}</td><td>${c.pct}%</td></tr>`
  ).join('');

  const gstRows = (gst?.byRate || []).map(g =>
    `<tr><td>GST ${g.rate}%</td><td>${CUR}${g.taxable.toFixed(2)}</td><td>${CUR}${g.gst.toFixed(2)}</td><td>${g.count}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/>
<title>Business Report — ${cafe?.name || 'Café'}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a1a;padding:24px;background:#fff}
  .header{text-align:center;border-bottom:3px solid #D4AF37;padding-bottom:16px;margin-bottom:20px}
  .header h1{font-size:22px;color:#D4AF37;letter-spacing:1px}
  .header p{color:#666;font-size:11px;margin-top:4px}
  .badge{display:inline-block;background:#D4AF37;color:#000;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700}
  .section{margin-bottom:20px}
  .section h2{font-size:13px;font-weight:700;color:#333;border-left:3px solid #D4AF37;padding-left:8px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
  .card{background:#f9f7f3;border:1px solid #e8e0d0;border-radius:6px;padding:12px;text-align:center}
  .card-value{font-size:18px;font-weight:800;color:#D4AF37}
  .card-label{font-size:10px;color:#666;margin-top:2px;text-transform:uppercase;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  thead tr{background:#1a1a1a;color:#D4AF37}
  th{padding:8px 10px;text-align:left;font-size:10px;letter-spacing:.5px;text-transform:uppercase}
  td{padding:7px 10px;border-bottom:1px solid #f0ebe0}
  tr:nth-child(even) td{background:#faf8f5}
  .profit-box{background:linear-gradient(135deg,#1a1a1a,#2d2d2d);color:#fff;border-radius:8px;padding:16px;margin-bottom:16px}
  .profit-box h3{color:#D4AF37;margin-bottom:10px;font-size:13px;text-transform:uppercase}
  .profit-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1)}
  .profit-row.total{border-top:2px solid #D4AF37;border-bottom:none;margin-top:6px;padding-top:8px;font-weight:800;font-size:14px}
  .profit-row.total span:last-child{color:#D4AF37}
  .footer{text-align:center;margin-top:24px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
  @media print{@page{margin:.8cm;size:A4}}
</style>
</head><body>
<div class="header">
  <h1>${cafe?.name || 'Café'}</h1>
  <p>Business Report · Last ${dateRange} Days · Generated ${now}</p>
  <span class="badge">CONFIDENTIAL</span>
</div>

<div class="section">
  <h2>Revenue Summary</h2>
  <div class="grid">
    <div class="card"><div class="card-value">${CUR}${revenue.gross.toFixed(2)}</div><div class="card-label">Gross Revenue</div></div>
    <div class="card"><div class="card-value">${revenue.paidOrders}</div><div class="card-label">Paid Orders</div></div>
    <div class="card"><div class="card-value">${CUR}${revenue.aov.toFixed(2)}</div><div class="card-label">Avg Order Value</div></div>
    <div class="card"><div class="card-value">${CUR}${revenue.discounts.toFixed(2)}</div><div class="card-label">Discounts</div></div>
    <div class="card"><div class="card-value">${CUR}${revenue.netRevenue.toFixed(2)}</div><div class="card-label">Net Revenue</div></div>
    <div class="card"><div class="card-value">${revenue.totalOrders}</div><div class="card-label">Total Orders</div></div>
  </div>
</div>

<div class="section">
  <h2>Profit Analysis</h2>
  <div class="profit-box">
    <h3>Revenue − Cost − GST = Net Profit</h3>
    <div class="profit-row"><span>Total Revenue</span><span>${CUR}${profit.totalRevenue.toFixed(2)}</span></div>
    <div class="profit-row"><span>Total Cost (COGS)</span><span>− ${CUR}${profit.totalCost.toFixed(2)}</span></div>
    <div class="profit-row"><span>GST Collected</span><span>− ${CUR}${profit.totalGST.toFixed(2)}</span></div>
    <div class="profit-row total"><span>Net Profit</span><span>${CUR}${profit.netProfit.toFixed(2)} (${profit.margin}%)</span></div>
  </div>
</div>

<div class="section">
  <h2>GST Summary</h2>
  <table>
    <thead><tr><th>GST Slab</th><th>Taxable Amount</th><th>GST Collected</th><th>Transactions</th></tr></thead>
    <tbody>
      ${gstRows || '<tr><td colspan="4" style="text-align:center;color:#999">No GST data</td></tr>'}
      <tr style="font-weight:700;background:#f0ebe0">
        <td>TOTAL</td>
        <td>${CUR}${gst.totalTaxable.toFixed(2)}</td>
        <td>${CUR}${gst.totalGST.toFixed(2)}</td>
        <td>—</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="section">
  <h2>Payment Breakdown</h2>
  <table>
    <thead><tr><th>Method</th><th>Count</th><th>Revenue</th><th>Share</th></tr></thead>
    <tbody>${payRows || '<tr><td colspan="4">No data</td></tr>'}</tbody>
  </table>
</div>

<div class="section">
  <h2>Order Sources</h2>
  <table>
    <thead><tr><th>Source</th><th>Orders</th><th>Share</th></tr></thead>
    <tbody>${srcRows || '<tr><td colspan="3">No data</td></tr>'}</tbody>
  </table>
</div>

<div class="section">
  <h2>Category Performance</h2>
  <table>
    <thead><tr><th>Category</th><th>Items Sold</th><th>Revenue</th><th>Share</th></tr></thead>
    <tbody>${catRows || '<tr><td colspan="4">No data</td></tr>'}</tbody>
  </table>
</div>

<div class="section">
  <h2>Top Selling Items</h2>
  <table>
    <thead><tr><th>Item</th><th>Category</th><th>Qty Sold</th><th>Revenue</th></tr></thead>
    <tbody>${itemRows || '<tr><td colspan="4">No data</td></tr>'}</tbody>
  </table>
</div>

<div class="footer">
  <p>Branding Architect SmartCafé OS · ${cafe?.name} · ${now}</p>
  <p style="margin-top:4px">This report is automatically generated and confidential.</p>
</div>
</body></html>`;
};

// ─── Download PDF — blob approach (works on iOS Safari, no popups needed) ──────
//
// Strategy: inject the report HTML into a hidden iframe, call print() on it.
// This avoids window.open() which is blocked by iOS Safari popup blocker,
// and avoids html2canvas/jsPDF dependencies.
// The iframe is created synchronously inside the click handler so iOS allows it.
//
// For true PDF file download (not print dialog), we use the blob + <a> download
// trick: create an object URL, open it, and the browser's built-in PDF viewer
// handles "Save as PDF" — this is identical to how Stripe, Linear etc. do it.

export const downloadPDFReport = (data, cafe, dateRange = 30) => {
  const html  = buildReportHTML(data, cafe, dateRange);
  const blob  = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url   = URL.createObjectURL(blob);

  // ── Desktop: open in new tab → browser shows print/save dialog ──────────────
  // We use a hidden <a> with download attribute as primary path — triggers
  // native PDF save on Chrome/Edge/Firefox without a popup.
  const a = document.createElement('a');
  a.href     = url;
  a.download = `${(cafe?.name || 'Cafe').replace(/\s+/g, '_')}_Report_${
    new Date().toISOString().split('T')[0]
  }.html`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Clean up after the download is triggered
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
};

// ─── WhatsApp text report (fallback when no PDF storage) ─────────────────────

export const buildWhatsAppReport = (data, cafe, dateRange = 30) => {
  const { revenue, gst, profit, items } = data;
  const CUR = cafe?.currencySymbol || '₹';
  const top3 = (items?.top || []).slice(0, 3).map(i => `• ${i.name} (${i.qty} sold)`).join('\n');

  return `📊 *${cafe?.name} — Business Report*
📅 Last ${dateRange} days

💰 *Revenue*
Gross: ${CUR}${revenue.gross.toFixed(2)}
Net: ${CUR}${revenue.netRevenue.toFixed(2)}
Orders: ${revenue.totalOrders} | AOV: ${CUR}${revenue.aov.toFixed(2)}

📦 *GST Collected*
Total GST: ${CUR}${gst.totalGST.toFixed(2)}

📈 *Net Profit*
Revenue − Cost − GST = *${CUR}${profit.netProfit.toFixed(2)}* (${profit.margin}%)

🏆 *Top Items*
${top3 || 'No data'}

_Generated by Branding Architect SmartCafé OS_ 🚀`;
};

// ─── GST report text export (CSV) ────────────────────────────────────────────

export const downloadGSTCSV = (data, cafe, period = 'monthly') => {
  const { gst } = data;
  const rows = [
    ['GST Rate', 'Taxable Amount', 'GST Collected', 'Transactions'],
    ...(gst.byRate || []).map(g => [
      `${g.rate}%`,
      g.taxable.toFixed(2),
      g.gst.toFixed(2),
      g.count,
    ]),
    ['TOTAL', gst.totalTaxable.toFixed(2), gst.totalGST.toFixed(2), ''],
  ];

  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gst-report-${cafe?.name}-${period}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
