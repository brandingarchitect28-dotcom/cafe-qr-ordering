/**
 * InvoicePage.jsx
 * Route: /invoice/:invoiceId  (public — no auth required)
 *
 * Loads an invoice from Firestore and renders a printable page.
 * Customer can click "Download PDF" → browser print dialog.
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion } from 'framer-motion';
import { Download, Coffee, CheckCircle, Clock, AlertCircle } from 'lucide-react';

const fmt = (n) => (parseFloat(n) || 0).toFixed(2);

const formatDate = (ts) => {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const buildPrintHTML = (inv) => {
  const cur = inv.currencySymbol || '₹';
  // Support both field name conventions
  const gstPct = inv.gstPercentage  ?? inv.gstRate  ?? 0;
  const scPct  = inv.serviceChargePercentage ?? inv.serviceChargeRate ?? 0;
  const taxPct = inv.taxRate ?? 0;
  const hasExtras =
    (inv.taxEnabled && inv.taxAmount > 0) ||
    (inv.serviceChargeEnabled && inv.serviceChargeAmount > 0) ||
    (inv.gstEnabled && inv.gstAmount > 0);

  const rows = (inv.items || []).map(i => `
    <tr>
      <td>${i.name}</td>
      <td class="c">${i.quantity}</td>
      <td class="r">${cur}${fmt(i.price)}</td>
      <td class="r">${cur}${fmt(i.price * i.quantity)}</td>
    </tr>`).join('');

  // Correct order: Subtotal → Service Charge → Tax → GST → Total
  const extras = hasExtras ? `
    <tr class="sub"><td colspan="3">Subtotal</td><td class="r">${cur}${fmt(inv.subtotalAmount)}</td></tr>
    ${inv.serviceChargeEnabled && inv.serviceChargeAmount > 0 ? `<tr class="sub"><td colspan="3">Service Charge (${scPct}%)</td><td class="r">${cur}${fmt(inv.serviceChargeAmount)}</td></tr>` : ''}
    ${inv.taxEnabled && inv.taxAmount > 0 ? `<tr class="sub"><td colspan="3">${inv.taxName || 'Tax'} (${taxPct}%)</td><td class="r">${cur}${fmt(inv.taxAmount)}</td></tr>` : ''}
    ${inv.gstEnabled && inv.gstAmount > 0 ? `<tr class="sub"><td colspan="3">GST (${gstPct}%)</td><td class="r">${cur}${fmt(inv.gstAmount)}</td></tr>` : ''}
  ` : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>Invoice ${inv.invoiceNumber}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;font-size:13px;color:#1a1a1a;padding:32px;max-width:600px;margin:0 auto}
    h1{font-size:24px;color:#D4AF37;letter-spacing:1px;margin-bottom:4px}
    .header{text-align:center;border-bottom:2px solid #D4AF37;padding-bottom:16px;margin-bottom:20px}
    .meta{display:flex;justify-content:space-between;margin-bottom:20px;font-size:12px;color:#555}
    .meta strong{color:#1a1a1a}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    thead tr{background:#1a1a1a;color:#D4AF37}
    th{padding:10px 12px;text-align:left;font-size:11px;letter-spacing:.5px}
    td{padding:9px 12px;border-bottom:1px solid #eee}
    .r{text-align:right} .c{text-align:center}
    .sub td{color:#555;font-size:12px;background:#fafafa}
    .total td{border-top:2px solid #D4AF37;font-weight:700;font-size:15px;padding-top:12px}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700}
    .paid{background:#d1fae5;color:#065f46} .pending{background:#fef3c7;color:#92400e}
    .footer{text-align:center;margin-top:24px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:16px}
    @media print{@page{margin:1cm}}
  </style></head><body>
  <div class="header">
    <h1>${inv.cafeName || 'Café'}</h1>
    ${inv.cafeAddress ? `<p>${inv.cafeAddress}</p>` : ''}
    ${inv.cafeGstNumber ? `<p>GST: ${inv.cafeGstNumber}</p>` : ''}
  </div>
  <div class="meta">
    <div>
      <p><strong>Invoice #</strong> ${inv.invoiceNumber}</p>
      <p><strong>Order #</strong> ${inv.orderNumber ? `#${String(inv.orderNumber).padStart(3,'0')}` : inv.orderId?.slice(0,8)}</p>
      <p><strong>Date</strong> ${formatDate(inv.orderTime || inv.createdAt)}</p>
    </div>
    <div style="text-align:right">
      <p><strong>Customer</strong> ${inv.customerName || '—'}</p>
      ${inv.customerPhone ? `<p><strong>Phone</strong> ${inv.customerPhone}</p>` : ''}
      ${inv.tableNumber ? `<p><strong>Table</strong> ${inv.tableNumber}</p>` : ''}
      <p><span class="badge ${inv.paymentStatus === 'paid' ? 'paid' : 'pending'}">${inv.paymentStatus === 'paid' ? '✓ PAID' : 'PENDING'}</span></p>
    </div>
  </div>
  <table>
    <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
    <tbody>
      ${rows}
      ${extras}
      <tr class="total">
        <td colspan="3">TOTAL</td>
        <td class="r">${cur}${fmt(inv.totalAmount)}</td>
      </tr>
    </tbody>
  </table>
  <p style="font-size:12px;color:#555">Payment: <strong>${
    inv.paymentMode === 'counter' ? 'Pay at Counter' :
    inv.paymentMode === 'table' ? 'Pay on Table' :
    inv.paymentMode === 'online' ? 'Online Payment' : 'Prepaid (UPI)'
  }</strong></p>
  <div class="footer">
    <p>Thank you for visiting us 🙏</p>
    <p style="margin-top:4px;font-size:10px">Powered by Branding Architect SmartCafé OS</p>
  </div>
  </body></html>`;
};

const InvoicePage = () => {
  const { invoiceId } = useParams();
  const [invoice, setInvoice]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!invoiceId) { setNotFound(true); setLoading(false); return; }
    const unsub = onSnapshot(
      doc(db, 'invoices', invoiceId),
      (snap) => {
        if (snap.exists()) { setInvoice({ id: snap.id, ...snap.data() }); }
        else               { setNotFound(true); }
        setLoading(false);
      },
      () => { setNotFound(true); setLoading(false); }
    );
    return () => unsub();
  }, [invoiceId]);

  const handleDownload = () => {
    const html = buildPrintHTML(invoice);
    const w = window.open('', '_blank', 'width=700,height=900');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  const handleWhatsApp = () => {
    if (!invoice) return;
    const cur = invoice.currencySymbol || '₹';
    const url = window.location.href;
    const msg =
      `Thank you for visiting ${invoice.cafeName || 'our café'} ☕\n\n` +
      `Your invoice is ready.\n` +
      `Invoice No: ${invoice.invoiceNumber}\n` +
      `Amount: ${cur}${fmt(invoice.totalAmount)}\n\n` +
      `View invoice: ${url}`;
    // iOS-safe WA redirect
    window.location.href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };

  if (loading) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 rounded-full border-4 border-[#D4AF37] border-t-transparent" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center text-center p-8">
      <div>
        <AlertCircle className="w-14 h-14 text-[#A3A3A3] mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Invoice Not Found</h2>
        <p className="text-[#A3A3A3] text-sm">Invoice ID: {invoiceId}</p>
      </div>
    </div>
  );

  const cur = invoice.currencySymbol || '₹';
  const hasExtras =
    (invoice.taxEnabled && invoice.taxAmount > 0) ||
    (invoice.serviceChargeEnabled && invoice.serviceChargeAmount > 0) ||
    (invoice.gstEnabled && invoice.gstAmount > 0);

  return (
    <div className="min-h-screen bg-[#050505]" style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Action bar */}
      <div className="sticky top-0 z-10 bg-[#0A0A0A] border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Coffee className="w-5 h-5 text-[#D4AF37]" />
          <span className="text-white font-semibold text-sm">{invoice.cafeName}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleWhatsApp}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-sm text-xs transition-all"
          >
            📱 Share via WhatsApp
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37] hover:bg-[#C5A059] text-black font-bold rounded-sm text-xs transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </button>
        </div>
      </div>

      {/* Invoice card */}
      <div className="max-w-2xl mx-auto p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-[#0F0F0F] border border-white/10 rounded-xl overflow-hidden"
        >
          {/* Cafe header */}
          <div className="text-center px-8 py-6 border-b border-white/10 bg-[#0A0A0A]">
            <h1 className="text-2xl font-bold text-[#D4AF37]" style={{ fontFamily: 'Playfair Display, serif' }}>
              {invoice.cafeName}
            </h1>
            {invoice.cafeGstNumber && (
              <p className="text-[#A3A3A3] text-xs mt-1">GST: {invoice.cafeGstNumber}</p>
            )}
          </div>

          <div className="p-6 space-y-5">
            {/* Invoice meta */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1.5">
                <div>
                  <p className="text-[#A3A3A3] text-xs uppercase tracking-wide">Invoice #</p>
                  <p className="text-white font-mono font-semibold">{invoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-[#A3A3A3] text-xs uppercase tracking-wide">Order #</p>
                  <p className="text-white font-semibold">
                    {invoice.orderNumber ? `#${String(invoice.orderNumber).padStart(3,'0')}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[#A3A3A3] text-xs uppercase tracking-wide">Date</p>
                  <p className="text-white">{formatDate(invoice.orderTime || invoice.createdAt)}</p>
                </div>
              </div>
              <div className="space-y-1.5 text-right">
                <div>
                  <p className="text-[#A3A3A3] text-xs uppercase tracking-wide">Customer</p>
                  <p className="text-white font-semibold">{invoice.customerName || '—'}</p>
                </div>
                {invoice.customerPhone && (
                  <div>
                    <p className="text-[#A3A3A3] text-xs uppercase tracking-wide">Phone</p>
                    <p className="text-white">{invoice.customerPhone}</p>
                  </div>
                )}
                {invoice.tableNumber && (
                  <div>
                    <p className="text-[#A3A3A3] text-xs uppercase tracking-wide">Table</p>
                    <p className="text-white">{invoice.tableNumber}</p>
                  </div>
                )}
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold mt-1 ${
                  invoice.paymentStatus === 'paid'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                }`}>
                  {invoice.paymentStatus === 'paid' ? '✓ PAID' : 'PAYMENT PENDING'}
                </span>
              </div>
            </div>

            {/* Items table */}
            <div className="rounded-lg overflow-hidden border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#D4AF37]/10 border-b border-white/10">
                    {['Item', 'Qty', 'Price', 'Amount'].map(h => (
                      <th key={h} className={`px-4 py-3 text-[#D4AF37] font-semibold text-xs uppercase tracking-wide ${
                        h === 'Item' ? 'text-left' : 'text-right'
                      }`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(invoice.items || []).map((item, idx) => (
                    <tr key={idx} className={`border-b border-white/5 ${idx % 2 === 0 ? 'bg-black/10' : ''}`}>
                      <td className="px-4 py-3 text-white">{item.name}</td>
                      <td className="px-4 py-3 text-right text-[#A3A3A3]">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-[#A3A3A3]">{cur}{fmt(item.price)}</td>
                      <td className="px-4 py-3 text-right text-white font-medium">{cur}{fmt(item.price * item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="bg-[#0A0A0A] border border-white/10 rounded-lg p-4 space-y-2 text-sm">
              {hasExtras ? (
                <>
                  <div className="flex justify-between text-[#A3A3A3]">
                    <span>Subtotal</span><span>{cur}{fmt(invoice.subtotalAmount)}</span>
                  </div>
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
                  <div className="border-t border-white/10 pt-2 flex justify-between font-bold text-base">
                    <span className="text-white">TOTAL</span>
                    <span className="text-[#D4AF37] text-lg">{cur}{fmt(invoice.totalAmount)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between font-bold text-base">
                  <span className="text-white">TOTAL</span>
                  <span className="text-[#D4AF37] text-lg">{cur}{fmt(invoice.totalAmount)}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <p className="text-center text-[#555] text-xs pt-2 border-t border-white/5">
              Thank you for visiting us 🙏 · Branding Architect SmartCafé OS
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default InvoicePage;
