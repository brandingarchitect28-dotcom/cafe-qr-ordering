import React, { useRef, useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Printer, ExternalLink, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';

// ── Theme-aware CSS injection ─────────────────────────────────────────────────
function injectQRCSS(isLight) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('qr-omf-css');
  if (existing) existing.remove();

  const C = isLight ? {
    cardBg:        '#FFFFFF',
    cardBorder:    'rgba(0,0,0,0.10)',
    cardHover:     'rgba(201,162,39,0.20)',
    btnGhostBg:    'rgba(0,0,0,0.05)',
    btnGhostColor: '#444444',
    btnGhostBorder:'rgba(0,0,0,0.10)',
    btnGhostHover: '#111111',
    btnGhostHBg:   'rgba(0,0,0,0.09)',
    btnOutlineBg:  'rgba(201,162,39,0.08)',
    copyBtnBg:     'rgba(0,0,0,0.04)',
    copyBtnBorder: 'rgba(0,0,0,0.09)',
    infoBg:        'rgba(201,162,39,0.05)',
    infoBorder:    'rgba(201,162,39,0.18)',
    frameBoxShadow:'0 0 0 1px rgba(201,162,39,0.18), 0 8px 32px rgba(0,0,0,0.08)',
    dividerC:      'rgba(0,0,0,0.07)',
  } : {
    cardBg:        '#120f00',
    cardBorder:    'rgba(255,255,255,0.07)',
    cardHover:     'rgba(201,162,39,0.2)',
    btnGhostBg:    'rgba(255,255,255,0.05)',
    btnGhostColor: '#7a6a3a',
    btnGhostBorder:'rgba(255,255,255,0.08)',
    btnGhostHover: '#ffffff',
    btnGhostHBg:   'rgba(255,255,255,0.09)',
    btnOutlineBg:  'rgba(201,162,39,0.07)',
    copyBtnBg:     'rgba(255,255,255,0.04)',
    copyBtnBorder: 'rgba(255,255,255,0.07)',
    infoBg:        'rgba(201,162,39,0.06)',
    infoBorder:    'rgba(201,162,39,0.15)',
    frameBoxShadow:'0 0 0 1px rgba(201,162,39,0.18), 0 16px 48px rgba(0,0,0,0.5)',
    dividerC:      'rgba(255,255,255,0.05)',
  };

  const el = document.createElement('style');
  el.id = 'qr-omf-css';
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800;900&display=swap');

    .qr-wrap  { font-family: 'DM Sans', system-ui, sans-serif; }
    .qr-title { font-family: 'Playfair Display', serif !important; letter-spacing: 0.01em; }

    .qr-card {
      background: ${C.cardBg};
      border: 1.5px solid ${C.cardBorder};
      border-radius: 16px;
      transition: border-color 200ms, box-shadow 200ms;
    }
    .qr-card:hover { border-color: ${C.cardHover}; }

    .qr-sec {
      font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em;
      color: #C9A227; display: flex; align-items: center; gap: 5px;
      font-family: 'DM Sans', system-ui, sans-serif;
    }

    .qr-btn-primary {
      display: inline-flex; align-items: center; gap: 6px;
      background: linear-gradient(135deg, #C9A227, #8B6914);
      color: #fff; font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 800; font-size: 13px;
      padding: 10px 20px; border-radius: 10px;
      border: none; cursor: pointer;
      box-shadow: 0 3px 14px rgba(201,162,39,0.32);
      transition: all 180ms; white-space: nowrap;
    }
    .qr-btn-primary:hover  { transform: translateY(-1px); box-shadow: 0 5px 22px rgba(201,162,39,0.48); }
    .qr-btn-primary:active { transform: scale(0.96); }

    .qr-btn-ghost {
      display: inline-flex; align-items: center; gap: 6px;
      background: ${C.btnGhostBg}; color: ${C.btnGhostColor};
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 800; font-size: 13px;
      padding: 10px 20px; border-radius: 10px;
      border: 1.5px solid ${C.btnGhostBorder};
      cursor: pointer; transition: all 180ms; white-space: nowrap;
    }
    .qr-btn-ghost:hover  { background: ${C.btnGhostHBg}; color: ${C.btnGhostHover}; transform: translateY(-1px); }
    .qr-btn-ghost:active { transform: scale(0.96); }

    .qr-btn-outline {
      display: inline-flex; align-items: center; gap: 6px;
      background: ${C.btnOutlineBg}; color: #C9A227;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-weight: 800; font-size: 13px;
      padding: 10px 20px; border-radius: 10px;
      border: 1.5px solid rgba(201,162,39,0.22);
      cursor: pointer; transition: all 180ms; white-space: nowrap;
    }
    .qr-btn-outline:hover  { background: rgba(201,162,39,0.14); transform: translateY(-1px); }
    .qr-btn-outline:active { transform: scale(0.96); }

    .qr-copy-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 8px;
      background: ${C.copyBtnBg}; border: 1.5px solid ${C.copyBtnBorder};
      cursor: pointer; transition: all 160px; flex-shrink: 0;
    }
    .qr-copy-btn:hover { background: rgba(201,162,39,0.1); border-color: rgba(201,162,39,0.25); }

    .qr-info-card {
      background: ${C.infoBg};
      border: 1.5px solid ${C.infoBorder};
      border-radius: 14px;
    }

    @keyframes qrIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    .qr-in { animation: qrIn 300ms ease forwards; }

    .qr-frame {
      background: #fff;
      border-radius: 14px;
      padding: 20px;
      box-shadow: ${C.frameBoxShadow};
      display: inline-flex;
    }

    .qr-divider { background: ${C.dividerC}; height: 1px; }

    @media print {
      body * { visibility: hidden; }
      [data-testid="qr-code-display"], [data-testid="qr-code-display"] * { visibility: visible; }
      [data-testid="qr-code-display"] { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); }
    }
  `;
  document.head.appendChild(el);
}

const QRGenerator = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const qrRef  = useRef(null);
  const [copied, setCopied] = useState(false);

  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();

  // Re-inject CSS whenever theme changes
  useEffect(() => { injectQRCSS(isLight); }, [isLight]);

  // ── Color tokens ──────────────────────────────────────────────────────────
  const text       = isLight ? '#111111' : '#ffffff';
  const muted      = isLight ? '#555555' : '#7a6a3a';
  const faint      = isLight ? '#666666' : '#3d341a';
  const urlBoxBg   = isLight ? '#F5F3EE' : '#1a1500';
  const urlBoxBd   = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
  const urlBoxC    = isLight ? '#B8941F'  : '#C9A227';   // gold URL text — darker in light
  const cafeIdC    = isLight ? '#666666'  : '#3d341a';
  const howToC     = isLight ? '#333333'  : 'rgba(255,255,255,0.65)'; // was invisible white
  const copyIconC  = isLight ? '#555555'  : '#7a6a3a';
  // ─────────────────────────────────────────────────────────────────────────

  const baseUrl  = process.env.REACT_APP_PRODUCTION_URL || window.location.origin;
  const cafeUrl  = `${baseUrl}/cafe/${cafeId}`;

  const downloadQR = () => {
    const svg     = qrRef.current.querySelector('svg');
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas  = document.createElement('canvas');
    const ctx     = canvas.getContext('2d');
    const img     = new Image();
    canvas.width  = 1000;
    canvas.height = 1000;
    img.onload = () => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 100, 100, 800, 800);
      const pngFile      = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `cafe-qr-${cafeId}.png`;
      downloadLink.href     = pngFile;
      downloadLink.click();
      toast.success('QR Code downloaded!');
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const printQR     = () => { window.print(); toast.success('Print dialog opened'); };
  const openCafePage = () => { window.open(cafeUrl, '_blank'); };
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(cafeUrl);
      setCopied(true);
      toast.success('URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { toast.error('Failed to copy URL'); }
  };

  if (!cafeId) {
    return (
      <div className="qr-card qr-wrap p-8 text-center">
        <p style={{ color: muted, fontSize: 14 }}>No cafe assigned to your account</p>
      </div>
    );
  }

  return (
    <div className="qr-wrap space-y-5">

      {/* Main QR card */}
      <div className="qr-card qr-in p-6 sm:p-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="text-3xl">📱</div>
          <div>
            <h2 className="qr-title font-black text-xl" style={{ color: text }}>
              {cafe?.name || 'Your Café'} — QR Code
            </h2>
            <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: muted }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: '#C9A227' }}/>
              Scan to view menu &amp; place orders
            </p>
          </div>
        </div>

        <div className="qr-divider mb-7" />

        <div className="flex flex-col items-center gap-7">

          {/* QR frame */}
          <div ref={qrRef} data-testid="qr-code-display" className="qr-frame">
            <QRCodeSVG value={cafeUrl} size={260} level="H" includeMargin={true} />
          </div>

          {/* URL row */}
          <div className="text-center print:hidden" style={{ maxWidth: 400, width: '100%' }}>
            <p className="qr-sec mb-2">🔗 Ordering URL</p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: urlBoxBg, border: `1.5px solid ${urlBoxBd}`,
              borderRadius: 12, padding: '10px 14px',
            }}>
              <p style={{ color: urlBoxC, fontFamily: 'monospace', fontSize: 12, fontWeight: 600, wordBreak: 'break-all', flex: 1, textAlign: 'left' }}>
                {cafeUrl}
              </p>
              <button onClick={copyUrl} className="qr-copy-btn" title="Copy URL">
                {copied
                  ? <Check style={{ width: 14, height: 14, color: '#4ade80' }}/>
                  : <Copy style={{ width: 14, height: 14, color: copyIconC }}/>
                }
              </button>
            </div>
            <p style={{ color: cafeIdC, fontSize: 11, marginTop: 8, fontWeight: 600 }}>
              Cafe ID: {cafeId}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 justify-center print:hidden">
            <button onClick={downloadQR} data-testid="download-qr-btn" className="qr-btn-primary">
              <Download style={{ width: 15, height: 15 }}/> Download QR
            </button>
            <button onClick={printQR} data-testid="print-qr-btn" className="qr-btn-ghost">
              <Printer style={{ width: 15, height: 15 }}/> Print QR
            </button>
            <button onClick={openCafePage} data-testid="preview-cafe-btn" className="qr-btn-outline">
              <ExternalLink style={{ width: 15, height: 15 }}/> Preview Page
            </button>
          </div>
        </div>
      </div>

      {/* How to use card */}
      <div className="qr-info-card qr-in p-6 print:hidden" style={{ animationDelay: '80ms', animationFillMode: 'both' }}>
        <p className="qr-sec mb-4">📋 How to Use QR Code</p>
        <ol style={{ color: howToC, fontSize: 13, lineHeight: 1.8, paddingLeft: 0, listStyle: 'none' }}>
          {[
            ['Download', 'the QR code as PNG image'],
            ['Print',    'the QR code on table tents, menus, or posters'],
            ['Place',    'QR codes on each table or at the counter'],
            ['Customers scan', 'to view menu and place orders'],
            ['Receive orders', 'instantly in your Orders dashboard'],
          ].map(([bold, rest], i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(201,162,39,0.12)', border: '1px solid rgba(201,162,39,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 900, color: '#C9A227', marginTop: 1,
              }}>{i + 1}</span>
              <span><strong style={{ color: '#C9A227', fontWeight: 800 }}>{bold}</strong> {rest}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

export default QRGenerator;
