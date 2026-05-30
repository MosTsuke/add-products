'use client';
import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { countBarcodePrintStats } from '@/lib/barcodePrintSheet';
import { QueueItem } from '@/lib/storage';
import BarcodePrintModal from './BarcodePrintModal';

interface BarcodePrintPanelProps {
  items: QueueItem[];
  onOpenTable?: () => void;
}

export default function BarcodePrintPanel({ items, onOpenTable }: BarcodePrintPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const stats = countBarcodePrintStats(items);
  const hasPrintable = stats.generated + stats.otherBarcode > 0;

  return (
    <>
      <div className="home-barcode-panel">
        <p className="home-barcode-panel-desc">
          หัวกระดาษเป็นหมวดหมู่ · บนบาร์โค้ดเป็นชื่อสินค้า
        </p>

        {stats.total === 0 ? (
          <p className="home-barcode-panel-empty">ยังไม่มีรายการในคิว — Import หรือเพิ่มสินค้าก่อน</p>
        ) : (
          <>
            <ul className="home-barcode-panel-stats">
              <li>
                มี barcode สร้างใหม่ <strong>{stats.generated}</strong> รายการ
              </li>
              <li>
                ยังไม่มี barcode <strong>{stats.noBarcode}</strong> รายการ
              </li>
              {stats.otherBarcode > 0 && (
                <li className="home-barcode-panel-stats-muted">
                  barcode จากไฟล์ <strong>{stats.otherBarcode}</strong> รายการ — เลือกพิมพ์ได้ใน modal
                </li>
              )}
            </ul>

            {stats.noBarcode > 0 && (
              <p className="home-barcode-panel-warn">
                สร้างเลขรันใน{' '}
                {onOpenTable ? (
                  <button type="button" className="home-queue-summary-link" onClick={onOpenTable}>
                    แก้ไขในตาราง
                  </button>
                ) : (
                  'แก้ไขในตาราง'
                )}{' '}
                (กรอง &quot;ไม่มี barcode&quot; แล้วกด Gen)
              </p>
            )}

            <div className="home-barcode-panel-actions">
              <button
                type="button"
                className="home-btn home-btn--primary home-btn--sm"
                onClick={() => setModalOpen(true)}
                disabled={!hasPrintable}
                title={hasPrintable ? 'เลือกรายการแล้วพิมพ์ป้าย' : 'ยังไม่มีรายการที่มี barcode'}
              >
                <Settings2 size={14} strokeWidth={2} aria-hidden />
                จัดการ Barcode เพื่อพิมพ์
              </button>
            </div>

            {!hasPrintable && (
              <p className="home-barcode-panel-hint">
                ยังไม่มีรายการที่มีเลข barcode — Gen ในตารางก่อน
              </p>
            )}
          </>
        )}
      </div>

      {modalOpen && (
        <BarcodePrintModal
          items={items}
          onClose={() => setModalOpen(false)}
          onOpenTable={() => {
            setModalOpen(false);
            onOpenTable?.();
          }}
        />
      )}
    </>
  );
}
