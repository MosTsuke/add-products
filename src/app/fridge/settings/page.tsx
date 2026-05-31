'use client';
import { useEffect, useRef, useState, DragEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, GripVertical,
  Plus, Save, Trash2, Upload, X, RefrigeratorIcon,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import ConfirmDialog from '@/components/ConfirmDialog';
import { SHAPES, FridgeShapeIcon, nameColor, SlotShape } from '@/components/FridgeShapeIcon';
import {
  getFridgeConfig, saveFridgeConfig, getFridgeLayout, saveFridgeLayout,
  FridgeConfig, FridgeDoor, FridgeShelf, defaultFridgeConfig,
} from '@/lib/fridgeStorage';
import { exportFridgeLayout, exportFridgeConfig, importFridgeLayout } from '@/lib/fridgeExcel';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { fetchOptions } from '@/lib/supabase';

function uid() { return Math.random().toString(36).slice(2, 8); }

// ── SlotAssignModal ─────────────────────────────────────────
function SlotAssignModal({
  current,
  products,
  onSave,
  onClear,
  onClose,
}: {
  current: { name: string; barcode?: string; category?: string; shape?: SlotShape; quantity?: number } | null;
  products: { name: string; category: string }[];
  onSave: (name: string, category: string, shape: SlotShape | undefined, quantity: number | undefined) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(current?.name ?? '');
  const [cat, setCat] = useState(current?.category ?? '');
  const [shape, setShape] = useState<SlotShape | undefined>(current?.shape);
  const [quantity, setQuantity] = useState<string>(current?.quantity ? String(current.quantity) : '');
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || p.category.toLowerCase().includes(query.toLowerCase()))
    : products;

  const previewColor = name ? nameColor(name) : '#a0aec0';

  return (
    <div className="fridge-modal-backdrop" onClick={onClose}>
      <div className="fridge-modal" onClick={e => e.stopPropagation()}>
        <div className="fridge-modal-header">
          <h3>กำหนดสินค้าในช่อง</h3>
          <button className="fridge-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="fridge-modal-body">
          <div className="field">
            <label>ชื่อสินค้า</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="พิมพ์ชื่อสินค้า…" autoFocus />
          </div>
          <div className="field">
            <label>หมวดหมู่</label>
            <input type="text" value={cat} onChange={e => setCat(e.target.value)} placeholder="เช่น เครื่องดื่ม" />
          </div>
          <div className="field">
            <label>จำนวนเต็มช่อง (par)</label>
            <input
              type="number"
              min={1}
              max={999}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="เช่น 10"
            />
          </div>

          {/* Shape picker */}
          <div className="field">
            <label>รูปแบบ</label>
            <div className="fridge-shape-picker">
              {SHAPES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`fridge-shape-btn${shape === s.id ? ' fridge-shape-btn--active' : ''}`}
                  onClick={() => setShape(shape === s.id ? undefined : s.id)}
                  title={s.label}
                >
                  <div className="fridge-shape-btn-icon">
                    <s.Icon color={shape === s.id ? previewColor : '#c0c0c0'} />
                  </div>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {products.length > 0 && (
            <div className="fridge-product-picker">
              <div className="fridge-product-picker-search">
                <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาจากสินค้าในระบบ…" />
              </div>
              <div className="fridge-product-picker-list">
                {filtered.slice(0, 30).map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    className="fridge-product-picker-item"
                    onClick={() => { setName(p.name); setCat(p.category); }}
                  >
                    <span className="fridge-product-picker-cat">{p.category}</span>
                    <span>{p.name}</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="fridge-product-picker-empty">ไม่พบสินค้า</p>}
              </div>
            </div>
          )}
        </div>

        <div className="fridge-modal-footer">
          {current && (
            <button type="button" className="home-btn home-btn--ghost" onClick={onClear} style={{ color: '#ef4444' }}>
              <Trash2 size={15} /> ล้างช่อง
            </button>
          )}
          <button type="button" className="home-btn home-btn--ghost" onClick={onClose}>ยกเลิก</button>
          <button type="button" className="home-btn home-btn--primary" onClick={() => onSave(name.trim(), cat.trim(), shape, quantity ? parseInt(quantity) : undefined)} disabled={!name.trim()}>
            <Save size={15} /> บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────
export default function FridgeSettings() {
  const [config, setConfig] = useState<FridgeConfig>(() => ({ doors: [] }));
  const [layout, setLayout] = useState<ReturnType<typeof getFridgeLayout>>({});
  const [products, setProducts] = useState<{ name: string; category: string }[]>([]);
  const [toast, setToast] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRemoveDoorId, setConfirmRemoveDoorId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ doorId: string; shelfId: string; slotIndex: number } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // Drag state
  const dragDoor = useRef<number | null>(null);
  const dragShelf = useRef<{ doorId: string; idx: number } | null>(null);
  const dragSlot = useRef<string | null>(null);
  const [dragOverDoor, setDragOverDoor] = useState<number | null>(null);
  const [dragOverShelf, setDragOverShelf] = useState<{ doorId: string; idx: number } | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  useEffect(() => {
    setConfig(getFridgeConfig());
    setLayout(getFridgeLayout());
    // โหลดสินค้าจาก queue localStorage
    try {
      const q = JSON.parse(localStorage.getItem('pos_queue') ?? '[]');
      setProducts(q.map((item: { nameTH?: string; category?: string }) => ({ name: item.nameTH ?? '', category: item.category ?? '' })).filter((p: { name: string }) => p.name));
    } catch { /* ignore */ }
    // โหลด categories เพิ่มเติม
    fetchOptions('category').catch(() => {});
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useBodyScrollLock(!!assignTarget);

  const saveConfig = (next: FridgeConfig) => { setConfig(next); saveFridgeConfig(next); };
  const saveLayout = (next: ReturnType<typeof getFridgeLayout>) => { setLayout(next); saveFridgeLayout(next); };

  // Door operations
  const addDoor = () => {
    const id = `d${uid()}`;
    saveConfig({ doors: [...config.doors, { id, name: `ประตู ${config.doors.length + 1}`, shelves: [] }] });
  };
  const updateDoor = (doorId: string, name: string) => {
    saveConfig({ doors: config.doors.map(d => d.id === doorId ? { ...d, name } : d) });
  };
  const removeDoor = (doorId: string) => {
    saveConfig({ doors: config.doors.filter(d => d.id !== doorId) });
    const next = { ...layout };
    for (const key of Object.keys(next)) {
      if (key.startsWith(`${doorId}__`)) delete next[key];
    }
    saveLayout(next);
  };
  const moveDoor = (idx: number, dir: -1 | 1) => {
    const arr = [...config.doors];
    const to = idx + dir;
    if (to < 0 || to >= arr.length) return;
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    saveConfig({ doors: arr });
  };

  // Shelf operations
  const addShelf = (doorId: string) => {
    const door = config.doors.find(d => d.id === doorId)!;
    const id = `${doorId}s${uid()}`;
    const shelf: FridgeShelf = { id, name: `ชั้น ${door.shelves.length + 1}`, slots: 6 };
    saveConfig({ doors: config.doors.map(d => d.id === doorId ? { ...d, shelves: [...d.shelves, shelf] } : d) });
  };
  const updateShelf = (doorId: string, shelfId: string, patch: Partial<FridgeShelf>) => {
    saveConfig({ doors: config.doors.map(d => d.id === doorId ? { ...d, shelves: d.shelves.map(s => s.id === shelfId ? { ...s, ...patch } : s) } : d) });
  };
  const removeShelf = (doorId: string, shelfId: string) => {
    saveConfig({ doors: config.doors.map(d => d.id === doorId ? { ...d, shelves: d.shelves.filter(s => s.id !== shelfId) } : d) });
  };

  // Slot assignment
  const getCurrentSlotItem = () => {
    if (!assignTarget) return null;
    const { doorId, shelfId, slotIndex } = assignTarget;
    return layout[`${doorId}__${shelfId}__${slotIndex}`] ?? null;
  };

  const handleSaveSlot = (name: string, category: string, shape: import('@/components/FridgeShapeIcon').SlotShape | undefined, quantity: number | undefined) => {
    if (!assignTarget) return;
    const { doorId, shelfId, slotIndex } = assignTarget;
    const item = name ? {
      name,
      category,
      ...(shape ? { shape } : {}),
      ...(quantity ? { quantity } : {}),
    } : null;
    const next = { ...layout, [`${doorId}__${shelfId}__${slotIndex}`]: item };
    saveLayout(next);
    setAssignTarget(null);
  };

  const handleClearSlot = () => {
    if (!assignTarget) return;
    const { doorId, shelfId, slotIndex } = assignTarget;
    const next = { ...layout };
    delete next[`${doorId}__${shelfId}__${slotIndex}`];
    saveLayout(next);
    setAssignTarget(null);
  };

  // Drag handlers — doors
  const onDoorDragStart = (e: DragEvent, idx: number) => {
    dragDoor.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDoorDragOver = (e: DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDoor(idx);
  };
  const onDoorDrop = (e: DragEvent, idx: number) => {
    e.preventDefault();
    const from = dragDoor.current;
    if (from === null || from === idx) { setDragOverDoor(null); return; }
    const arr = [...config.doors];
    const [item] = arr.splice(from, 1);
    arr.splice(idx, 0, item);
    saveConfig({ doors: arr });
    dragDoor.current = null;
    setDragOverDoor(null);
  };
  const onDoorDragEnd = () => { dragDoor.current = null; setDragOverDoor(null); };

  // Drag handlers — shelves
  const onShelfDragStart = (e: DragEvent, doorId: string, idx: number) => {
    dragShelf.current = { doorId, idx };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  };
  const onShelfDragOver = (e: DragEvent, doorId: string, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverShelf({ doorId, idx });
  };
  const onShelfDrop = (e: DragEvent, doorId: string, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const from = dragShelf.current;
    if (!from || from.doorId !== doorId || from.idx === idx) { setDragOverShelf(null); return; }
    const door = config.doors.find(d => d.id === doorId)!;
    const shelves = [...door.shelves];
    const [item] = shelves.splice(from.idx, 1);
    shelves.splice(idx, 0, item);
    saveConfig({ doors: config.doors.map(d => d.id === doorId ? { ...d, shelves } : d) });
    dragShelf.current = null;
    setDragOverShelf(null);
  };
  const onShelfDragEnd = () => { dragShelf.current = null; setDragOverShelf(null); }

  // Drag handlers — slots
  const onSlotDragStart = (e: DragEvent, key: string) => {
    dragSlot.current = key;
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  };
  const onSlotDragOver = (e: DragEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragSlot.current && dragSlot.current !== key) {
      e.dataTransfer.dropEffect = 'move';
      setDragOverSlot(key);
    }
  };
  const onSlotDrop = (e: DragEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const from = dragSlot.current;
    if (!from || from === key) { setDragOverSlot(null); return; }
    const next = { ...layout };
    const tmp = next[from] ?? null;
    next[from] = next[key] ?? null;
    next[key] = tmp;
    // clean up null entries
    if (!next[from]) delete next[from];
    if (!next[key]) delete next[key];
    saveLayout(next);
    dragSlot.current = null;
    setDragOverSlot(null);
  };
  const onSlotDragEnd = () => { dragSlot.current = null; setDragOverSlot(null); };;

  // Export / Import
  const handleExportLayout = () => {
    exportFridgeLayout(config, layout);
    showToast('Export layout แล้ว');
  };
  const handleExportConfig = () => {
    exportFridgeConfig(config);
    showToast('Export config แล้ว');
  };
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { layout: next, imported, skipped } = await importFridgeLayout(file, config);
      saveLayout({ ...layout, ...next });
      showToast(`Import แล้ว ${imported} slot${skipped > 0 ? ` (ข้าม ${skipped})` : ''}`);
    } catch {
      showToast('Import ไม่สำเร็จ — ตรวจสอบไฟล์');
    }
    e.target.value = '';
  };

  const doorPendingRemoval = confirmRemoveDoorId
    ? config.doors.find(d => d.id === confirmRemoveDoorId)
    : null;

  return (
    <>
      <Navbar />
      <div className="home-page-bg">
        <div className="container home-page">
          <header className="home-hero">
            <div className="home-hero-text">
              <span className="home-hero-eyebrow">ตู้เย็น</span>
              <h1>ตั้งค่าตู้เย็น</h1>
              <p>กำหนดประตู ชั้น และจำนวน Slot — กด Slot เพื่อ assign สินค้า</p>
            </div>
            <Link href="/fridge" className="home-btn home-btn--ghost">
              <ArrowLeft size={15} /> กลับหน้าตู้เย็น
            </Link>
          </header>

          {/* toolbar */}
          <div className="fridge-settings-toolbar">
            <button type="button" className="home-btn home-btn--ghost" onClick={addDoor}>
              <Plus size={15} /> เพิ่มประตู
            </button>
            <button type="button" className="home-btn home-btn--ghost" onClick={() => setConfirmReset(true)}>
              <RefrigeratorIcon size={15} /> รีเซ็ต
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button type="button" className="home-btn home-btn--ghost" onClick={handleExportConfig}>
                <Download size={15} /> Export config
              </button>
              <button type="button" className="home-btn home-btn--ghost" onClick={handleExportLayout}>
                <Download size={15} /> Export layout
              </button>
              <button type="button" className="home-btn home-btn--primary" onClick={() => importRef.current?.click()}>
                <Upload size={15} /> Import layout
              </button>
              <input ref={importRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: 'none' }} />
            </div>
          </div>

          {/* doors */}
          <div className="fridge-settings-doors">
            {config.doors.map((door, di) => (
              <div
                key={door.id}
                className={`fridge-settings-door${dragOverDoor === di ? ' fridge-drag-over' : ''}`}
                draggable
                onDragStart={e => onDoorDragStart(e, di)}
                onDragOver={e => onDoorDragOver(e, di)}
                onDrop={e => onDoorDrop(e, di)}
                onDragEnd={onDoorDragEnd}
              >
                {/* door header */}
                <div className="fridge-settings-door-header">
                  <GripVertical size={16} color="#ccc" style={{ cursor: 'grab', flexShrink: 0 }} />
                  <input
                    className="fridge-settings-door-name"
                    value={door.name}
                    onChange={e => updateDoor(door.id, e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    <button type="button" className="fridge-icon-btn fridge-icon-btn--danger" onClick={() => setConfirmRemoveDoorId(door.id)} title="ลบประตู"><Trash2 size={15} /></button>
                  </div>
                </div>

                {/* shelves */}
                <div className="fridge-settings-shelves">
                  {door.shelves.map((shelf, si) => (
                    <div
                      key={shelf.id}
                      className={`fridge-settings-shelf${dragOverShelf?.doorId === door.id && dragOverShelf?.idx === si ? ' fridge-drag-over' : ''}`}
                      draggable
                      onDragStart={e => onShelfDragStart(e, door.id, si)}
                      onDragOver={e => onShelfDragOver(e, door.id, si)}
                      onDrop={e => onShelfDrop(e, door.id, si)}
                      onDragEnd={onShelfDragEnd}
                    >
                      <div className="fridge-settings-shelf-header">
                        <GripVertical size={14} color="#ccc" style={{ cursor: 'grab', flexShrink: 0 }} />
                        <input
                          className="fridge-settings-shelf-name"
                          value={shelf.name}
                          onChange={e => updateShelf(door.id, shelf.id, { name: e.target.value })}
                        />
                        <label style={{ fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}>
                          Slot
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={shelf.slots}
                            onChange={e => updateShelf(door.id, shelf.id, { slots: Math.max(1, Math.min(12, parseInt(e.target.value) || 1)) })}
                            className="fridge-settings-slots-input"
                          />
                        </label>
                        <button type="button" className="fridge-icon-btn fridge-icon-btn--danger" onClick={() => removeShelf(door.id, shelf.id)}><X size={14} /></button>
                      </div>

                      {/* slot grid */}
                      <div className="fridge-settings-slot-row" style={{ gridTemplateColumns: `repeat(${shelf.slots}, 1fr)` }}>
                        {Array.from({ length: shelf.slots }).map((_, si) => {
                          const key = `${door.id}__${shelf.id}__${si}`;
                          const item = layout[key];
                          const isOver = dragOverSlot === key;
                          const isDragging = dragSlot.current === key;
                          return (
                            <button
                              key={si}
                              type="button"
                              draggable={!!item}
                              className={`fridge-slot${item ? ' fridge-slot--filled' : ''}${isOver ? ' fridge-slot--drop-target' : ''}${isDragging ? ' fridge-slot--dragging' : ''}`}
                              onClick={() => setAssignTarget({ doorId: door.id, shelfId: shelf.id, slotIndex: si })}
                              onDragStart={item ? e => onSlotDragStart(e, key) : undefined}
                              onDragOver={e => onSlotDragOver(e, key)}
                              onDrop={e => onSlotDrop(e, key)}
                              onDragEnd={onSlotDragEnd}
                              title={item?.name ?? 'ว่าง'}
                            >
                              {item ? (
                                <>
                                  {item.quantity && <span className="fridge-slot-qty">{item.quantity}</span>}
                                  <span className="fridge-slot-name">{item.name}</span>
                                </>
                              ) : (
                                <Plus size={12} color="#ccc" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <button type="button" className="fridge-add-shelf-btn" onClick={() => addShelf(door.id)}>
                    <Plus size={14} /> เพิ่มชั้น
                  </button>
                </div>
              </div>
            ))}

            {config.doors.length === 0 && (
              <div className="fridge-settings-empty">
                <RefrigeratorIcon size={48} strokeWidth={1.25} color="#ccc" />
                <p>ยังไม่มีประตูตู้เย็น — กด «เพิ่มประตู» เพื่อเริ่มต้น</p>
                <button type="button" className="home-btn home-btn--primary" onClick={() => { saveConfig(defaultFridgeConfig()); showToast('โหลดค่าเริ่มต้นแล้ว'); }}>
                  โหลดค่าเริ่มต้น (3 ประตู)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmReset && (
        <ConfirmDialog
          message="รีเซ็ตกลับเป็นค่าเริ่มต้น (3 ประตู)? การตั้งค่าและ layout ปัจจุบันจะหายทั้งหมด"
          confirmLabel="รีเซ็ตเลย"
          danger
          onConfirm={() => { saveConfig(defaultFridgeConfig()); showToast('รีเซ็ตเป็นค่าเริ่มต้นแล้ว'); setConfirmReset(false); }}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      {doorPendingRemoval && confirmRemoveDoorId && (
        <ConfirmDialog
          message={`ลบ "${doorPendingRemoval.name}"? ชั้นและสินค้าในประตูนี้จะถูกลบทั้งหมด`}
          confirmLabel="ลบประตู"
          danger
          onConfirm={() => {
            removeDoor(confirmRemoveDoorId);
            setConfirmRemoveDoorId(null);
            showToast(`ลบ ${doorPendingRemoval.name} แล้ว`);
          }}
          onCancel={() => setConfirmRemoveDoorId(null)}
        />
      )}

      {assignTarget && (
        <SlotAssignModal
          current={getCurrentSlotItem()}
          products={products}
          onSave={handleSaveSlot}
          onClear={handleClearSlot}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {toast && <div className="home-toast">{toast}</div>}
    </>
  );
}
