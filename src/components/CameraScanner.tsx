'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

type ScanState = 'starting' | 'scanning' | 'error';

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => {
      detect: (source: HTMLVideoElement | ImageBitmap | ImageData) => Promise<
        Array<{ rawValue: string; format: string }>
      >;
    };
  }
}

const BARCODE_FORMATS = [
  'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93',
  'qr_code', 'upc_a', 'upc_e', 'itf',
];

export default function CameraScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const detectorRef = useRef<InstanceType<NonNullable<Window['BarcodeDetector']>> | null>(null);
  const [scanState, setScanState] = useState<ScanState>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const scannedRef = useRef(false);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  const startScan = useCallback(async () => {
    setScanState('starting');
    setErrorMsg('');
    scannedRef.current = false;

    // Check BarcodeDetector support
    if (!window.BarcodeDetector) {
      setScanState('error');
      setErrorMsg('เบราว์เซอร์นี้ยังไม่รองรับการสแกน — กรุณาใช้ Chrome บน Android หรือ Safari iOS 17+');
      return;
    }

    // Init detector
    try {
      const supported = await (window.BarcodeDetector as { getSupportedFormats?: () => Promise<string[]> })
        .getSupportedFormats?.() ?? BARCODE_FORMATS;
      const formats = BARCODE_FORMATS.filter(f => supported.includes(f));
      detectorRef.current = new window.BarcodeDetector({ formats: formats.length ? formats : BARCODE_FORMATS });
    } catch {
      detectorRef.current = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
    }

    // Get camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanState('scanning');

      // Scan loop
      const scan = async () => {
        if (scannedRef.current || !videoRef.current || !detectorRef.current) return;
        if (videoRef.current.readyState >= 2) {
          try {
            const results = await detectorRef.current.detect(videoRef.current);
            if (results.length > 0 && !scannedRef.current) {
              scannedRef.current = true;
              stopCamera();
              onScan(results[0].rawValue);
              return;
            }
          } catch {
            // ignore frame errors
          }
        }
        rafRef.current = requestAnimationFrame(scan);
      };
      rafRef.current = requestAnimationFrame(scan);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setScanState('error');
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setErrorMsg('ไม่ได้รับอนุญาตใช้กล้อง — กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setErrorMsg('ไม่พบกล้องในอุปกรณ์นี้');
      } else {
        setErrorMsg(`ไม่สามารถเปิดกล้องได้: ${msg}`);
      }
    }
  }, [stopCamera, onScan]);

  useEffect(() => {
    startScan();
    return () => stopCamera();
  }, [startScan, stopCamera]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  return (
    <div className="camera-scanner-overlay" onClick={handleClose}>
      <div className="camera-scanner-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="camera-scanner-header">
          <div className="camera-scanner-title">
            <Camera size={18} strokeWidth={2} aria-hidden />
            <span>สแกน Barcode</span>
          </div>
          <button
            className="camera-scanner-close"
            onClick={handleClose}
            aria-label="ปิด"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {/* Viewfinder */}
        <div className="camera-scanner-viewfinder">
          <video
            ref={videoRef}
            className="camera-scanner-video"
            playsInline
            muted
            autoPlay
          />

          {scanState === 'scanning' && (
            <div className="camera-scanner-aim">
              <div className="camera-scanner-aim-inner" />
              <p className="camera-scanner-aim-label">วาง barcode ในกรอบ</p>
            </div>
          )}

          {scanState === 'starting' && (
            <div className="camera-scanner-status">
              <Loader2 size={32} className="home-spin" strokeWidth={2} aria-hidden />
              <p>กำลังเปิดกล้อง…</p>
            </div>
          )}

          {scanState === 'error' && (
            <div className="camera-scanner-status camera-scanner-status--error">
              <AlertCircle size={32} strokeWidth={2} aria-hidden />
              <p>{errorMsg}</p>
              <button className="home-btn home-btn--primary" onClick={startScan} style={{ marginTop: 12 }}>
                ลองอีกครั้ง
              </button>
            </div>
          )}
        </div>

        <p className="camera-scanner-footer">
          รองรับ EAN-13 · EAN-8 · Code128 · QR Code · และอื่นๆ
        </p>
      </div>
    </div>
  );
}
