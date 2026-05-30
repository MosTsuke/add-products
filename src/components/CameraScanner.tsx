'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

type ScanState = 'starting' | 'scanning' | 'error';
type ScanEngine = 'native' | 'zxing' | null;

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => {
      detect: (source: HTMLVideoElement | ImageBitmap | ImageData) => Promise<
        Array<{ rawValue: string; format: string }>
      >;
      getSupportedFormats?: () => Promise<string[]>;
    } & { getSupportedFormats?: () => Promise<string[]> };
    ZXing?: {
      BrowserMultiFormatReader: new () => {
        decodeFromVideoDevice: (
          deviceId: string | null,
          videoEl: HTMLVideoElement,
          callback: (result: { getText: () => string } | null, err?: unknown) => void
        ) => Promise<void>;
        reset: () => void;
      };
    };
  }
}

const BARCODE_FORMATS = [
  'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93',
  'qr_code', 'upc_a', 'upc_e', 'itf',
];

const ZXING_CDN = 'https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js';

function loadZXing(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.ZXing) { resolve(); return; }
    const s = document.createElement('script');
    s.src = ZXING_CDN;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('โหลด ZXing ไม่สำเร็จ'));
    document.head.appendChild(s);
  });
}

export default function CameraScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const nativeDetectorRef = useRef<InstanceType<NonNullable<Window['BarcodeDetector']>> | null>(null);
  const zxingReaderRef = useRef<InstanceType<NonNullable<Window['ZXing']>['BrowserMultiFormatReader']> | null>(null);
  const engineRef = useRef<ScanEngine>(null);
  const [scanState, setScanState] = useState<ScanState>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const scannedRef = useRef(false);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    zxingReaderRef.current?.reset();
    zxingReaderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        throw new Error('ไม่ได้รับอนุญาตใช้กล้อง — กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        throw new Error('ไม่พบกล้องในอุปกรณ์นี้');
      } else {
        throw new Error(`ไม่สามารถเปิดกล้องได้: ${msg}`);
      }
    }
  }, []);

  const startNativeScan = useCallback(() => {
    const scan = async () => {
      if (scannedRef.current || !videoRef.current || !nativeDetectorRef.current) return;
      if (videoRef.current.readyState >= 2) {
        try {
          const results = await nativeDetectorRef.current.detect(videoRef.current);
          if (results.length > 0 && !scannedRef.current) {
            scannedRef.current = true;
            stopCamera();
            onScan(results[0].rawValue);
            return;
          }
        } catch { /* ignore frame errors */ }
      }
      rafRef.current = requestAnimationFrame(scan);
    };
    rafRef.current = requestAnimationFrame(scan);
  }, [stopCamera, onScan]);

  const startZXingScan = useCallback(async () => {
    if (!window.ZXing || !videoRef.current) return;
    const reader = new window.ZXing.BrowserMultiFormatReader();
    zxingReaderRef.current = reader;
    await reader.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
      if (result && !scannedRef.current) {
        scannedRef.current = true;
        stopCamera();
        onScan(result.getText());
      }
      if (err && !(err instanceof Error && err.message?.includes('No MultiFormat'))) {
        // ignore normal "no barcode found" errors from ZXing
      }
    });
  }, [stopCamera, onScan]);

  const startScan = useCallback(async () => {
    setScanState('starting');
    setErrorMsg('');
    scannedRef.current = false;

    try {
      // ตรวจ engine ที่ใช้ได้
      if (window.BarcodeDetector) {
        engineRef.current = 'native';
        try {
          const BD = window.BarcodeDetector as unknown as { getSupportedFormats?: () => Promise<string[]> };
          const supported = await BD.getSupportedFormats?.() ?? BARCODE_FORMATS;
          const formats = BARCODE_FORMATS.filter(f => supported.includes(f));
          nativeDetectorRef.current = new window.BarcodeDetector({ formats: formats.length ? formats : BARCODE_FORMATS });
        } catch {
          nativeDetectorRef.current = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
        }
      } else {
        // Fallback: โหลด ZXing จาก CDN
        engineRef.current = 'zxing';
        await loadZXing();
      }

      await openCamera();
      setScanState('scanning');

      if (engineRef.current === 'native') {
        startNativeScan();
      } else {
        await startZXingScan();
      }
    } catch (err: unknown) {
      setScanState('error');
      setErrorMsg(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  }, [openCamera, startNativeScan, startZXingScan]);

  useEffect(() => {
    startScan();
    return () => stopCamera();
  }, [startScan, stopCamera]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  return (
    <div className="camera-scanner-overlay" onClick={handleClose}>
      <div className="camera-scanner-panel" onClick={e => e.stopPropagation()}>
        <div className="camera-scanner-header">
          <div className="camera-scanner-title">
            <Camera size={18} strokeWidth={2} aria-hidden />
            <span>สแกน Barcode</span>
          </div>
          <button className="camera-scanner-close" onClick={handleClose} aria-label="ปิด">
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="camera-scanner-viewfinder">
          <video ref={videoRef} className="camera-scanner-video" playsInline muted autoPlay />

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
