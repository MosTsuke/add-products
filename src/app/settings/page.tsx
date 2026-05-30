'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronRight,
  CircleDollarSign,
  FolderOpen,
  Package,
  ListPlus,
  Plus,
  Search,
  Sprout,
  Tag,
  Trash2,
  X,
  type LucideProps,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import {
  supabase,
  fetchOptions,
  addOption,
  addOptions,
  deleteOption,
  DropdownType,
} from '@/lib/supabase';

function parseBulkInput(text: string): string[] {
  const parts = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}

const ICON_SIZES = { sm: 16, md: 20, lg: 26, xl: 32 } as const;
type IconSize = keyof typeof ICON_SIZES;

function SectionIcon({
  type,
  size = 'md',
  ...props
}: { type: DropdownType; size?: IconSize } & LucideProps) {
  const iconProps = { size: ICON_SIZES[size], strokeWidth: 2, 'aria-hidden': true as const, ...props };
  switch (type) {
    case 'category':
      return <FolderOpen {...iconProps} />;
    case 'product_type':
      return <Tag {...iconProps} />;
    case 'unit':
      return <Package {...iconProps} />;
    case 'price_type':
      return <CircleDollarSign {...iconProps} />;
  }
}

type Accent = 'violet' | 'sky' | 'amber' | 'emerald';

const SECTIONS: {
  type: DropdownType;
  label: string;
  description: string;
  shortLabel: string;
  accent: Accent;
  defaults: string[];
}[] = [
  {
    type: 'category',
    label: 'หมวดหมู่สินค้า',
    shortLabel: 'หมวดหมู่',
    description: 'ตัวเลือกในช่องหมวดหมู่ หน้าเพิ่มสินค้า',
    accent: 'violet',
    defaults: ['ช้อนส้อมพลาสติก', 'กระดาษ', 'อาหาร', 'เครื่องดื่ม', 'ของใช้', 'อื่นๆ'],
  },
  {
    type: 'product_type',
    label: 'ประเภทสินค้า',
    shortLabel: 'ประเภท',
    description: 'Product Type ในฟอร์มเพิ่มสินค้า',
    accent: 'sky',
    defaults: ['สินค้าเดี่ยว', 'สินค้าชุด', 'บริการ'],
  },
  {
    type: 'unit',
    label: 'หน่วยนับ',
    shortLabel: 'หน่วย',
    description: 'Unit ในฟอร์มเพิ่มสินค้า',
    accent: 'amber',
    defaults: ['ชิ้น', 'แพ็ก', 'กล่อง', 'ขวด', 'ถุง', 'โหล'],
  },
  {
    type: 'price_type',
    label: 'ประเภทราคา',
    shortLabel: 'ราคา',
    description: 'Price Type ในฟอร์มเพิ่มสินค้า',
    accent: 'emerald',
    defaults: ['ราคาปกติ', 'ราคาส่ง', 'ราคาพิเศษ'],
  },
];

