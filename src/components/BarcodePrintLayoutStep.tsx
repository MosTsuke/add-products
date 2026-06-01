'use client';
import { useMemo, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Plus,
  Square,
  Trash2,
} from 'lucide-react';
import BarcodePrintGroupOrderModal from './BarcodePrintGroupOrderModal';
import {
  addBarcodePrintGroup,
  assignBarcodePrintItemToGroup,
  BarcodePrintLayout,
  moveBarcodePrintGroup,
  removeBarcodePrintGroup,
} from '@/lib/barcodePrintLayout';
import { QueueItem } from '@/lib/storage';

interface BarcodePrintLayoutStepProps {
  items: QueueItem[];
  layout: BarcodePrintLayout;
  onLayoutChange: (layout: BarcodePrintLayout) => void;
  showSortByPrice?: boolean;
  onSortByPrice?: () => void;
  onBack: () => void;
  onApply: () => void;
}

export default function BarcodePrintLayoutStep({
  items,
  layout,
  onLayoutChange,
  showSortByPrice = false,
  onSortByPrice,
  onBack,
  onApply,
}: BarcodePrintLayoutStepProps) {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set());
  const [bulkGroupId, setBulkGroupId] = useState<string>('');
  const [groupOrderOpen, setGroupOrderOpen] = useState(false);

  const updateGroupName = (groupId: string, name: string) => {
    onLayoutChange({
      ...layout,
      groups: layout.groups.map(g => (g.id === groupId ? { ...g, name } : g)),
    });
  };

  const assignItem = (itemId: string, groupId: string) => {
    onLayoutChange(assignBarcodePrintItemToGroup(layout, itemId, groupId));
  };

  const handleAddGroup = () => onLayoutChange(addBarcodePrintGroup(layout));

  const handleRemoveGroup = (groupId: string) => {
    const next = removeBarcodePrintGroup(layout, groupId);
    if (next) onLayoutChange(next);
  };

  const defaultGroupId = layout.groups[0]?.id ?? '';
  const selectedCount = selectedItemIds.size;
  const allSelected = useMemo(
    () => items.length > 0 && selectedItemIds.size === items.length,
    [items.length, selectedItemIds],
  );

  const toggleSelected = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAllSelected = (select: boolean) => {
    setSelectedItemIds(select ? new Set(items.map(i => i.id)) : new Set());
  };

  const applyBulkGroup = () => {
    const gid = bulkGroupId || defaultGroupId;
    if (!gid || selectedItemIds.size === 0) return;
    let next = layout;
    for (const id of selectedItemIds) next = assignBarcodePrintItemToGroup(next, id, gid);
    onLayoutChange(next);
    setSelectedItemIds(new Set());
  };

  return (
    <>
      <div className="barcode-print-layout-body">
        <p className="barcode-print-layout-intro">
          ตั้งชื่อกลุ่มที่จะแสดงเป็นหัวกระดาษแทนหมวดหมู่ แล้วเลือกว่าสินค้าแต่ละรายการอยู่กลุ่มไหน — ลำดับกลุ่มด้านบนคือลำดับบนหน้า A4
        </p>

        <section className="barcode-print-layout-section">
          <h3 className="barcode-print-layout-section-title">
            <LayoutGrid size={16} strokeWidth={2} aria-hidden />
            กลุ่มบนหน้ากระดาษ
          </h3>
          <ul className="barcode-print-layout-groups">
            {layout.groups.map((group, index) => (
              <li key={group.id} className="barcode-print-layout-group-row">
                <span className="barcode-print-layout-group-order">{index + 1}</span>
                <input
                  type="text"
                  className="barcode-print-layout-group-name"
                  value={group.name}
                  onChange={e => updateGroupName(group.id, e.target.value)}
                  placeholder="ชื่อกลุ่ม…"
                  aria-label={`ชื่อกลุ่ม ${index + 1}`}
                />
                <div className="barcode-print-layout-group-actions">
                  <button
                    type="button"
                    className="barcode-print-layout-icon-btn"
                    onClick={() => onLayoutChange(moveBarcodePrintGroup(layout, group.id, -1))}
                    disabled={index === 0}
                    aria-label="เลื่อนกลุ่มขึ้น"
                  >
                    <ChevronUp size={16} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="barcode-print-layout-icon-btn"
                    onClick={() => onLayoutChange(moveBarcodePrintGroup(layout, group.id, 1))}
                    disabled={index === layout.groups.length - 1}
                    aria-label="เลื่อนกลุ่มลง"
                  >
                    <ChevronDown size={16} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="barcode-print-layout-icon-btn barcode-print-layout-icon-btn--danger"
                    onClick={() => handleRemoveGroup(group.id)}
                    disabled={layout.groups.length <= 1}
                    aria-label="ลบกลุ่ม"
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="home-btn home-btn--ghost home-btn--sm barcode-print-layout-add-group"
            onClick={handleAddGroup}
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            เพิ่มกลุ่ม
          </button>
        </section>

        <section className="barcode-print-layout-section">
          <h3 className="barcode-print-layout-section-title">จัดสินค้าเข้ากลุ่ม</h3>
          <div className="barcode-print-layout-bulk">
            <button
              type="button"
              className="home-btn home-btn--ghost home-btn--sm"
              onClick={() => setAllSelected(!allSelected)}
              disabled={items.length === 0}
            >
              {allSelected ? <CheckSquare size={14} strokeWidth={2} aria-hidden /> : <Square size={14} strokeWidth={2} aria-hidden />}
              {allSelected ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}
            </button>
            <span className="barcode-print-layout-bulk-count">
              เลือก <strong>{selectedCount}</strong>/{items.length}
            </span>
            <div className="barcode-print-layout-bulk-right">
              {showSortByPrice && onSortByPrice && (
                <button
                  type="button"
                  className="home-btn home-btn--ghost home-btn--sm barcode-print-sort-price-btn"
                  onClick={onSortByPrice}
                  title="เรียงป้ายตามราคาใน barcode (น้อยไปมาก)"
                >
                  <ArrowDownWideNarrow size={14} strokeWidth={2} aria-hidden />
                  เรียงราคา
                </button>
              )}
              <button
                type="button"
                className="home-btn home-btn--ghost home-btn--sm barcode-print-layout-order-btn"
                onClick={() => setGroupOrderOpen(true)}
                disabled={items.length === 0 || layout.groups.length === 0}
              >
                จัดลำดับในกลุ่ม
              </button>
              <select
                className="barcode-print-layout-bulk-select"
                value={bulkGroupId || defaultGroupId}
                onChange={e => setBulkGroupId(e.target.value)}
                aria-label="เลือกกลุ่มสำหรับย้ายรายการที่ติ๊กไว้"
                disabled={layout.groups.length === 0}
              >
                {layout.groups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name.trim() || '(กลุ่มว่าง)'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="home-btn home-btn--primary home-btn--sm"
                onClick={applyBulkGroup}
                disabled={selectedCount === 0 || layout.groups.length === 0}
              >
                ย้าย
              </button>
            </div>
          </div>
          <ul className="barcode-print-layout-assign-list">
            {items.map(item => {
              const gid = layout.assignments[item.id] ?? defaultGroupId;
              const name = item.nameTH.trim() || '(ไม่มีชื่อ)';
              const cat = item.category.trim() || '(ไม่มีหมวดหมู่)';
              const checked = selectedItemIds.has(item.id);
              return (
                <li key={item.id} className={`barcode-print-layout-assign-row${checked ? ' is-selected' : ''}`}>
                  <label className="barcode-print-layout-assign-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelected(item.id)}
                      aria-label={`เลือก ${name}`}
                    />
                  </label>
                  <div className="barcode-print-layout-assign-info">
                    <span className="barcode-print-layout-assign-name" title={name}>
                      {name}
                    </span>
                    <span className="barcode-print-layout-assign-meta">
                      {cat} · {item.barcode.trim()}
                    </span>
                  </div>
                  <select
                    className="barcode-print-layout-assign-select"
                    value={gid}
                    onChange={e => assignItem(item.id, e.target.value)}
                    aria-label={`กลุ่มของ ${name}`}
                  >
                    {layout.groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name.trim() || '(กลุ่มว่าง)'}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {groupOrderOpen && (
        <BarcodePrintGroupOrderModal
          items={items}
          layout={layout}
          onChange={onLayoutChange}
          onClose={() => setGroupOrderOpen(false)}
        />
      )}

      <footer className="barcode-print-modal-footer">
        <p className="barcode-print-modal-footer-meta">
          <strong>{layout.groups.length}</strong> กลุ่ม · <strong>{items.length}</strong> ป้าย
        </p>
        <div className="barcode-print-modal-footer-actions">
          <button type="button" className="home-btn home-btn--ghost home-btn--sm" onClick={onBack}>
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            กลับตัวอย่าง A4
          </button>
          <button type="button" className="home-btn home-btn--primary home-btn--sm" onClick={onApply}>
            ใช้กับตัวอย่าง A4
          </button>
        </div>
      </footer>
    </>
  );
}
