import { useState, useEffect, useRef } from 'react';
import { QrCode, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { CAFE_CONFIG } from '@/constants/config';

export default function QRMenuPage() {
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const [menuUrl, setMenuUrl] = useState('');
  const [qrReady, setQrReady] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMenuUrl(`${window.location.origin}/digital-menu`);
  }, []);

  useEffect(() => {
    if (!menuUrl || !qrContainerRef.current) return;

    // Clear any previous QR
    qrContainerRef.current.innerHTML = '';
    setQrReady(false);
    setLoading(true);

    const loadAndGenerate = () => {
      // Remove old script if present so onload fires again
      const existing = document.getElementById('qrcode-script');
      if (existing) existing.remove();

      const script = document.createElement('script');
      script.id = 'qrcode-script';
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      script.onload = () => {
        if (!qrContainerRef.current) return;
        qrContainerRef.current.innerHTML = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (window as any).QRCode(qrContainerRef.current, {
          text: menuUrl,
          width: 256,
          height: 256,
          colorDark: '#1a1a1a',
          colorLight: '#ffffff',
          correctLevel: (window as any).QRCode.CorrectLevel.H,
        });
        // QRCode renders synchronously — small delay for DOM paint
        setTimeout(() => {
          setQrReady(true);
          setLoading(false);
        }, 150);
      };
      script.onerror = () => setLoading(false);
      document.head.appendChild(script);
    };

    loadAndGenerate();
  }, [menuUrl]);

  const downloadQR = () => {
    if (!qrContainerRef.current || !qrReady) return;
    const img = qrContainerRef.current.querySelector('img') as HTMLImageElement | null;
    const canvas = qrContainerRef.current.querySelector('canvas') as HTMLCanvasElement | null;

    const pad = 32;
    const size = 256;
    const out = document.createElement('canvas');
    out.width = size + pad * 2;
    out.height = size + pad * 2 + 80;
    const ctx = out.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);

    const draw = (source: CanvasImageSource) => {
      ctx.drawImage(source, pad, pad, size, size);
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 20px serif';
      ctx.textAlign = 'center';
      ctx.fillText(CAFE_CONFIG.name, out.width / 2, size + pad + 30);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#666666';
      ctx.fillText('Scan to view our menu', out.width / 2, size + pad + 56);
      const link = document.createElement('a');
      link.download = 'cafe-aadvikam-menu-qr.png';
      link.href = out.toDataURL('image/png');
      link.click();
    };

    if (canvas) {
      draw(canvas);
    } else if (img) {
      const tmp = new Image();
      tmp.crossOrigin = 'anonymous';
      tmp.onload = () => draw(tmp);
      tmp.src = img.src;
    }
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

            <div className="relative size-[260px] bg-white rounded-2xl border-2 border-border flex items-center justify-center shadow-sm overflow-hidden">
              {/* QRCode renders into this div */}
              <div
                ref={qrContainerRef}
                className={qrReady ? 'flex items-center justify-center' : 'hidden'}
              />
              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
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
