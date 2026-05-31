'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  RefrigeratorIcon, Settings, RotateCcw, Minus, Plus, X, ClipboardList,
} from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  getFridgeConfig, getFridgeLayout, FridgeConfig, RestockItem,
} from '@/lib/fridgeStorage';

export default function FridgePage() {
  const [config, setConfig] = useState<FridgeConfig>({ doors: [] });
  const [layout, setLayout] = useState<ReturnType<typeof getFridgeLayout>>({});
  const [restock, setRestock] = useState<RestockItem[]>([]);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    setConfig(getFridgeConfig());
    setLayout(getFridgeLayout());
  }, []);

  const totalRestock = useMemo(() => restock.reduce((s, r) => s + r.count, 0), [restock]);

  const handleSlotClick = (doorId: string, doorName: string, shelfId: string, shelfName: string, slotIndex: number) => {
    const key = `${doorId}__${shelfId}__${slotIndex}`;
    const item = layout[key];
    if (!item) return;

    setRestock(prev => {
      const existing = prev.findIndex(r => r.slotKey === key);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], count: next[existing].count + 1 };
        return next;
      }
      return [...prev, { slotKey: key, doorId, doorName, shelfId, shelfName, slotIndex, productName: item.name, count: 1 }];
    });
  };

  const adjustCount = (slotKey: string, delta: number) => {
    setRestock(prev => {
      const next = prev.map(r => r.slotKey === slotKey ? { ...r, count: r.count + delta } : r).filter(r => r.count > 0);
      return next;
    });
  };

  const clearRestock = () => setRestock([]);

  return (
    <>
      <Navbar />
      <div className="home-page-bg">
        <div className="container home-page">
          <header className="home-hero">
            <div className="home-hero-text">
              <span className="home-hero-eyebrow">ตู้เย็น</span>
              <h1>จัดการตู้เย็น</h1>
              <p>กดสินค้าในตู้เพื่อเพิ่มเข้ารายการเติม</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className={`home-btn home-btn--ghost fridge-restock-toggle${restock.length > 0 ? ' fridge-restock-toggle--has' : ''}`}
                onClick={() => setShowList(v => !v)}
              >
                <ClipboardList size={16} />
                รายการเติม
                {restock.length > 0 && <span className="fridge-restock-badge">{totalRestock}</span>}
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
          ) : (
            <div className="fridge-doors-grid" style={{ gridTemplateColumns: `repeat(${config.doors.length}, 1fr)` }}>
              {config.doors.map(door => (
                <div key={door.id} className="fridge-door home-card">
                  <div className="fridge-door-header">
                    <RefrigeratorIcon size={16} strokeWidth={2} />
                    <span>{door.name}</span>
                  </div>
                  <div className="fridge-door-shelves">
                    {door.shelves.map(shelf => (
                      <div key={shelf.id} className="fridge-shelf">
                        <div className="fridge-shelf-label">{shelf.name}</div>
                        <div className="fridge-shelf-slots" style={{ gridTemplateColumns: `repeat(${shelf.slots}, 1fr)` }}>
                          {Array.from({ length: shelf.slots }).map((_, si) => {
                            const key = `${door.id}__${shelf.id}__${si}`;
                            const item = layout[key];
                            const restockItem = restock.find(r => r.slotKey === key);
                            return (
                              <button
                                key={si}
                                type="button"
                                className={`fridge-slot ${item ? 'fridge-slot--filled' : 'fridge-slot--empty'}${restockItem ? ' fridge-slot--queued' : ''}`}
                                onClick={() => handleSlotClick(door.id, door.name, shelf.id, shelf.name, si)}
                                disabled={!item}
                                title={item?.name ?? 'ว่าง'}
                              >
                                {restockItem && (
                                  <span className="fridge-slot-count">{restockItem.count}</span>
                                )}
                                <span className="fridge-slot-name">{item?.name ?? ''}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Restock panel */}
      {showList && (
        <div className="fridge-restock-overlay" onClick={() => setShowList(false)}>
          <div className="fridge-restock-panel" onClick={e => e.stopPropagation()}>
            <div className="fridge-restock-panel-header">
              <h3>รายการเติม <span className="fridge-restock-panel-count">{totalRestock} รายการ</span></h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {restock.length > 0 && (
                  <button type="button" className="home-btn home-btn--ghost" style={{ color: '#ef4444', padding: '6px 10px' }} onClick={clearRestock}>
                    <RotateCcw size={14} /> เคลียร์
                  </button>
                )}
                <button type="button" className="fridge-modal-close" onClick={() => setShowList(false)}><X size={18} /></button>
              </div>
            </div>

            {restock.length === 0 ? (
              <div className="fridge-restock-empty">
                <ClipboardList size={36} strokeWidth={1.25} color="#ccc" />
                <p>ยังไม่มีรายการ — กดสินค้าในตู้เพื่อเพิ่ม</p>
              </div>
            ) : (
              <div className="fridge-restock-list">
                {restock.map(item => (
                  <div key={item.slotKey} className="fridge-restock-item">
                    <div className="fridge-restock-item-info">
                      <span className="fridge-restock-item-pos">{item.doorName} · {item.shelfName}</span>
                      <span className="fridge-restock-item-name">{item.productName}</span>
                    </div>
                    <div className="fridge-restock-item-controls">
                      <button type="button" className="fridge-count-btn" onClick={() => adjustCount(item.slotKey, -1)}><Minus size={13} /></button>
                      <span className="fridge-count-val">{item.count}</span>
                      <button type="button" className="fridge-count-btn" onClick={() => adjustCount(item.slotKey, 1)}><Plus size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