function BulkAddModal({
  label,
  accent,
  existing,
  onCancel,
  onConfirm,
}: {
  label: string;
  accent: Accent;
  existing: string[];
  onCancel: () => void;
  onConfirm: (values: string[]) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const parsed = useMemo(() => parseBulkInput(text), [text]);
  const existingSet = useMemo(() => new Set(existing), [existing]);
  const toAdd = useMemo(() => parsed.filter(v => !existingSet.has(v)), [parsed, existingSet]);
  const duplicates = useMemo(() => parsed.filter(v => existingSet.has(v)), [parsed, existingSet]);

  const handleSubmit = async () => {
    if (toAdd.length === 0) return;
    setSubmitting(true);
    try {
      await onConfirm(toAdd);
      onCancel();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="settings-modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className={`settings-modal settings-modal--wide settings-modal--bulk settings-modal--${accent}`}
        role="dialog"
        aria-labelledby="bulk-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="settings-bulk-modal-header">
          <div className={`settings-bulk-modal-icon settings-bulk-modal-icon--${accent}`} aria-hidden>
            <ListPlus size={24} strokeWidth={2} />
          </div>
          <div>
            <h3 id="bulk-modal-title">เพิ่มหลายรายการ</h3>
            <p className="settings-modal-hint" style={{ marginBottom: 0 }}>
              {label} — ใส่ทีละบรรทัด หรือคั่นด้วย comma
            </p>
          </div>
          <button
            type="button"
            className="settings-bulk-close"
            onClick={onCancel}
            aria-label="ปิด"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <textarea
          className="settings-bulk-textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={'เช่น\nชิ้น\nแพ็ก\nกล่อง\nหรือ ชิ้น, แพ็ก, กล่อง'}
          rows={8}
          disabled={submitting}
          autoFocus
        />

        {parsed.length > 0 && (
          <div className="settings-bulk-summary">
            <span className="settings-bulk-stat settings-bulk-stat--new">
              เพิ่มได้ <strong>{toAdd.length}</strong> รายการ
            </span>
            {duplicates.length > 0 && (
              <span className="settings-bulk-stat settings-bulk-stat--dup">
                ซ้ำในระบบ <strong>{duplicates.length}</strong>
              </span>
            )}
          </div>
        )}

        {toAdd.length > 0 && (
          <div className="settings-bulk-preview">
            <p className="settings-bulk-preview-label">ตัวอย่างที่จะเพิ่ม</p>
            <div className={`settings-chips settings-chips--preview settings-chips--${accent}`}>
              {toAdd.slice(0, 12).map(v => (
                <span key={v} className={`settings-chip settings-chip--${accent}`}>
                  {v}
                </span>
              ))}
              {toAdd.length > 12 && (
                <span className="settings-bulk-more">+{toAdd.length - 12} อื่นๆ</span>
              )}
            </div>
          </div>
        )}

        <div className="settings-modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={submitting}>
            ยกเลิก
          </button>
          <button
            type="button"
            className={`settings-bulk-submit settings-bulk-submit--${accent}`}
            onClick={handleSubmit}
            disabled={toAdd.length === 0 || submitting}
          >
            {submitting ? (
              <>
                <span className="settings-spinner" aria-hidden />
                กำลังเพิ่ม…
              </>
            ) : (
              <>
                <ListPlus size={16} strokeWidth={2.5} aria-hidden />
                เพิ่ม {toAdd.length} รายการ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({
  value,
  accent,
  onCancel,
  onConfirm,
}: {
  value: string;
  accent: Accent;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="settings-modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className={`settings-modal settings-modal--${accent}`}
        role="dialog"
        aria-labelledby="delete-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="settings-modal-icon" aria-hidden>
          <Trash2 size={26} strokeWidth={2} />
        </div>
        <h3 id="delete-modal-title">ลบรายการนี้?</h3>
        <p className="settings-modal-value">「{value}」</p>
        <p className="settings-modal-hint">จะหายจาก dropdown หน้าเพิ่มสินค้าทันที</p>
        <div className="settings-modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            ยกเลิก
          </button>
          <button type="button" className="settings-modal-delete" onClick={onConfirm}>
            ลบเลย
          </button>
        </div>
      </div>
    </div>
  );
}

interface OptionSectionProps {
  type: DropdownType;
  label: string;
  description: string;
  accent: Accent;
  items: string[];
  loading: boolean;
  onAdd: (type: DropdownType, value: string) => Promise<void>;
  onBulkAdd: (type: DropdownType, values: string[]) => Promise<void>;
  onDelete: (type: DropdownType, value: string) => Promise<void>;
}

function OptionSection({
  type,
  label,
  description,
  accent,
  items,
  loading,
  onAdd,
  onBulkAdd,
  onDelete,
}: OptionSectionProps) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item => item.toLowerCase().includes(q));
  }, [items, search]);

  const showMessage = (type: 'ok' | 'err', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3200);
  };

  const handleAdd = async () => {
    const v = input.trim();
    if (!v) return;
    if (items.includes(v)) {
      showMessage('err', 'มีรายการนี้อยู่แล้ว');
      return;
    }
    setAdding(true);
    try {
      await onAdd(type, v);
      setInput('');
      showMessage('ok', `เพิ่ม "${v}" แล้ว`);
    } catch {
      showMessage('err', 'เพิ่มไม่สำเร็จ — ลองอีกครั้ง');
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const value = pendingDelete;
    setPendingDelete(null);
    try {
      await onDelete(type, value);
      showMessage('ok', `ลบ "${value}" แล้ว`);
    } catch {
      showMessage('err', 'ลบไม่สำเร็จ — ลองอีกครั้ง');
    }
  };

  return (
    <>
      <div className={`settings-panel settings-panel--${accent}`} data-accent={accent}>
        <div className="settings-panel-glow" aria-hidden />

        <div className="settings-panel-header">
          <div className={`settings-panel-avatar settings-panel-avatar--${accent}`}>
            <SectionIcon type={type} size="lg" strokeWidth={2.25} />
          </div>
          <div className="settings-panel-titles">
            <h2>{label}</h2>
            <p>{description}</p>
          </div>
          <div className={`settings-count-ring settings-count-ring--${accent}`}>
            <span className="settings-count-num">{loading ? '—' : items.length}</span>
            <span className="settings-count-label">รายการ</span>
          </div>
        </div>

        <div className={`settings-composer settings-composer--${accent}`}>
          <div className="settings-input-wrap">
            <span className="settings-input-icon" aria-hidden>
              <Plus size={18} strokeWidth={2} />
            </span>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') setInput('');
              }}
              placeholder={`เพิ่ม${label}…`}
              disabled={adding || loading}
              aria-label={`เพิ่ม${label}`}
            />
          </div>
          <button
            type="button"
            className={`settings-add-btn settings-add-btn--${accent}`}
            onClick={handleAdd}
            disabled={!input.trim() || adding || loading}
          >
            {adding ? (
              <span className="settings-spinner" aria-hidden />
            ) : (
              <Plus size={18} strokeWidth={2.5} aria-hidden />
            )}
            <span>{adding ? 'กำลังเพิ่ม' : 'เพิ่ม'}</span>
          </button>
          <button
            type="button"
            className={`settings-bulk-open-btn settings-bulk-open-btn--${accent}`}
            onClick={() => setBulkOpen(true)}
            disabled={loading}
            title="เพิ่มหลายรายการพร้อมกัน"
          >
            <ListPlus size={18} strokeWidth={2} aria-hidden />
            <span>หลายรายการ</span>
          </button>
        </div>

        {message && (
          <div
            className={`settings-toast settings-toast--${message.type}`}
            role="status"
          >
            {message.type === 'ok' ? (
              <Check size={16} strokeWidth={2.5} aria-hidden />
            ) : (
              <AlertCircle size={16} strokeWidth={2.5} aria-hidden />
            )}
            {message.text}
          </div>
        )}

        <div className="settings-search-wrap">
          <span className="settings-search-icon" aria-hidden>
            <Search size={16} strokeWidth={2} />
          </span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={items.length ? `ค้นหาใน ${items.length} รายการ…` : 'ค้นหา…'}
            disabled={loading || items.length === 0}
            aria-label="ค้นหารายการ"
          />
          {search && (
            <button
              type="button"
              className="settings-search-clear"
              onClick={() => setSearch('')}
              aria-label="ล้างการค้นหา"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>

        <div className="settings-items-area">
          {loading && (
            <div className="settings-chips settings-chips--skeleton" aria-busy="true">
              {[72, 96, 64, 88, 56].map((w, i) => (
                <span key={i} className="settings-chip-skeleton" style={{ width: w }} />
              ))}
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className={`settings-empty settings-empty--${accent}`}>
              <div className="settings-empty-orb" aria-hidden>
                <SectionIcon type={type} size="xl" strokeWidth={1.75} />
              </div>
              <h3>ยังว่างอยู่</h3>
              <p>เพิ่มทีละรายการ กด «หลายรายการ» หรือใช้ข้อมูลเริ่มต้นที่หัวหน้า</p>
            </div>
          )}

          {!loading && items.length > 0 && filtered.length === 0 && (
            <div className="settings-empty settings-empty--compact">
              <h3>ไม่พบ «{search}»</h3>
              <button type="button" className="btn-ghost" onClick={() => setSearch('')}>
                แสดงทั้งหมด {items.length} รายการ
              </button>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="settings-chips">
              {filtered.map(item => (
                <div key={item} className={`settings-chip settings-chip--${accent}`}>
                  <span>{item}</span>
                  <button
                    type="button"
                    className="settings-chip-remove"
                    onClick={() => setPendingDelete(item)}
                    aria-label={`ลบ ${item}`}
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && search && filtered.length > 0 && filtered.length < items.length && (
          <p className="settings-filter-hint">
            แสดง {filtered.length} จาก {items.length}
          </p>
        )}
      </div>

      {bulkOpen && (
        <BulkAddModal
          label={label}
          accent={accent}
          existing={items}
          onCancel={() => setBulkOpen(false)}
          onConfirm={async values => {
            try {
              await onBulkAdd(type, values);
              showMessage('ok', `เพิ่ม ${values.length} รายการแล้ว`);
            } catch {
              showMessage('err', 'เพิ่มไม่สำเร็จ — ลองอีกครั้ง');
              throw new Error('bulk add failed');
            }
          }}
        />
      )}

      {pendingDelete && (
        <DeleteModal
          value={pendingDelete}
          accent={accent}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<DropdownType>('category');
  const [data, setData] = useState<Record<DropdownType, string[]>>({
    category: [],
    product_type: [],
    unit: [],
    price_type: [],
  });
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [categories, productTypes, units, priceTypes] = await Promise.all([
        fetchOptions('category'),
        fetchOptions('product_type'),
        fetchOptions('unit'),
        fetchOptions('price_type'),
      ]);
      setData({
        category: categories,
        product_type: productTypes,
        unit: units,
        price_type: priceTypes,
      });
    } catch (e) {
      setError('โหลดข้อมูลไม่ได้ — ตรวจสอบการเชื่อมต่อ Supabase');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAdd = async (type: DropdownType, value: string) => {
    await addOption(type, value);
    setData(prev => ({ ...prev, [type]: [...prev[type], value].sort() }));
  };

  const handleBulkAdd = async (type: DropdownType, values: string[]) => {
    const newValues = values.filter(v => !data[type].includes(v));
    if (newValues.length === 0) return;
    await addOptions(type, newValues);
    setData(prev => ({
      ...prev,
      [type]: [...prev[type], ...newValues].sort(),
    }));
  };

  const handleDelete = async (type: DropdownType, value: string) => {
    await deleteOption(type, value);
    setData(prev => ({ ...prev, [type]: prev[type].filter(v => v !== value) }));
  };

  const seedDefaults = async () => {
    setSeeding(true);
    try {
      for (const section of SECTIONS) {
        for (const value of section.defaults) {
          if (!data[section.type].includes(value)) {
            await supabase.from('dropdown_options').upsert({ type: section.type, value });
          }
        }
      }
      await loadAll();
    } finally {
      setSeeding(false);
    }
  };

  const isEmpty = Object.values(data).every(arr => arr.length === 0);
  const totalCount = Object.values(data).reduce((n, arr) => n + arr.length, 0);
  const activeSection = SECTIONS.find(s => s.type === activeTab)!;

  return (
    <>
      <Navbar />
      <div className="settings-page-bg">
        <div className="container settings-page">
          <header className={`settings-hero settings-hero--${activeSection.accent}`}>
            <div className="settings-hero-bg" aria-hidden />
            <div className="settings-hero-content">
              <span className="settings-hero-eyebrow">การตั้งค่า</span>
              <h1>Dropdown Options</h1>
              <p>จัดการตัวเลือกในฟอร์มเพิ่มสินค้า — ซิงค์กับ Supabase อัตโนมัติ</p>
              <div className="settings-hero-meta">
                <span className="settings-pill settings-pill--live">
                  <span className="settings-live-dot" aria-hidden /> Live
                </span>
                {!loading && (
                  <span className="settings-pill">
                    รวม <strong>{totalCount}</strong> รายการ
                  </span>
                )}
                {!loading && isEmpty && (
                  <button
                    type="button"
                    className="settings-seed-btn"
                    onClick={seedDefaults}
                    disabled={seeding}
                  >
                    {seeding ? (
                      'กำลังเตรียม…'
                    ) : (
                      <>
                        <Sprout size={14} strokeWidth={2.5} aria-hidden />
                        ข้อมูลเริ่มต้น
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </header>

          {error && (
            <div className="settings-error-banner" role="alert">
              <span className="settings-error-text">
                <AlertTriangle size={16} strokeWidth={2} aria-hidden />
                {error}
              </span>
              <button type="button" className="btn-ghost" onClick={loadAll}>
                ลองใหม่
              </button>
            </div>
          )}

          <div className="settings-stats">
            {SECTIONS.map(s => (
              <button
                key={s.type}
                type="button"
                className={`settings-stat-card settings-stat-card--${s.accent}${
                  activeTab === s.type ? ' settings-stat-card--active' : ''
                }`}
                onClick={() => setActiveTab(s.type)}
                aria-current={activeTab === s.type ? 'true' : undefined}
              >
                <span className={`settings-stat-icon settings-stat-icon--${s.accent}`}>
                  <SectionIcon type={s.type} size="sm" />
                </span>
                <span className="settings-stat-label">{s.shortLabel}</span>
                <span className="settings-stat-value">
                  {loading ? '—' : data[s.type].length}
                </span>
              </button>
            ))}
          </div>

          <div className="settings-layout">
            <nav className="settings-tabs" aria-label="หมวดตัวเลือก">
              <p className="settings-tabs-heading">หมวดทั้งหมด</p>
              {SECTIONS.map(s => (
                <button
                  key={s.type}
                  type="button"
                  className={`settings-tab settings-tab--${s.accent}${
                    activeTab === s.type ? ' settings-tab--active' : ''
                  }`}
                  onClick={() => setActiveTab(s.type)}
                  aria-current={activeTab === s.type ? 'true' : undefined}
                >
                  <span className={`settings-tab-icon settings-tab-icon--${s.accent}`}>
                    <SectionIcon type={s.type} size="md" />
                  </span>
                  <span className="settings-tab-text">
                    <span className="settings-tab-label">{s.label}</span>
                    <span className="settings-tab-sub">
                      {loading ? '…' : `${data[s.type].length} รายการ`}
                    </span>
                  </span>
                  {activeTab === s.type && (
                    <ChevronRight className="settings-tab-chevron" size={18} strokeWidth={2} aria-hidden />
                  )}
                </button>
              ))}
            </nav>

            <div className="settings-panel-slot" key={activeTab}>
              <OptionSection
                type={activeSection.type}
                label={activeSection.label}
                description={activeSection.description}
                accent={activeSection.accent}
                items={data[activeSection.type]}
                loading={loading}
                onAdd={handleAdd}
                onBulkAdd={handleBulkAdd}
                onDelete={handleDelete}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
