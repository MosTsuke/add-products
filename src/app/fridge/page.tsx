'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefrigeratorIcon, Settings, RotateCcw, Minus, Plus, X, ClipboardList, LayoutGrid, Sparkles, Check,
  ChevronLeft, ChevronRight, Rows3, GalleryHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import ConfirmDialog from '@/components/ConfirmDialog';
import { FridgeShapeIcon, nameColor } from '@/components/FridgeShapeIcon';
import {
  getFridgeConfig, getFridgeLayout, FridgeConfig, RestockItem,
} from '@/lib/fridgeStorage';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';

type ViewMode = 'text' | 'visual';
type LayoutMode = 'scroll' | 'slide';

/** กดค้างเปิดกรอกจำนวน — สั้นพอแยกจากกดครั้งเดียว (+1) */
const LONG_PRESS_MS = 1000;

function stockLevelClass(pct: number | null, block: 'fridge-slot' | 'fridge-restock-item'): string {
  if (pct == null) return '';
  if (pct > 0.5) return ` ${block}--stock-ok`;
  if (pct > 0.2) return ` ${block}--stock-low`;
  return ` ${block}--stock-critical`;
}

export default function FridgePage() {
  const [config, setConfig] = useState<FridgeConfig>({ doors: [] });
  const [layout, setLayout] = useState<ReturnType<typeof getFridgeLayout>>({});
  const [restock, setRestock] = useState<RestockItem[]>([]);
  const [showList, setShowList] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('text');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('scroll');
  const [activeDoor, setActiveDoor] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const swipeRef = useRef<{ startX: number; startY: number } | null>(null);
  const [qtyModal, setQtyModal] = useState<{
    slotKey: string;
    doorId: string;
    doorName: string;
    shelfId: string;
    shelfName: string;
    slotIndex: number;
    productName: string;
    parLevel: number | null;
    qtyInput: string;
  } | null>(null);

  const qtyInputRef = useRef<HTMLInputElement>(null);
  const [holdingSlotKey, setHoldingSlotKey] = useState<string | null>(null);
  const slotPressRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; longPress: boolean }>({
    timer: null,
    longPress: false,
  });

  useEffect(() => {
    setConfig(getFridgeConfig());
    setLayout(getFridgeLayout());
    const saved = localStorage.getItem('fridge_view_mode');
    if (saved === 'visual') setViewMode('visual');
    const savedLayout = localStorage.getItem('fridge_layout_mode');
    if (savedLayout === 'slide') setLayoutMode('slide');
  }, []);

  useEffect(() => {
    if (!qtyModal) return;
    const t = window.setTimeout(() => {
      const el = qtyInputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    }, 80);
    return () => window.clearTimeout(t);
  }, [qtyModal?.slotKey]);

  const toggleView = () => {
    const next: ViewMode = viewMode === 'text' ? 'visual' : 'text';
    setViewMode(next);
    localStorage.setItem('fridge_view_mode', next);
  };

  const toggleLayout = () => {
    const next: LayoutMode = layoutMode === 'scroll' ? 'slide' : 'scroll';
    setLayoutMode(next);
    setActiveDoor(0);
    localStorage.setItem('fridge_layout_mode', next);
  };

  const prevDoor = () => setActiveDoor(i => Math.max(0, i - 1));
  const nextDoor = (total: number) => setActiveDoor(i => Math.min(total - 1, i + 1));

  const onSwipeTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeRef.current = { startX: t.clientX, startY: t.clientY };
  };
  const onSwipeTouchEnd = (e: React.TouchEvent, total: number) => {
    if (!swipeRef.current) return;
    const dx = e.changedTouches[0].clientX - swipeRef.current.startX;
    const dy = e.changedTouches[0].clientY - swipeRef.current.startY;
    swipeRef.current = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) nextDoor(total);
    else prevDoor();
  };

  const pendingRestockLines = useMemo(
    () => restock.filter(r => !r.checked).length,
    [restock],
  );
  const sortedRestock = useMemo(
    () => [...restock].sort((a, b) => Number(!!a.checked) - Number(!!b.checked)),
    [restock],
  );

  useBodyScrollLock(showList || !!qtyModal);

  const clearSlotPress = () => {
    if (slotPressRef.current.timer) clearTimeout(slotPressRef.current.timer);
    slotPressRef.current.timer = null;
  };

  const addOneToRestock = (
    doorId: string,
    doorName: string,
    shelfId: string,
    shelfName: string,
    slotIndex: number
  ) => {
    const key = `${doorId}__${shelfId}__${slotIndex}`;
    const item = layout[key];
    if (!item) return;

    setRestock(prev => {
      const existing = prev.findIndex(r => r.slotKey === key);
      if (existing >= 0) {
        if (prev[existing].checked) return prev;
        const next = [...prev];
        next[existing] = { ...next[existing], count: next[existing].count + 1 };
        return next;
      }
      return [
        ...prev,
        { slotKey: key, doorId, doorName, shelfId, shelfName, slotIndex, productName: item.name, count: 1 },
      ];
    });
  };

  const openQtyModal = (
    doorId: string,
    doorName: string,
    shelfId: string,
    shelfName: string,
    slotIndex: number
  ) => {
    const key = `${doorId}__${shelfId}__${slotIndex}`;
    const item = layout[key];
    if (!item) return;

    const inList = restock.find(r => r.slotKey === key);
    if (inList?.checked) return;
    const currentQty = inList?.count ?? 0;

    setQtyModal({
      slotKey: key,
      doorId,
      doorName,
      shelfId,
      shelfName,
      slotIndex,
      productName: item.name,
      parLevel: item.quantity ?? null,
      qtyInput: currentQty > 0 ? String(currentQty) : '',
    });
  };

  const confirmQtyModal = () => {
    if (!qtyModal) return;
    const qty = Math.max(1, Math.min(999, parseInt(qtyModal.qtyInput, 10) || 1));
    const { slotKey, doorId, doorName, shelfId, shelfName, slotIndex, productName } = qtyModal;

    setRestock(prev => {
      const existing = prev.findIndex(r => r.slotKey === slotKey);
      if (existing >= 0) {
        if (prev[existing].checked) return prev;
        const next = [...prev];
        next[existing] = { ...next[existing], count: qty };
        return next;
      }
      return [
        ...prev,
        { slotKey, doorId, doorName, shelfId, shelfName, slotIndex, productName, count: qty },
      ];
    });
    setQtyModal(null);
  };

  const endSlotPress = () => {
    clearSlotPress();
    setHoldingSlotKey(null);
  };

  const handleSlotPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    doorId: string,
    doorName: string,
    shelfId: string,
    shelfName: string,
    slotIndex: number
  ) => {
    const key = `${doorId}__${shelfId}__${slotIndex}`;
    if (!layout[key]) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    endSlotPress();
    slotPressRef.current.longPress = false;
    setHoldingSlotKey(key);

    slotPressRef.current.timer = setTimeout(() => {
      slotPressRef.current.longPress = true;
      setHoldingSlotKey(null);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40);
      openQtyModal(doorId, doorName, shelfId, shelfName, slotIndex);
    }, LONG_PRESS_MS);
  };

  const handleSlotPointerUp = (
    e: React.PointerEvent<HTMLButtonElement>,
    doorId: string,
    doorName: string,
    shelfId: string,
    shelfName: string,
    slotIndex: number
  ) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const wasLong = slotPressRef.current.longPress;
    endSlotPress();
    if (!wasLong) addOneToRestock(doorId, doorName, shelfId, shelfName, slotIndex);
  };

  const handleSlotPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    endSlotPress();
    slotPressRef.current.longPress = false;
  };

  const adjustCount = (slotKey: string, delta: number) => {
    setRestock(prev => {
      const item = prev.find(r => r.slotKey === slotKey);
      if (item?.checked) return prev;
      const next = prev.map(r => r.slotKey === slotKey ? { ...r, count: r.count + delta } : r).filter(r => r.count > 0);
      return next;
    });
  };

  const clearRestock = () => setRestock([]);

  const toggleRestockChecked = (slotKey: string) => {
    setRestock(prev =>
      prev.map(r => (r.slotKey === slotKey ? { ...r, checked: !r.checked } : r)),
    );
  };

  /** Shared door content used in both scroll and slide modes */
  const renderDoor = (door: FridgeConfig['doors'][number]) => (
    <>
      <div className="fridge-door-header">
        <div className="fridge-door-header-inner">
          <RefrigeratorIcon size={15} strokeWidth={2.5} />
          <span>{door.name}</span>
        </div>
        <div className="fridge-door-handle" aria-hidden />
      </div>
      <div className="fridge-door-body">
        <div className="fridge-door-shelves">
          {door.shelves.map(shelf => (
            <div key={shelf.id} className="fridge-shelf">
              <div className="fridge-shelf-label">{shelf.name}</div>
              <div
                className={`fridge-shelf-slots${viewMode === 'visual' ? ' fridge-shelf-slots--visual' : ''}`}
                style={{ gridTemplateColumns: `repeat(${shelf.slots}, 1fr)` }}
              >
                {Array.from({ length: shelf.slots }).map((_, si) => {
                  const key = `${door.id}__${shelf.id}__${si}`;
                  const item = layout[key];
                  const restockItem = restock.find(r => r.slotKey === key);
                  const color = item ? nameColor(item.name) : '#ccc';
                  const taken = restockItem?.count ?? 0;
                  const remaining = item?.quantity != null ? Math.max(0, item.quantity - taken) : null;
                  const stockPct = remaining != null && item?.quantity ? remaining / item.quantity : null;
                  const stockClass = stockLevelClass(stockPct, 'fridge-slot');
                  return (
                    <button
                      key={si}
                      type="button"
                      className={`fridge-slot ${item ? 'fridge-slot--filled' : 'fridge-slot--empty'}${restockItem ? ' fridge-slot--queued' : ''}${viewMode === 'visual' ? ' fridge-slot--visual' : ''}${holdingSlotKey === key ? ' fridge-slot--holding' : ''}${stockClass}`}
                      disabled={!item}
                      onPointerDown={e => handleSlotPointerDown(e, door.id, door.name, shelf.id, shelf.name, si)}
                      onPointerUp={e => handleSlotPointerUp(e, door.id, door.name, shelf.id, shelf.name, si)}
                      onPointerCancel={handleSlotPointerCancel}
                      onContextMenu={e => item && e.preventDefault()}
                      title={
                        item
                          ? `${item.name}${remaining != null ? ` — เหลือ ${remaining}/${item.quantity}` : ''} · กด +1 · ค้าง ~1 วิ กรอกจำนวน`
                          : 'ว่าง'
                      }
                      style={{
                        ...(holdingSlotKey === key
                          ? { ['--hold-duration' as string]: `${LONG_PRESS_MS}ms` }
                          : {}),
                        ...(viewMode === 'visual' && item
                          ? { borderColor: color + '60', background: color + '14' }
                          : {}),
                      }}
                    >
                      {viewMode === 'visual' && item ? (
                        <>
                          {restockItem && (
                            <span className="fridge-slot-count fridge-slot-count--visual">
                              {restockItem.count}
                            </span>
                          )}
                          <div className="fridge-slot-icon">
                            {item.shape ? (
                              <FridgeShapeIcon shape={item.shape} color={color} />
                            ) : (
                              <svg viewBox="0 0 40 60" fill="none" width="100%" height="100%">
                                <rect x="8" y="8" width="24" height="44" rx="8" fill={color} opacity="0.7" />
                              </svg>
                            )}
                          </div>
                          <span className="fridge-slot-name fridge-slot-name--visual">{item.name}</span>
                          {remaining != null && (
                            <span className="fridge-slot-stock-badge">{remaining}/{item.quantity}</span>
                          )}
                        </>
                      ) : (
                        <>
                          {restockItem && (
                            <span className="fridge-slot-count">{restockItem.count}</span>
                          )}
                          <span className="fridge-slot-name">{item?.name ?? ''}</span>
                          {remaining != null && (
                            <span className="fridge-slot-stock-text">{remaining}/{item!.quantity}</span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <>
      <Navbar />
      <div className="home-page-bg">
        <div className="container home-page">
          <header className="home-hero">
            <div className="home-hero-text">
              <span className="home-hero-eyebrow">ตู้เย็น</span>
              <h1>จัดการตู้เย็น</h1>
              <p>กดครั้งเดียว +1 ชิ้น · กดค้าง ~1 วินาที กรอกจำนวน</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`home-btn home-btn--ghost fridge-restock-toggle${restock.length > 0 ? ' fridge-restock-toggle--has' : ''}`}
                onClick={() => setShowList(v => !v)}
              >
                <ClipboardList size={16} />
                รายการเติม
                {pendingRestockLines > 0 && <span className="fridge-restock-badge">{pendingRestockLines}</span>}
              </button>
              <button
                type="button"
                className={`home-btn home-btn--ghost fridge-view-toggle${viewMode === 'visual' ? ' fridge-view-toggle--active' : ''}`}
                onClick={toggleView}
                title={viewMode === 'text' ? 'สลับเป็นโหมดรูป' : 'สลับเป็นโหมดข้อความ'}
              >
                {viewMode === 'text' ? <Sparkles size={15} /> : <LayoutGrid size={15} />}
                {viewMode === 'text' ? 'โหมดรูป' : 'โหมดข้อความ'}
              </button>
              <button
                type="button"
                className={`home-btn home-btn--ghost fridge-view-toggle${layoutMode === 'slide' ? ' fridge-view-toggle--active' : ''}`}
                onClick={toggleLayout}
                title={layoutMode === 'scroll' ? 'สลับเป็นโหมดสไลด์' : 'สลับเป็นโหมดเลื่อนลง'}
              >
                {layoutMode === 'scroll' ? <GalleryHorizontal size={15} /> : <Rows3 size={15} />}
                {layoutMode === 'scroll' ? 'สไลด์' : 'เลื่อนลง'}
              </button>
              <Link href="/fridge/settings" className="home-btn home-btn--ghost">
                <Settings size={15} /> ตั้งค่า
              </Link>
            </div>
          </header>

          {config.doors.length === 0 ? (
            <div className="fridge-empty-state home-card">
              <RefrigeratorIcon size={48} strokeWidth={1.25} color="#ccc" />
              <p>ยังไม่ได้ตั้งค่าตู้เย็น</p>
              <Link href="/fridge/settings" className="home-btn home-btn--primary">
                <Settings size={15} /> ไปตั้งค่า
              </Link>
            </div>
          ) : layoutMode === 'slide' ? (
            /* ── Carousel / Slide mode ── */
            <div
              className="fridge-carousel"
              onTouchStart={onSwipeTouchStart}
              onTouchEnd={e => onSwipeTouchEnd(e, config.doors.length)}
            >
              <div className="fridge-carousel-header">
                <button
                  type="button"
                  className="fridge-carousel-arrow"
                  onClick={prevDoor}
                  disabled={activeDoor === 0}
                  aria-label="ประตูก่อนหน้า"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="fridge-carousel-dots">
                  {config.doors.map((d, i) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`fridge-carousel-dot${i === activeDoor ? ' fridge-carousel-dot--active' : ''}`}
                      onClick={() => setActiveDoor(i)}
                      aria-label={d.name}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="fridge-carousel-arrow"
                  onClick={() => nextDoor(config.doors.length)}
                  disabled={activeDoor === config.doors.length - 1}
                  aria-label="ประตูถัดไป"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="fridge-carousel-stage">
                {config.doors.map((door, di) => (
                  <div
                    key={door.id}
                    className={`fridge-door fridge-carousel-item${di === activeDoor ? ' fridge-carousel-item--active' : di < activeDoor ? ' fridge-carousel-item--prev' : ' fridge-carousel-item--next'}`}
                    aria-hidden={di !== activeDoor}
                  >
                    {renderDoor(door)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ── Scroll mode ── */
            <div
              className="fridge-doors-grid"
              style={{ gridTemplateColumns: `repeat(${config.doors.length}, 1fr)` }}
            >
              {config.doors.map(door => (
                <div key={door.id} className="fridge-door">
                  {renderDoor(door)}
                </div>
              ))}
            </div>
          )}

          {/* Qty modal */}
          {qtyModal && (
            <div className="fridge-modal-backdrop" onClick={() => setQtyModal(null)}>
              <div className="fridge-modal fridge-qty-modal" onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="fridge-qty-title">
                <div className="fridge-modal-header">
                  <h3 id="fridge-qty-title">เติมสินค้า</h3>
                  <button type="button" className="fridge-modal-close" onClick={() => setQtyModal(null)} aria-label="ปิด">
                    <X size={18} />
                  </button>
                </div>
                <div className="fridge-modal-body">
                  <p className="fridge-qty-product">{qtyModal.productName}</p>
                  <p className="fridge-qty-pos">
                    {qtyModal.doorName} · {qtyModal.shelfName}
                  </p>
                  {qtyModal.parLevel != null && (
                    <p className="fridge-qty-hint">เป้าหมายในตู้ {qtyModal.parLevel} ชิ้น</p>
                  )}
                  <label className="fridge-qty-label" htmlFor="fridge-qty-input">
                    จำนวนในรายการเติม
                  </label>
                  <input
                    ref={qtyInputRef}
                    id="fridge-qty-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className="fridge-qty-input"
                    placeholder="เช่น 3"
                    value={qtyModal.qtyInput}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
                      setQtyModal(prev => (prev ? { ...prev, qtyInput: digits } : prev));
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        confirmQtyModal();
                      }
                    }}
                  />
                </div>
                <div className="fridge-modal-footer">
                  <button type="button" className="home-btn home-btn--ghost" onClick={() => setQtyModal(null)}>
                    ยกเลิก
                  </button>
                  <button type="button" className="home-btn home-btn--primary" onClick={confirmQtyModal}>
                    บันทึก
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Confirm clear */}
          {confirmClear && (
            <ConfirmDialog
              message="ล้างรายการเติมทั้งหมด?"
              confirmLabel="ล้างเลย"
              danger
              onConfirm={() => { clearRestock(); setConfirmClear(false); }}
              onCancel={() => setConfirmClear(false)}
            />
          )}

          {/* Restock panel */}
          {showList && (
            <div className="fridge-restock-overlay" onClick={() => setShowList(false)}>
              <div className="fridge-restock-panel" onClick={e => e.stopPropagation()}>
                <div className="fridge-restock-panel-header">
                  <h3>
                    รายการเติม{' '}
                    <span className="fridge-restock-panel-count">
                      {pendingRestockLines > 0 ? `${pendingRestockLines} รายการ` : 'เสร็จแล้ว'}
                    </span>
                  </h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {restock.length > 0 && (
                      <button type="button" className="home-btn home-btn--ghost" style={{ color: '#ef4444', padding: '6px 10px' }} onClick={() => setConfirmClear(true)}>
                        <RotateCcw size={14} /> เคลียร์
                      </button>
                    )}
                    <button type="button" className="fridge-modal-close" onClick={() => setShowList(false)}><X size={18} /></button>
                  </div>
                </div>

                {restock.length === 0 ? (
                  <div className="fridge-restock-empty">
                    <ClipboardList size={36} strokeWidth={1.25} color="#ccc" />
                    <p>ยังไม่มีรายการ — กดสินค้าในตู้ (+1) หรือกดค้าง ~1 วินาที</p>
                  </div>
                ) : (
                  <div className="fridge-restock-list">
                    {sortedRestock.map(item => {
                      const slotItem = layout[item.slotKey];
                      const remaining = slotItem?.quantity != null ? Math.max(0, slotItem.quantity - item.count) : null;
                      const stockPct = remaining != null && slotItem?.quantity ? remaining / slotItem.quantity : null;
                      return (
                        <div
                          key={item.slotKey}
                          className={`fridge-restock-item${item.checked ? ' fridge-restock-item--done' : ''}${stockLevelClass(stockPct, 'fridge-restock-item')}`}
                        >
                          <button
                            type="button"
                            className={`fridge-restock-check${item.checked ? ' fridge-restock-check--done' : ''}`}
                            onClick={() => toggleRestockChecked(item.slotKey)}
                            aria-label={item.checked ? 'ยกเลิกเช็คแล้ว' : 'เช็คว่าทำแล้ว'}
                            aria-pressed={!!item.checked}
                          >
                            <Check size={16} strokeWidth={2.5} />
                          </button>
                          <div className="fridge-restock-item-info">
                            <span className="fridge-restock-item-pos">{item.doorName} · {item.shelfName}</span>
                            <span className="fridge-restock-item-name">{item.productName}</span>
                            {remaining != null && (
                              <span className="fridge-restock-item-remaining">เหลือในตู้ {remaining}/{slotItem!.quantity}</span>
                            )}
                          </div>
                          <div className={`fridge-restock-item-controls${item.checked ? ' fridge-restock-item-controls--locked' : ''}`}>
                            <button
                              type="button"
                              className="fridge-count-btn"
                              disabled={item.checked}
                              onClick={() => adjustCount(item.slotKey, -1)}
                            >
                              <Minus size={13} />
                            </button>
                            <span className="fridge-count-val">{item.count}</span>
                            <button
                              type="button"
                              className="fridge-count-btn"
                              disabled={item.checked}
                              onClick={() => adjustCount(item.slotKey, 1)}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

    </>
  );
}
