import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { QrCode, Download, ExternalLink, RefreshCw, ChevronDown } from 'lucide-react';
import { CAFE_CONFIG, TABLE_NUMBERS } from '@/constants/config';
import { cn } from '@/lib/utils';

export default function QRMenuPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTable, setSelectedTable] = useState<number | 'general'>('general');
  const [menuUrl, setMenuUrl] = useState('');
  const [qrReady, setQrReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTablePicker, setShowTablePicker] = useState(false);

  useEffect(() => {
    if (selectedTable === 'general') {
      setMenuUrl(`${window.location.origin}/cafe-order`);
    } else {
      setMenuUrl(`${window.location.origin}/cafe-order?table=${selectedTable}`);
    }
  }, [selectedTable]);

  useEffect(() => {
    if (!menuUrl || !canvasRef.current) return;

    setQrReady(false);
    setLoading(true);

    QRCode.toCanvas(canvasRef.current, menuUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    })
      .then(() => {
        setQrReady(true);
        setLoading(false);
      })
      .catch((err) => {
        console.error('QR generation failed:', err);
        setLoading(false);
      });
  }, [menuUrl]);

  const downloadQR = () => {
    if (!canvasRef.current || !qrReady) return;

    const pad = 32;
    const size = 256;
    const out = document.createElement('canvas');
    out.width = size + pad * 2;
    out.height = size + pad * 2 + 80;
    const ctx = out.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvasRef.current, pad, pad, size, size);

    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 20px serif';
    ctx.textAlign = 'center';
    ctx.fillText(CAFE_CONFIG.name, out.width / 2, size + pad + 30);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#666666';
    const label = selectedTable === 'general' ? 'Scan to order' : `Table ${selectedTable} · Scan to order`;
    ctx.fillText(label, out.width / 2, size + pad + 56);

    const link = document.createElement('a');
    link.download = selectedTable === 'general'
      ? 'cafe-aadvikam-order-qr.png'
      : `cafe-aadvikam-table-${selectedTable}-qr.png`;
    link.href = out.toDataURL('image/png');
    link.click();
  };

  const downloadAllTables = async () => {
    for (let idx = 0; idx < TABLE_NUMBERS.length; idx++) {
      const tableNum = TABLE_NUMBERS[idx];
      const url = `${window.location.origin}/cafe-order?table=${tableNum}`;

      const tempCanvas = document.createElement('canvas');
      await QRCode.toCanvas(tempCanvas, url, {
        width: 256,
        margin: 2,
        color: { dark: '#1a1a1a', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      });

      const pad = 32;
      const size = 256;
      const out = document.createElement('canvas');
      out.width = size + pad * 2;
      out.height = size + pad * 2 + 80;
      const ctx = out.getContext('2d')!;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(tempCanvas, pad, pad, size, size);

      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 20px serif';
      ctx.textAlign = 'center';
      ctx.fillText(CAFE_CONFIG.name, out.width / 2, size + pad + 30);

      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#666666';
      ctx.fillText(`Table ${tableNum} · Scan to order`, out.width / 2, size + pad + 56);

      const link = document.createElement('a');
      link.download = `cafe-aadvikam-table-${tableNum}-qr.png`;
      link.href = out.toDataURL('image/png');
      link.click();

      await new Promise((r) => setTimeout(r, 300));
    }
  };

  return (
    <div className="dashboard-screen min-h-screen bg-transparent pt-0 pb-6">
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <QrCode className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">QR Code Ordering</h1>
            <p className="text-xs font-body text-muted-foreground">Generate QR codes for each table</p>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Table selector */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs font-body font-semibold text-foreground mb-2 uppercase tracking-wide">Select Table</p>
          <div className="relative">
            <button
              onClick={() => setShowTablePicker(!showTablePicker)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-background text-sm font-body font-semibold"
            >
              {selectedTable === 'general' ? '📋 General (No table)' : `🪑 Table ${selectedTable}`}
              <ChevronDown className={cn('size-4 transition-transform', showTablePicker && 'rotate-180')} />
            </button>
            {showTablePicker && (
              <div className="mt-2 grid grid-cols-5 gap-2">
                <button
                  onClick={() => { setSelectedTable('general'); setShowTablePicker(false); }}
                  className={cn(
                    'col-span-5 py-2.5 rounded-xl text-sm font-body font-bold border transition-all active:scale-95',
                    selectedTable === 'general'
                      ? 'cafe-gradient text-primary-foreground border-transparent'
                      : 'bg-background border-border text-foreground',
                  )}
                >
                  📋 General (No table)
                </button>
                {TABLE_NUMBERS.map((n) => (
                  <button
                    key={n}
                    onClick={() => { setSelectedTable(n); setShowTablePicker(false); }}
                    className={cn(
                      'py-2.5 rounded-xl text-sm font-body font-bold border transition-all active:scale-95',
                      selectedTable === n
                        ? 'cafe-gradient text-primary-foreground border-transparent shadow-sm'
                        : 'bg-background border-border text-foreground',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* QR Card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex flex-col items-center py-8 px-6 gap-4">
            <p className="font-display text-lg font-bold text-foreground">{CAFE_CONFIG.name}</p>
            <p className="text-xs font-body text-muted-foreground -mt-3">
              {selectedTable === 'general' ? 'Order from any table' : `Table ${selectedTable}`}
            </p>

            <div className="relative size-[260px] bg-white rounded-2xl border-2 border-border flex items-center justify-center shadow-sm overflow-hidden">
              <canvas ref={canvasRef} className={qrReady ? 'block' : 'invisible'} />
              {loading && (
                <div className="absolute inset-0 bg-white flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="size-8 text-muted-foreground animate-spin" />
                  <p className="text-xs font-body text-muted-foreground">Generating QR code...</p>
                </div>
              )}
            </div>

            <p className="text-xs font-body text-muted-foreground text-center">{CAFE_CONFIG.type} • {CAFE_CONFIG.hours}</p>
            <p className="text-[10px] font-body text-muted-foreground text-center">{CAFE_CONFIG.address}</p>
          </div>

          <div className="border-t border-border px-4 py-3 bg-muted/30">
            <p className="text-[10px] font-body text-muted-foreground mb-1 font-semibold uppercase tracking-wide">Order URL</p>
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
            href={menuUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-3.5 rounded-xl border border-border bg-card text-foreground font-body font-bold text-sm active:scale-95 transition-transform"
          >
            <ExternalLink className="size-4" />
            Preview
          </a>
        </div>

        {/* Download all tables */}
        <button
          onClick={downloadAllTables}
          className="w-full py-3.5 rounded-xl gold-gradient text-white font-body font-bold text-sm active:scale-95 transition-transform shadow-md flex items-center justify-center gap-2"
        >
          <Download className="size-4" />
          Download All Table QR Codes ({TABLE_NUMBERS.length} tables)
        </button>

        {/* Instructions */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <p className="text-sm font-body font-semibold text-foreground">How QR Ordering Works</p>
          {[
            ['Generate QR', 'Select a table above and download its unique QR code'],
            ['Print & Place', 'Print QR codes and place on each table'],
            ['Customer Scans', 'Customer scans QR → sees menu → adds items → places order'],
            ['Kitchen Gets Order', 'Order appears instantly on Kitchen & Billing dashboards'],
            ['Track Source', 'QR orders are tagged so you know the source'],
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
