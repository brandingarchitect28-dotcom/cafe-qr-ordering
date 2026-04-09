/**
 * InvoiceModal.jsx
 *
 * Renders a printable / downloadable invoice in a modal overlay.
 * Uses the browser's built-in print dialog for PDF generation
 * (no extra library needed — works on iPad and desktop).
 *
 * Props:
 *   invoice  – Firestore invoice document object
 *   onClose  – callback to close the modal
 *
 * ADDED (Feature 3):
 *   - Delivery address shown in modal view (only for delivery orders)
 *   - Delivery address included in print/PDF HTML (only for delivery orders)
 */

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, FileText, CheckCircle } from 'lucide-react';

/* ─── helpers ────────────────────────────────────────────────────────────── */
const fmt = (num) => (parseFloat(num) || 0).toFixed(2);

const formatDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

/* ─── printable receipt HTML ─────────────────────────────────────────────── */
const buildPrintHTML = (inv) => {
  const cur = inv.currencySymbol || '₹';
  const hasExtras =
    (inv.taxEnabled && inv.taxAmount > 0) ||
    (inv.serviceChargeEnabled && inv.serviceChargeAmount > 0) ||
    (inv.gstEnabled && inv.gstAmount > 0);

  const itemRows = (inv.items || [])
    .map(
      (item) => `
    <tr>
      <td>${item.name}</td>
      <td class="center">${item.quantity}</td>
      <td class="right">${cur}${fmt(item.price)}</td>
      <td class="right">${cur}${fmt(item.price * item.quantity)}</td>
    </tr>`
    )
    .join('');

  const extrasRows = hasExtras
    ? `
    <tr class="sub-row">
      <td colspan="3">Subtotal</td>
      <td class="right">${cur}${fmt(inv.subtotalAmount)}</td>
    </tr>
    ${
      inv.taxEnabled && inv.taxAmount > 0
        ? `<tr class="sub-row"><td colspan="3">${inv.taxName || 'Tax'} (${inv.taxRate}%)</td><td class="right">${cur}${fmt(inv.taxAmount)}</td></tr>`
        : ''
    }
    ${
      inv.serviceChargeEnabled && inv.serviceChargeAmount > 0
        ? `<tr class="sub-row"><td colspan="3">Service Charge (${inv.serviceChargeRate}%)</td><td class="right">${cur}${fmt(inv.serviceChargeAmount)}</td></tr>`
        : ''
    }
    ${
      inv.gstEnabled && inv.gstAmount > 0
        ? `<tr class="sub-row"><td colspan="3">GST (${inv.gstRate}%)</td><td class="right">${cur}${fmt(inv.gstAmount)}</td></tr>`
        : ''
    }`
    : '';

  // Feature 3: delivery address block in print HTML
  const deliveryBlock =
    inv.orderType === 'delivery' && inv.deliveryAddress
      ? `<p style="margin-top:8px"><strong>Delivery Address:</strong> ${inv.deliveryAddress}</p>`
      : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${inv.invoiceNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Manrope:wght@400;500;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Manrope',sans-serif; font-size:13px; color:#1a1a1a; background:#fff; padding:32px; max-width:600px; margin:0 auto; }
    .header { text-align:center; margin-bottom:24px; border-bottom:2px solid #D4AF37; padding-bottom:16px; }
    .header h1 { font-family:'Playfair Display',serif; font-size:26px; color:#D4AF37; letter-spacing:1px; }
    .header p { color:#555; font-size:12px; margin-top:4px; }
    .inv-meta { display:flex; justify-content:space-between; margin-bottom:20px; }
    .inv-meta div { font-size:12px; color:#555; line-height:1.8; }
    .inv-meta strong { color:#1a1a1a; }
    .badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; background:#D4AF37; color:#000; }
    table { width:100%; border-collapse:collapse; margin-bottom:16px; }
    thead tr { background:#1a1a1a; color:#D4AF37; }
    thead th { padding:10px 12px; text-align:left; font-size:12px; font-weight:700; letter-spacing:.5px; }
    thead th.right, td.right { text-align:right; }
    thead th.center, td.center { text-align:center; }
    tbody tr { border-bottom:1px solid #eee; }
    tbody tr:nth-child(even) { background:#fafafa; }
    td { padding:9px 12px; }
    .sub-row td { color:#555; font-size:12px; background:#fafafa; }
    .total-row td { border-top:2px solid #D4AF37; padding-top:12px; font-weight:700; font-size:15px; color:#1a1a1a; }
    .footer { text-align:center; margin-top:28px; font-size:11px; color:#888; border-top:1px solid #eee; padding-top:16px; }
    .payment-badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; }
    .paid { background:#d1fae5; color:#065f46; }
    .pending { background:#fef3c7; color:#92400e; }
    @media print {
      body { padding:0; }
      @page { margin:1cm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${inv.cafeName || 'Café'}</h1>
    ${inv.cafeAddress ? `<p>${inv.cafeAddress}</p>` : ''}
    ${inv.cafePhone ? `<p>📞 ${inv.cafePhone}</p>` : ''}
    ${inv.cafeGstNumber ? `<p>GST: ${inv.cafeGstNumber}</p>` : ''}
  </div>

  <div class="inv-meta">
    <div>
      <p><strong>Invoice #</strong> ${inv.invoiceNumber}</p>
      <p><strong>Order #</strong> ${inv.orderNumber ? `#${String(inv.orderNumber).padStart(3, '0')}` : inv.orderId?.slice(0, 8)}</p>
      <p><strong>Date</strong> ${formatDate(inv.orderTime || inv.createdAt)}</p>
    </div>
    <div style="text-align:right">
      <p><strong>Customer</strong> ${inv.customerName || '—'}</p>
      ${inv.customerPhone ? `<p><strong>Phone</strong> ${inv.customerPhone}</p>` : ''}
      ${inv.orderType === 'dine-in' && inv.tableNumber ? `<p><strong>Table</strong> ${inv.tableNumber}</p>` : ''}
      ${deliveryBlock}
      <p>
        <span class="payment-badge ${inv.paymentStatus === 'paid' ? 'paid' : 'pending'}">
          ${inv.paymentStatus === 'paid' ? '✓ PAID' : 'PAYMENT PENDING'}
        </span>
      </p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="center">Qty</th>
        <th class="right">Price</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      ${extrasRows}
      <tr class="total-row">
        <td colspan="3">TOTAL</td>
        <td class="right">${cur}${fmt(inv.totalAmount)}</td>
      </tr>
    </tbody>
  </table>

  <p style="font-size:12px; color:#555;">
    Payment Method: <strong>${
      inv.paymentMode === 'counter'
        ? 'Pay at Counter'
        : inv.paymentMode === 'table'
        ? 'Pay on Table'
        : 'Prepaid (UPI)'
    }</strong>
  </p>

  <div class="footer">
    <p>Thank you for dining with us! 🙏</p>
    <p style="margin-top:4px; font-size:10px; color:#aaa;">Generated by Branding Architect · SmartCafé OS</p>
  </div>
</body>
</html>`;
};

/* ─── component ──────────────────────────────────────────────────────────── */
const InvoiceModal = ({ invoice, onClose }) => {
  const printFrameRef = useRef(null);

  const cur = invoice.currencySymbol || '₹';
  const hasExtras =
    (invoice.taxEnabled && invoice.taxAmount > 0) ||
    (invoice.serviceChargeEnabled && invoice.serviceChargeAmount > 0) ||
    (invoice.gstEnabled && invoice.gstAmount > 0);

  /* trigger browser print-to-PDF */
  const handleDownload = () => {
    try {
      const html = buildPrintHTML(invoice);
      const printWindow = window.open('', '_blank', 'width=700,height=900');
      if (!printWindow) {
        // fallback: inject into hidden iframe
        const iframe = printFrameRef.current;
        if (iframe) {
          iframe.contentDocument.open();
          iframe.contentDocument.write(html);
          iframe.contentDocument.close();
          iframe.contentWindow.print();
        }
        return;
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    } catch (err) {
      // Feature 4: failsafe
      console.error('Invoice error:', err);
    }
  };

  // Auto-trigger PDF print when opened via "Download PDF" button.
  // _autoPrint flag is set by handleDownloadInvoice in OrdersManagement.
  // useEffect is placed here so handleDownload is already in scope.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (invoice?._autoPrint) {
      const t = setTimeout(() => handleDownload(), 300);
      return () => clearTimeout(t);
    }
  // handleDownload is stable within this render — intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?._autoPrint]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* hidden iframe fallback for PDF */}
        <iframe ref={printFrameRef} className="hidden" title="print-frame" />

        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-[#0A0A0A] border border-white/10 rounded-xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0F0F0F]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/15 flex items-center justify-center">
                <FileText className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Invoice
                </p>
                <p className="text-[#D4AF37] text-xs font-mono">{invoice.invoiceNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-semibold rounded-lg text-sm transition-all"
                title="Download / Print as PDF"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download PDF</span>
              </button>
              <button
                onClick={onClose}
                className="p-2 text-[#A3A3A3] hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 p-6 space-y-5">

            {/* Cafe + Invoice info */}
            <div className="text-center pb-4 border-b border-white/10">
              <h2
                className="text-2xl font-bold text-[#D4AF37] mb-1"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                {invoice.cafeName}
              </h2>
              {invoice.cafeAddress && (
                <p className="text-[#A3A3A3] text-xs">{invoice.cafeAddress}</p>
              )}
              {invoice.cafeGstNumber && (
                <p className="text-[#A3A3A3] text-xs mt-1">GST: {invoice.cafeGstNumber}</p>
              )}
            </div>

            {/* Meta row */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1.5">
                <div>
                  <span className="text-[#A3A3A3] text-xs uppercase tracking-wide">Invoice #</span>
                  <p className="text-white font-mono font-semibold">{invoice.invoiceNumber}</p>
                </div>
                <div>
                  <span className="text-[#A3A3A3] text-xs uppercase tracking-wide">Order #</span>
                  <p className="text-white">
                    {invoice.orderNumber
                      ? `#${String(invoice.orderNumber).padStart(3, '0')}`
                      : invoice.orderId?.slice(0, 8)}
                  </p>
                </div>
                <div>
                  <span className="text-[#A3A3A3] text-xs uppercase tracking-wide">Date</span>
                  <p className="text-white">{formatDate(invoice.orderTime || invoice.createdAt)}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div>
                  <span className="text-[#A3A3A3] text-xs uppercase tracking-wide">Customer</span>
                  <p className="text-white font-semibold">{invoice.customerName || '—'}</p>
                </div>
                {invoice.customerPhone && (
                  <div>
                    <span className="text-[#A3A3A3] text-xs uppercase tracking-wide">Phone</span>
                    <p className="text-white">{invoice.customerPhone}</p>
                  </div>
                )}
                {invoice.orderType === 'dine-in' && invoice.tableNumber && (
                  <div>
                    <span className="text-[#A3A3A3] text-xs uppercase tracking-wide">Table</span>
                    <p className="text-white font-semibold">{invoice.tableNumber}</p>
                  </div>
                )}
                {/* Feature 3: Delivery address in modal view */}
                {invoice?.orderType === 'delivery' && (
                  <div style={{ marginTop: 8 }}>
                    <span className="text-[#A3A3A3] text-xs uppercase tracking-wide">Delivery Address</span>
                    <p className="text-white mt-0.5">{invoice?.deliveryAddress || 'N/A'}</p>
                  </div>
                )}
                <div>
                  <span className="text-[#A3A3A3] text-xs uppercase tracking-wide">Status</span>
                  <p className={`font-bold flex items-center gap-1 mt-0.5 ${
                    invoice.paymentStatus === 'paid' ? 'text-green-400' : 'text-amber-400'
                  }`}>
                    {invoice.paymentStatus === 'paid'
                      ? <><CheckCircle className="w-3.5 h-3.5" /> PAID</>
                      : 'PAYMENT PENDING'}
                  </p>
                </div>
              </div>
            </div>

            {/* Items table */}
            <div>
              <div className="grid grid-cols-12 text-xs text-[#A3A3A3] uppercase tracking-wide pb-2 border-b border-white/10 font-semibold">
                <span className="col-span-6">Item</span>
                <span className="col-span-2 text-center">Qty</span>
                <span className="col-span-2 text-right">Price</span>
                <span className="col-span-2 text-right">Total</span>
              </div>
              <div className="space-y-1 mt-2">
                {(invoice.items || []).map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 text-sm py-1.5 border-b border-white/5">
                    <span className="col-span-6 text-white">{item.name}</span>
                    <span className="col-span-2 text-center text-[#A3A3A3]">{item.quantity}</span>
                    <span className="col-span-2 text-right text-[#A3A3A3]">{cur}{fmt(item.price)}</span>
                    <span className="col-span-2 text-right text-white">{cur}{fmt(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {/* Extras + total */}
              <div className="mt-3 space-y-1.5 text-sm">
                {hasExtras && (
                  <div className="flex justify-between text-[#A3A3A3]">
                    <span>Subtotal</span>
                    <span>{cur}{fmt(invoice.subtotalAmount)}</span>
                  </div>
                )}
                {invoice.taxEnabled && invoice.taxAmount > 0 && (
                  <div className="flex justify-between text-[#A3A3A3]">
                    <span>{invoice.taxName || 'Tax'} ({invoice.taxRate}%)</span>
                    <span>{cur}{fmt(invoice.taxAmount)}</span>
                  </div>
                )}
                {invoice.serviceChargeEnabled && invoice.serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-[#A3A3A3]">
                    <span>Service Charge ({invoice.serviceChargeRate}%)</span>
                    <span>{cur}{fmt(invoice.serviceChargeAmount)}</span>
                  </div>
                )}
                {invoice.gstEnabled && invoice.gstAmount > 0 && (
                  <div className="flex justify-between text-[#A3A3A3]">
                    <span>GST ({invoice.gstRate}%)</span>
                    <span>{cur}{fmt(invoice.gstAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-[#D4AF37]/30 font-bold">
                  <span className="text-[#D4AF37] text-lg">TOTAL</span>
                  <span className="text-[#D4AF37] text-lg">{cur}{fmt(invoice.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Payment mode */}
            <p className="text-[#A3A3A3] text-xs pb-2 border-b border-white/5">
              Payment:{' '}
              <span className="text-white font-medium">
                {invoice.paymentMode === 'counter'
                  ? 'Pay at Counter'
                  : invoice.paymentMode === 'table'
                  ? 'Pay on Table'
                  : 'Prepaid (UPI)'}
              </span>
            </p>

            <p className="text-center text-[#555] text-xs">
              Thank you for dining with us! 🙏
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default InvoiceModal;
