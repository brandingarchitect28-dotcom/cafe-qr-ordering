import React, { useRef, useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Printer, ExternalLink, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';

const QRGenerator = () => {
  const { user } = useAuth();
  const cafeId = user?.cafeId;
  const qrRef = useRef(null);
  const [copied, setCopied] = useState(false);
  
  // Get cafe data to show cafe name
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();

  // Use production URL or current origin
  // For deployed apps, use the actual domain; for preview, use window.location.origin
  const baseUrl = process.env.REACT_APP_PRODUCTION_URL || window.location.origin;
  const cafeUrl = `${baseUrl}/cafe/${cafeId}`;

  const downloadQR = () => {
    const svg = qrRef.current.querySelector('svg');
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = 1000;
    canvas.height = 1000;

    img.onload = () => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 100, 100, 800, 800);
      
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `cafe-qr-${cafeId}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
      
      toast.success('QR Code downloaded!');
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const printQR = () => {
    window.print();
    toast.success('Print dialog opened');
  };

  const openCafePage = () => {
    window.open(cafeUrl, '_blank');
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(cafeUrl);
      setCopied(true);
      toast.success('URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy URL');
    }
  };

  if (!cafeId) {
    return (
      <div className={`${T.card} rounded-sm p-8 text-center`}>
        <p className={`${T.muted}`}>No cafe assigned to your account</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* QR Code Display */}
      <div className={`${T.card} rounded-sm p-8`}>
        <h3 className={`text-xl font-semibold ${T.heading} mb-2 text-center`} style={{ fontFamily: 'Playfair Display, serif' }}>
          {cafe?.name || 'Your Café'} QR Code
        </h3>
        <p className={`${T.muted} text-sm text-center mb-6`}>
          Scan to view menu and place orders
        </p>

        <div className="flex flex-col items-center space-y-6">
          {/* QR Code */}
          <div 
            ref={qrRef}
            className="bg-white p-8 rounded-sm shadow-2xl print:shadow-none"
            data-testid="qr-code-display"
          >
            <QRCodeSVG 
              value={cafeUrl}
              size={300}
              level="H"
              includeMargin={true}
            />
          </div>

          {/* Cafe URL with Copy Button */}
          <div className="text-center space-y-2 print:hidden">
            <p className={`${T.muted} text-sm`}>Scan to order from:</p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-[#D4AF37] font-mono text-sm break-all max-w-md">
                {cafeUrl}
              </p>
              <button
                onClick={copyUrl}
                className="p-2 hover:bg-white/10 rounded transition-colors"
                title="Copy URL"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className={`w-4 h-4 ${T.muted}`} />
                )}
              </button>
            </div>
            <p className="text-[#666] text-xs mt-2">
              Cafe ID: {cafeId}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 justify-center print:hidden">
            <button
              onClick={downloadQR}
              data-testid="download-qr-btn"
              className="bg-[#D4AF37] text-black hover:bg-[#C5A059] rounded-sm px-6 py-3 font-semibold transition-all duration-300 flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Download QR
            </button>

            <button
              onClick={printQR}
              data-testid="print-qr-btn"
              className="bg-transparent border border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-sm px-6 py-3 font-semibold transition-all duration-300 flex items-center gap-2"
            >
              <Printer className="w-5 h-5" />
              Print QR
            </button>

            <button
              onClick={openCafePage}
              data-testid="preview-cafe-btn"
              className={`${T.subCard} border ${T.borderMd} text-white hover:bg-white/10 rounded-sm px-6 py-3 font-semibold transition-all duration-300 flex items-center gap-2`}
            >
              <ExternalLink className="w-5 h-5" />
              Preview Page
            </button>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-sm p-6 print:hidden">
        <h4 className={`${T.heading} font-semibold mb-3`}>How to Use QR Code</h4>
        <ol className="text-[#E5E5E5] text-sm space-y-2">
          <li>1. <strong>Download</strong> the QR code as PNG image</li>
          <li>2. <strong>Print</strong> the QR code on table tents, menus, or posters</li>
          <li>3. <strong>Place</strong> QR codes on each table or at the counter</li>
          <li>4. <strong>Customers scan</strong> to view menu and place orders</li>
          <li>5. <strong>Receive orders</strong> instantly on WhatsApp</li>
        </ol>
      </div>

      {/* Print Styles */}
      <style jsx>{`
        @media print {
          body * {
            visibility: hidden;
          }
          [data-testid="qr-code-display"], [data-testid="qr-code-display"] * {
            visibility: visible;
          }
          [data-testid="qr-code-display"] {
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
          }
        }
      `}</style>
    </div>
  );
};

export default QRGenerator;
