'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, GripVertical, X } from 'lucide-react';
import { BarcodePrintLayout, setBarcodePrintGroupOrder, syncBarcodePrintLayout } from '@/lib/barcodePrintLayout';
import { QueueItem } from '@/lib/storage';

export default function BarcodePrintGroupOrderModal({
  items,
  layout,
  onChange,
  onClose,
}: {
  items: QueueItem[];
  layout: BarcodePrintLayout;
  onChange: (layout: BarcodePrintLayout) => void;
  onClose: () => void;
}) {
  const synced = useMemo(() => syncBarcodePrintLayout(layout, items.map(i => i.id)), [layout, items]);
  const [groupId, setGroupId] = useState(() => synced.groups[0]?.id ?? '');
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId && synced.groups[0]?.id) setGroupId(synced.groups[0].id);
  }, [groupId, synced.groups]);

  const byId = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const order = synced.orderByGroup[groupId] ?? [];

  const setOrder = (nextOrder: string[]) => {
    onChange(setBarcodePrintGroupOrder(synced, groupId, nextOrder));
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = order.indexOf(id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= order.length) return;
    const nextOrder = [...order];
    [nextOrder[idx], nextOrder[next]] = [nextOrder[next], nextOrder[idx]];
    setOrder(nextOrder);
  };

  const onDropAt = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = order.indexOf(dragId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const nextOrder = [...order];
    nextOrder.splice(from, 1);
    nextOrder.splice(to, 0, dragId);
    setOrder(nextOrder);
  };

  return (
    <div className="barcode-group-order-backdrop">
      <div className="barcode-group-order-modal" role="dialog" aria-label="จัดลำดับในกลุ่ม">
        <header className="barcode-group-order-header">
          <div className="barcode-group-order-title">
            <div>
              <h3>จัดลำดับในกลุ่ม</h3>
              <p>ลากเพื่อสลับตำแหน่ง หรือใช้ปุ่มขึ้น/ลง</p>
            </div>
          </div>
          <button type="button" className="fridge-modal-close" onClick={onClose} aria-label="ปิด">
            <X size={18} />
          </button>
        </header>

        <div className="barcode-group-order-toolbar">
          <label className="barcode-group-order-group">
            <span>เลือกกลุ่ม</span>
            <select value={groupId} onChange={e => setGroupId(e.target.value)} aria-label="เลือกกลุ่ม">
              {synced.groups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name.trim() || '(กลุ่มว่าง)'}
                </option>
              ))}
            </select>
          </label>
          <span className="barcode-group-order-count">
            {order.length} รายการ
          </span>
        </div>

        <ul className="barcode-group-order-list">
          {order.map((id, idx) => {
            const item = byId.get(id);
            const name = item?.nameTH?.trim() || '(ไม่มีชื่อ)';
            const barcode = item?.barcode?.trim() || '';
            return (
              <li
                key={id}
                className={`barcode-group-order-row${dragId === id ? ' is-dragging' : ''}`}
                draggable
                onDragStart={() => setDragId(id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => onDropAt(id)}
              >
                <span className="barcode-group-order-handle" aria-hidden>
                  <GripVertical size={16} strokeWidth={2} />
                </span>
                <div className="barcode-group-order-info">
                  <span className="barcode-group-order-name" title={name}>
                    {idx + 1}. {name}
                  </span>
                  <span className="barcode-group-order-meta">{barcode}</span>
                </div>
                <div className="barcode-group-order-actions">
                  <button
                    type="button"
                    className="barcode-group-order-icon-btn"
                    onClick={() => move(id, -1)}
                    disabled={idx === 0}
                    aria-label="เลื่อนขึ้น"
                  >
                    <ArrowUp size={16} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="barcode-group-order-icon-btn"
                    onClick={() => move(id, 1)}
                    disabled={idx === order.length - 1}
                    aria-label="เลื่อนลง"
                  >
                    <ArrowDown size={16} strokeWidth={2} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="barcode-group-order-footer">
          <button type="button" className="home-btn home-btn--primary" onClick={onClose}>
            เสร็จแล้ว
          </button>
        </footer>
      </div>
    </div>
  );
}

