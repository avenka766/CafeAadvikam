import { useState, useEffect, useRef } from 'react';
import { QrCode, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { CAFE_CONFIG } from '@/constants/config';

declare const QRCode: {
  toCanvas: (canvas: HTMLCanvasElement, text: string, options: object, cb: (err: unknown) => void) => void;
};

export default function QRMenuPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [menuUrl, setMenuUrl] = useState('');
  const [qrReady, setQrReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    const url = `${window.location.origin}/digital-menu`;
    setMenuUrl(url);
  }, []);

  useEffect(() => {
    if (document.getElementById('qrcode-script')) {
      setScriptLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'qrcode-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !menuUrl || !canvasRef.current) return;
    setLoading(true);
    setQrReady(false);
    const tryGenerate = () => {
      if (typeof QRCode === 'undefined') { setTimeout(tryGenerate, 100); return; }
      QRCode.toCanvas(canvasRef.current!, menuUrl, {
        width: 280, margin: 2,
        color: { dark: '#1a1a1a', light: '#ffffff' },
      }, (err) => {
        if (!err) { setQrReady(true); setLoading(false); }
      });
    };
    tryGenerate();
  }, [scriptLoaded, menuUrl]);

  const downloadQR = () => {
    if (!canvasRef.current || !qrReady) return;
    const canvas = canvasRef.current;
    const pad = 32;
    const out = document.createElement('canvas');
    out.width = canvas.width + pad * 2;
    out.height = canvas.height + pad * 2 + 80;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, pad, pad);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 20px serif';
    ctx.textAlign = 'center';
    ctx.fillText(CAFE_CONFIG.name, out.width / 2, canvas.height + pad + 30);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText('Scan to view our menu', out.width / 2, canvas.height + pad + 56);
    const link = document.createElement('a');
    link.download = 'cafe-aadvikam-menu-qr.png';
    link.href = out.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="min-h-screen bg-background pt-14 pb-24">
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <QrCode className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Menu QR Code</h1>
            <p className="text-xs font-body text-muted-foreground">Customers scan this to view the digital menu</p>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* QR Card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex flex-col items-center py-8 px-6 gap-4">
            <p className="font-display text-lg font-bold text-foreground">{CAFE_CONFIG.name}</p>
            <p className="text-xs font-body text-muted-foreground -mt-3">{CAFE_CONFIG.tagline}</p>

            <div className="relative size-[280px] bg-white rounded-2xl border-2 border-border flex items-center justify-center shadow-sm">
              <canvas ref={canvasRef} className={qrReady ? 'rounded-xl' : 'hidden'} />
              {loading && (
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="size-8 text-muted-foreground animate-spin" />
                  <p className="text-xs font-body text-muted-foreground">Generating QR code...</p>
                </div>
              )}
            </div>

            <p className="text-xs font-body text-muted-foreground text-center">
              {CAFE_CONFIG.type} • {CAFE_CONFIG.hours}
            </p>
            <p className="text-[10px] font-body text-muted-foreground text-center">{CAFE_CONFIG.address}</p>
          </div>

          <div className="border-t border-border px-4 py-3 bg-muted/30">
            <p className="text-[10px] font-body text-muted-foreground mb-1 font-semibold uppercase tracking-wide">Menu URL</p>
            <p className="text-xs font-body text-foreground break-all">{menuUrl}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={downloadQR}
            disabled={!qrReady}
            className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-body font-bold text-sm active:scale-95 transition-transform disabled:opacity-40"
          >
            <Download className="size-4" />
            Download QR
          </button>
          <a
            href="/digital-menu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-3.5 rounded-xl border border-border bg-card text-foreground font-body font-bold text-sm active:scale-95 transition-transform"
          >
            <ExternalLink className="size-4" />
            Preview Menu
          </a>
        </div>

        {/* Instructions */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <p className="text-sm font-body font-semibold text-foreground">How to use</p>
          {[
            ['Download QR', 'Save the QR code image to your device'],
            ['Print & Display', 'Print and place on tables or at the entrance'],
            ['Customers Scan', 'They scan with any phone camera to see the menu'],
            ['Always Updated', 'Menu changes reflect instantly — no reprinting needed'],
          ].map(([title, desc]) => (
            <div key={title} className="flex gap-3">
              <div className="size-1.5 rounded-full bg-primary mt-2 shrink-0" />
              <div>
                <p className="text-xs font-body font-semibold text-foreground">{title}</p>
                <p className="text-xs font-body text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
