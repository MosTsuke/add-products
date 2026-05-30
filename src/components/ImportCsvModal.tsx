'use client';
import { useMemo, useRef, useState } from 'react';
import { FileUp, Upload, X } from 'lucide-react';
import { downloadQueueTemplateExcel } from '@/lib/csvExport';
import {
  applyCsvImport,
  isExcelFile,
  parseCsvToQueueItems,
  parseXlsxArrayBuffer,
  type ParseImportResult,
} from '@/lib/csvImport';
import type { ImportApplyResult } from '@/lib/csvImport';
import { isManualQueueItem } from '@/lib/queueStatus';
import { QueueItem, storage } from '@/lib/storage';

interface ImportCsvModalProps {
  currentQueue: QueueItem[];
  onClose: () => void;
  onImport: (result: ImportApplyResult, fileName: string) => void;
}

export default function ImportCsvModal({
  currentQueue,
  onClose,
  onImport,
}: ImportCsvModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileLabel, setFileLabel] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ParseImportResult | null>(null);

  const importPlan = useMemo(() => {
    if (!preview) return null;
    return applyCsvImport(currentQueue, preview.items);
  }, [preview, currentQueue]);

  const applyPreview = (result: ParseImportResult) => {
    if (result.items.length === 0) {
      setError('ไม่พบรายการที่ใช้ได้ — ต้องมีชื่อสินค้า (Product Name TH) อย่างน้อย 1 แถว');
      setPreview(null);
      return;
    }
    setError('');
    setPreview(result);
  };

  const parseTextCsv = (raw: string) => {
    setError('');
    if (!raw.trim()) {
      setPreview(null);
      setFileLabel('');
      return;
    }
    try {
      applyPreview(parseCsvToQueueItems(raw));
      setFileLabel('วางข้อความตาราง');
    } catch {
      setError('อ่านข้อมูลไม่ได้ — ตรวจสอบรูปแบบคอลัมน์');
      setPreview(null);
    }
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setError('');
    setText('');

    try {
      if (isExcelFile(file)) {
        const buffer = await file.arrayBuffer();
        const result = parseXlsxArrayBuffer(buffer);
        applyPreview(result);
        setFileLabel(
          result.sheetName
            ? `${file.name} (ชีต: ${result.sheetName})`
            : file.name
        );
      } else {
        const content = await file.text();
        setText(content);
        const result = parseCsvToQueueItems(content);
        applyPreview(result);
        setFileLabel(file.name);
      }
    } catch {
      setError('อ่านไฟล์ไม่สำเร็จ — ตรวจสอบรูปแบบคอลัมน์');
      setPreview(null);
      setFileLabel('');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!importPlan || !preview) return;

    const name = fileLabel || 'ไฟล์ที่นำเข้า';
    const prevMaster = storage.getMasterImportName();
    const hasFileRows = currentQueue.some(i => !isManualQueueItem(i));

    if (prevMaster && hasFileRows) {
      const ok = window.confirm(
        `มีไฟล์หลัก «${prevMaster}» อยู่แล้ว\n\nนำเข้า «${name}» จะแทนที่รายการจากไฟล์เดิมในคิว\nรายการที่เพิ่มจากหน้าบ้าน (ใหม่) ยังอยู่ท้ายคิว`
      );
      if (!ok) return;
    }

    onImport(importPlan, name);
    onClose();
  };

  const manualInQueue = currentQueue.filter(isManualQueueItem).length;

  const downloadTemplate = () => {
    downloadQueueTemplateExcel();
  };

  return (
    <div className="import-csv-modal" role="dialog" aria-labelledby="import-csv-title">
      <div className="import-csv-backdrop" onClick={onClose} aria-hidden />
      <div className="import-csv-panel" onClick={e => e.stopPropagation()}>
        <header className="import-csv-header">
          <div className="import-csv-title">
            <FileUp size={22} strokeWidth={2} aria-hidden />
            <div>
              <h2 id="import-csv-title">Import Excel</h2>
              <p>ไฟล์หลัก POS ได้ไฟล์เดียว — นำเข้าซ้ำจะแทนที่รายการจากไฟล์เดิม · รายการจากหน้าบ้านอยู่ท้ายคิว</p>
            </div>
          </div>
          <button type="button" className="queue-table-view-close" onClick={onClose} aria-label="ปิด">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <div className="import-csv-body">
          <p className="import-csv-hint">
            เลือกไฟล์รายงานสินค้า (.xlsx) เป็นไฟล์หลัก — Cost, Vat, Qty ฯลฯ แสดงครบในตาราง · แก้เพิ่มที่{' '}
            <strong>แก้ไขในตาราง</strong>
            {manualInQueue > 0 && (
              <>
                {' '}
                · มี <strong>{manualInQueue}</strong> รายการจากหน้าบ้านจะคงอยู่ท้ายคิว
              </>
            )}
          </p>

          <div className="import-csv-upload">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="import-csv-file-input"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="import-csv-dropzone"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
            >
              <Upload size={28} strokeWidth={1.5} aria-hidden />
              <span>{loading ? 'กำลังอ่านไฟล์…' : 'เลือกไฟล์ Excel'}</span>
              <span className="import-csv-dropzone-sub">.xlsx · .xls</span>
            </button>
            <button type="button" className="home-btn home-btn--ghost home-btn--sm" onClick={downloadTemplate}>
              ดาวน์โหลด template Excel
            </button>
          </div>

          {fileLabel && !text && (
            <p className="import-csv-file-label">
              ไฟล์: <strong>{fileLabel}</strong>
            </p>
          )}

          <label className="import-csv-paste-label">หรือวางข้อมูลตาราง (ทางเลือก)</label>
          <textarea
            className="import-csv-textarea"
            value={text}
            onChange={e => {
              setText(e.target.value);
              setFileLabel('');
              parseTextCsv(e.target.value);
            }}
            placeholder={'วางข้อมูลตารางตรงๆ\nหรือใช้ไฟล์ .xlsx ด้านบน'}
            rows={5}
            disabled={loading}
          />

          {error && <p className="import-csv-error">{error}</p>}

          {preview && (
            <>
              <p className="import-csv-preview">
                พบ <strong>{preview.items.length}</strong> รายการใช้ได้
                {preview.skipped > 0 && ` (ข้าม ${preview.skipped} แถวว่าง)`}
                {preview.source === 'xlsx' && preview.sheetName && (
                  <span> · อ่านจากชีต «{preview.sheetName}»</span>
                )}
                {currentQueue.length > 0 && (
                  <span> · คิวเดิม {currentQueue.length} รายการ</span>
                )}
              </p>
              {importPlan && (
                <div className="import-csv-plan">
                  <span className="import-csv-plan-title">ผลหลังนำเข้า:</span>
                  {importPlan.stats.appended > 0 && (
                    <span className="queue-status-badge queue-status--unchanged">
                      ต่อท้าย {importPlan.stats.appended}
                    </span>
                  )}
                  <span className="queue-status-badge queue-status--updated">
                    อัปเดต {importPlan.stats.updated}
                  </span>
                  <span className="queue-status-badge queue-status--unchanged">
                    เดิม {importPlan.stats.unchanged}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="import-csv-footer">
          <button type="button" className="home-btn home-btn--ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="home-btn home-btn--primary"
            onClick={handleImport}
            disabled={!preview || loading}
          >
            <FileUp size={16} strokeWidth={2} aria-hidden />
            นำเข้า {preview ? preview.items.length : 0} รายการ
          </button>
        </footer>
      </div>
    </div>
  );
}
