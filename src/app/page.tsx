'use client';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Barcode,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileUp,
  ListPlus,
  Languages,
  Loader2,
  Package,
  PackageX,
  RotateCcw,
  ScanLine,
  Search,
  SlidersHorizontal,
  Sticker,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import CameraScanner from '@/components/CameraScanner';
import ImportCsvModal from '@/components/ImportCsvModal';
import BarcodePrintPanel from '@/components/BarcodePrintPanel';
import QueueTableView from '@/components/QueueTableView';
import { downloadQueueExcel } from '@/lib/csvExport';
import type { ImportApplyResult } from '@/lib/csvImport';
import { countQueueStatus, migrateQueueItems } from '@/lib/queueStatus';
import SearchableSelect from '@/components/SearchableSelect';
import { resetBarcodeRunCounter, syncBarcodeRunCounter } from '@/lib/barcodeGenerate';
import {
  buildCsvColsFromItem,
  normalizeBasePrice,
  patchQueueItemField,
  storage,
  QueueItem,
} from '@/lib/storage';
import { fetchOptions, fetchCategoryOptions } from '@/lib/supabase';
import {
  handleBarcodeInputChange,
  handleBarcodeInputKeyDown,
  normalizeBarcodeInput,
} from '@/lib/barcodeInput';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function ProductMetaFields({
  categories,
  productTypes,
  units,
  priceTypes,
  category,
  productType,
  unit,
  priceType,
  basePrice,
  onCategory,
  onProductType,
  onUnit,
  onPriceType,
  onBasePrice,
  layout = 'simple',
  categoryRefMap,
}: {
  categories: string[];
  productTypes: string[];
  units: string[];
  priceTypes: string[];
  category: string;
  productType: string;
  unit: string;
  priceType: string;
  basePrice: string;
  onCategory: (v: string) => void;
  onProductType: (v: string) => void;
  onUnit: (v: string) => void;
  onPriceType: (v: string) => void;
  onBasePrice: (v: string) => void;
  layout?: 'simple' | 'advanced';
  categoryRefMap?: Map<string, number>;
}) {
  const [catFilter, setCatFilter] = useState<number>(0);

  const STORE_COLORS: Record<number, string> = { 0: '#9ca3af', 1: '#3b82f6', 2: '#f97316' };
  const STORE_LABELS: Record<number, string> = { 0: 'ทั้งหมด', 1: 'ร้าน 1', 2: 'ร้าน 2' };

  const filteredCategories = useMemo(() => {
    if (catFilter === 0 || !categoryRefMap) return categories;
    return categories.filter(c => {
      const r = categoryRefMap.get(c) ?? 0;
      return r === 0 || r === catFilter;
    });
  }, [categories, catFilter, categoryRefMap]);

  const categoryPrepend = filteredCategories.includes('อื่นๆ') ? [] : ['อื่นๆ'];

  const categorySelect = (
    <div className="field searchable-select home-cat-field-wrap">
      <div className="home-cat-field-header">
        <label>หมวดหมู่สินค้า</label>
        {categoryRefMap && categoryRefMap.size > 0 && (
          <div className="home-cat-filter-btns">
            {[0, 1, 2].map(r => (
              <button
                key={r}
                type="button"
                className={`home-cat-filter-btn${catFilter === r ? ' home-cat-filter-btn--active' : ''}`}
                style={catFilter === r ? { borderColor: STORE_COLORS[r], color: STORE_COLORS[r], background: `${STORE_COLORS[r]}14` } : {}}
                onClick={() => setCatFilter(r)}
              >
                {r !== 0 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: STORE_COLORS[r], display: 'inline-block' }} />}
                {STORE_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </div>
      <SearchableSelect
        label="หมวดหมู่สินค้า"
        value={category}
        options={filteredCategories}
        prependOptions={categoryPrepend}
        onChange={onCategory}
        placeholder="ค้นหาหมวดหมู่…"
        optionMeta={categoryRefMap ?? new Map()}
        hideLabel
      />
    </div>
  );

  const typeSelect = (
    <SearchableSelect
      label="ประเภทสินค้า"
      value={productType}
      options={productTypes}
      onChange={onProductType}
      placeholder="ค้นหาประเภท…"
    />
  );

  const unitSelect = (
    <SearchableSelect
      label="หน่วยนับ"
      value={unit}
      options={units}
      onChange={onUnit}
      placeholder="ค้นหาหน่วย…"
    />
  );

  const priceTypeSelect = (
    <SearchableSelect
      label="ประเภทราคา"
      value={priceType}
      options={priceTypes}
      onChange={onPriceType}
      placeholder="ค้นหาประเภทราคา…"
    />
  );

  const priceInput = (
    <div className="field">
      <label>ราคาฐาน (บาท)</label>
      <input
        type="number"
        value={basePrice}
        onChange={e => onBasePrice(e.target.value)}
        onBlur={() => onBasePrice(normalizeBasePrice(basePrice))}
        placeholder="0.00"
        step="0.01"
        min="0"
      />
    </div>
  );

  if (layout === 'simple') {
    return (
      <>
        <div className="home-row home-row-2">{categorySelect}{typeSelect}</div>
        <div className="home-row home-row-3">{unitSelect}{priceTypeSelect}{priceInput}</div>
      </>
    );
  }

  return (
    <div className="home-row home-row-4">
      {categorySelect}
      {typeSelect}
      {unitSelect}
      {priceTypeSelect}
      <div className="home-row home-row-2" style={{ gridColumn: '1 / -1' }}>
        {priceInput}
      </div>
    </div>
  );
}

export default function Home() {
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const barcodeValueRef = useRef('');

  const [categories, setCategories] = useState<string[]>([]);
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [priceTypes, setPriceTypes] = useState<string[]>([]);

  const [advancedMode, setAdvancedMode] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [categoryRefMap, setCategoryRefMap] = useState<Map<string, number>>(new Map());

  const [barcode, setBarcode] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [category, setCategory] = useState('อื่นๆ');
  const [productType, setProductType] = useState('สินค้าเดี่ยว');
  const [nameTH, setNameTH] = useState('');
  const [nameEN, setNameEN] = useState('');
  const [descTH, setDescTH] = useState('');
  const [descEN, setDescEN] = useState('');
  const [unit, setUnit] = useState('ชิ้น');
  const [priceType, setPriceType] = useState('ราคาปกติ');
  const [basePrice, setBasePrice] = useState('');

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [toast, setToast] = useState('');
  const [tableViewOpen, setTableViewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [queueRevision, setQueueRevision] = useState(0);
  const [masterFileName, setMasterFileName] = useState<string | null>(null);
  const [focusBarcodeAfterRender, setFocusBarcodeAfterRender] = useState(false);
  const [focusNameAfterRender, setFocusNameAfterRender] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchCategoryOptions(),
      fetchOptions('product_type'),
      fetchOptions('unit'),
      fetchOptions('price_type'),
    ])
      .then(([catOpts, types, unitsList, prices]) => {
        const cats = catOpts.map(o => o.value);
        if (cats.length) setCategories(cats);
        if (types.length) setProductTypes(types);
        if (unitsList.length) setUnits(unitsList);
        if (prices.length) setPriceTypes(prices);
        setCategoryRefMap(new Map(catOpts.map(o => [o.value, o.ref])));
        if (cats.includes('อื่นๆ')) setCategory('อื่นๆ');
        if (types.includes('สินค้าเดี่ยว')) setProductType('สินค้าเดี่ยว');
        if (unitsList.includes('ชิ้น')) setUnit('ชิ้น');
        if (prices.includes('ราคาปกติ')) setPriceType('ราคาปกติ');
      })
      .catch(console.error);
    const loaded = migrateQueueItems(storage.getQueue());
    syncBarcodeRunCounter(loaded);
    setQueue(loaded);
    if (loaded.length) storage.setQueue(loaded);
    setMasterFileName(storage.getMasterImportName());
    barcodeInputRef.current?.focus();
  }, []);

  useEffect(() => {
    barcodeValueRef.current = barcode;
  }, [barcode]);

  useEffect(() => {
    if (queue.length > 0) syncBarcodeRunCounter(queue);
  }, [queue]);

  useEffect(() => {
    if (!focusBarcodeAfterRender) return;
    const el = barcodeInputRef.current;
    if (el) {
      el.focus();
      el.select();
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    setFocusBarcodeAfterRender(false);
  }, [focusBarcodeAfterRender]);

  useEffect(() => {
    if (!focusNameAfterRender) return;
    const el = nameInputRef.current;
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    setFocusNameAfterRender(false);
  }, [focusNameAfterRender]);

  const lookupBarcode = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setSearching(true);
    setSuggestions([]);
    setProductImageUrl(null);
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code.trim())}.json`
      );
      const data = await res.json();
      const names: string[] = [];
      if (data.status === 1 && data.product) {
        const p = data.product;
        const th = p.product_name_th || p.product_name_th_imported || '';
        const en = p.product_name_en || p.product_name || '';
        const generic = p.generic_name_th || p.generic_name_en || p.generic_name || '';
        const brand = p.brands || '';
        const qty = p.quantity || ''; // เช่น "180 ml", "500 g"

        const appendQty = (name: string) =>
          name && qty && !name.includes(qty) ? `${name} ${qty}` : name;

        if (th) names.push(appendQty(th));
        if (en && en !== th) names.push(appendQty(en));
        if (generic && !names.includes(generic)) names.push(appendQty(generic));
        if (brand && !names.some(n => n.toLowerCase().includes(brand.toLowerCase()))) {
          const withBrand = [en || th, brand].filter(Boolean).join(' ');
          if (withBrand && !names.includes(withBrand)) names.push(appendQty(withBrand));
        }
        // รูปสินค้า
        const img = p.image_front_small_url || p.image_small_url || p.image_url || null;
        setProductImageUrl(img);
      }
      setSuggestions(names.filter(Boolean).slice(0, 5));
    } catch {
      setSuggestions([]);
      setProductImageUrl(null);
    } finally {
      setSearching(false);
    }
  }, []);

  const setBarcodeSafe = (value: string) => {
    const next = normalizeBarcodeInput(value);
    barcodeValueRef.current = next;
    setBarcode(next);
  };

  const handleBarcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleBarcodeInputChange(e, setBarcodeSafe);
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    handleBarcodeInputKeyDown(e, barcodeValueRef.current, setBarcodeSafe, {
      onEnter: () => {
        const code = barcodeValueRef.current.trim();
        if (code) lookupBarcode(code);
      },
    });
  };

  const focusBarcode = () => {
    setFocusBarcodeAfterRender(true);
  };

  const prepareForNextScan = (nextFocus: 'barcode' | 'name' = 'barcode') => {
    setBarcodeSafe('');
    setSuggestions([]);
    setProductImageUrl(null);
    setNameTH('');
    setNameEN('');
    setDescTH('');
    setDescEN('');
    setBasePrice('');
    setCategory(categories.includes('อื่นๆ') ? 'อื่นๆ' : category);
    setProductType(productTypes.includes('สินค้าเดี่ยว') ? 'สินค้าเดี่ยว' : productType);
    setUnit(units.includes('ชิ้น') ? 'ชิ้น' : unit);
    setPriceType(priceTypes.includes('ราคาปกติ') ? 'ราคาปกติ' : priceType);
    if (nextFocus === 'name') setFocusNameAfterRender(true);
    else focusBarcode();
  };

  const skipBarcode = () => {
    setBarcodeSafe('');
    setSuggestions([]);
    setFocusNameAfterRender(true);
  };

  const pickSuggestion = (name: string) => {
    setNameTH(name);
    setNameEN(name);
    setDescTH(name);
    setDescEN(name);
    setSuggestions([]);
  };

  const resetForm = () => {
    prepareForNextScan();
  };

  const addToQueue = () => {
    if (!nameTH.trim()) return;
    const item: QueueItem = {
      id: generateId(),
      barcode: barcode.trim(),
      category,
      productType,
      nameTH: nameTH.trim(),
      nameEN: nameEN.trim(),
      descTH: descTH.trim(),
      descEN: descEN.trim(),
      unit,
      priceType,
      basePrice: normalizeBasePrice(basePrice),
      status: 'new',
    };
    const withCols = { ...item, csvCols: buildCsvColsFromItem(item) };
    const updated = [...queue, withCols];
    setQueue(updated);
    storage.setQueue(updated);
    prepareForNextScan('barcode');
  };

  const clearQueue = () => {
    if (queue.length && !window.confirm('ล้างรายการในคิวทั้งหมด?')) return;
    setQueue([]);
    storage.setQueue([]);
    storage.clearMasterImportName();
    resetBarcodeRunCounter();
    setMasterFileName(null);
    setQueueRevision(r => r + 1);
  };

  const handleQueueChange = (updated: QueueItem[]) => {
    setQueue(updated);
    storage.setQueue(updated);
    setQueueRevision(r => r + 1);
  };

  const handleCsvImport = ({ queue: updated, stats }: ImportApplyResult, fileName: string) => {
    handleQueueChange(updated);
    storage.setMasterImportName(fileName);
    setMasterFileName(fileName);
    const parts: string[] = [];
    if (stats.appended > 0) parts.push(`ใหม่ในไฟล์ ${stats.appended}`);
    if (stats.updated > 0) parts.push(`อัปเดต ${stats.updated}`);
    if (stats.unchanged > 0) parts.push(`เดิม ${stats.unchanged}`);
    const detail = parts.length ? ` (${parts.join(' · ')})` : '';
    setToast(`นำเข้าแล้ว ${updated.length} รายการในคิว${detail}`);
    setTimeout(() => setToast(''), 4500);
  };

  const queueStatusStats = useMemo(() => countQueueStatus(queue), [queue]);
  const hasStatusLabels = queue.some(i => i.status);

  const exportQueue = () => {
    if (queue.length === 0) return;
    const base = masterFileName?.replace(/\.[^.]+$/, '') ?? 'pos-export';
    downloadQueueExcel(queue, `${base}-${queue.length}.xlsx`);
    setToast(`Export Excel แล้ว ${queue.length} รายการ`);
    setTimeout(() => setToast(''), 3500);
  };

  const canAdd = !!nameTH.trim();

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canAdd) {
      e.preventDefault();
      addToQueue();
    }
  };

  return (
    <>
      <Navbar />
      {showCamera && (
        <CameraScanner
          onScan={(code) => {
            setShowCamera(false);
            const normalized = normalizeBarcodeInput(code);
            setBarcode(normalized);
            lookupBarcode(normalized);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
      <div className="home-page-bg">
        <div className="container home-page">
          <header className="home-hero">
            <div className="home-hero-text">
              <span className="home-hero-eyebrow">เพิ่มสินค้า</span>
              <h1>สแกน → กรอก → จัดการสินค้า</h1>
              <p>เพิ่มทีละชิ้น หรือ Import ไฟล์ Excel หลักเพื่อเพิ่ม/แก้ไขทีละหลายรายการ</p>
            </div>
            <div className="home-hero-stats">
              <div className="home-stat-pill">
                <ListPlus size={16} strokeWidth={2} aria-hidden />
                <span>
                  คิว <strong>{queue.length}</strong> รายการ
                </span>
              </div>
            </div>
          </header>

          <div className="home-grid">
            <div className="home-main">
              {/* Step 1: Barcode */}
              <section className="home-card">
                <div className="home-card-head">
                  <span className="home-step">1</span>
                  <div>
                    <h2>
                      Barcode
                      <span className="home-optional-badge">ไม่บังคับ</span>
                    </h2>
                    <p>มี barcode: สแกนแล้ว Enter ค้นหาชื่อ · ไม่มี: กดปุ่มด้านล่าง</p>
                  </div>
                  <ScanLine className="home-card-head-icon" size={22} strokeWidth={1.75} aria-hidden />
                </div>

                <div className="home-barcode-input">
                  <Barcode size={20} strokeWidth={2} className="home-barcode-icon" aria-hidden />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    className="home-barcode-field"
                    value={barcode}
                    onChange={handleBarcodeChange}
                    onKeyDown={handleBarcodeKeyDown}
                    onFocus={e => e.target.select()}
                    placeholder="สแกนหรือพิมพ์ barcode (เว้นว่างได้)"
                    aria-label="Barcode"
                    lang="en"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    autoCapitalize="off"
                  />
                  <button
                    type="button"
                    className="home-camera-btn"
                    onClick={() => setShowCamera(true)}
                    aria-label="สแกนด้วยกล้อง"
                    title="สแกนด้วยกล้อง"
                  >
                    <Camera size={20} strokeWidth={2} />
                  </button>
                </div>
                <p className="home-barcode-hint">
                  <Languages size={13} strokeWidth={2} aria-hidden />
                  อ่านจากตำแหน่งปุ่มจริง — ไม่ต้องสลับ EN ก่อนสแกน (วาง/พิมพ์เลขไทย ๑๒๓ แปลงให้อัตโนมัติ)
                </p>

                <div className="home-actions">
                  <button
                    type="button"
                    className="home-btn home-btn--primary"
                    onClick={() => lookupBarcode(barcode)}
                    disabled={!barcode.trim() || searching}
                  >
                    {searching ? (
                      <>
                        <Loader2 size={16} className="home-spin" aria-hidden />
                        กำลังค้นหา…
                      </>
                    ) : (
                      <>
                        <Search size={16} strokeWidth={2} aria-hidden />
                        ค้นหาชื่อสินค้า
                      </>
                    )}
                  </button>
                  <button type="button" className="home-btn home-btn--ghost" onClick={skipBarcode}>
                    <PackageX size={16} strokeWidth={2} aria-hidden />
                    ไม่มี barcode
                  </button>
                  <button type="button" className="home-btn home-btn--ghost" onClick={resetForm}>
                    <RotateCcw size={16} strokeWidth={2} aria-hidden />
                    ล้างฟอร์ม
                  </button>
                </div>

                {suggestions.length > 0 && (
                  <div className="home-suggestions">
                    <div className="home-suggestions-top">
                      {productImageUrl && (
                        <img
                          src={productImageUrl}
                          alt="รูปสินค้า"
                          className="home-product-img"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <p className="home-suggestions-label">เลือกชื่อจากผลค้นหา</p>
                        <div className="home-suggestion-chips">
                          {suggestions.map((s, i) => (
                            <button
                              key={i}
                              type="button"
                              className="home-suggestion-chip"
                              onClick={() => pickSuggestion(s)}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Step 2: Product */}
              <section className="home-card" onKeyDown={handleAddKeyDown}>
                <div className="home-card-head">
                  <span className="home-step">2</span>
                  <div>
                    <h2>ข้อมูลสินค้า</h2>
                    <p>กรอกชื่อและตัวเลือกจาก dropdown</p>
                  </div>
                  <button
                    type="button"
                    className={`home-mode-toggle${advancedMode ? ' home-mode-toggle--on' : ''}`}
                    onClick={() => setAdvancedMode(m => !m)}
                    aria-pressed={advancedMode}
                  >
                    <SlidersHorizontal size={14} strokeWidth={2} aria-hidden />
                    {advancedMode ? 'Advanced' : 'โหมดง่าย'}
                    {advancedMode ? (
                      <ChevronUp size={14} aria-hidden />
                    ) : (
                      <ChevronDown size={14} aria-hidden />
                    )}
                  </button>
                </div>

                {!advancedMode ? (
                  <div className="field">
                    <label>ชื่อสินค้า <span className="home-required">*</span></label>
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={nameTH}
                      onChange={e => {
                        const v = e.target.value;
                        setNameTH(v);
                        setNameEN(v);
                        setDescTH(v);
                        setDescEN(v);
                      }}
                      placeholder="กรอกครั้งเดียว — ใส่ทุกช่องอัตโนมัติ"
                    />
                  </div>
                ) : (
                  <>
                    <div className="home-row home-row-2">
                      <div className="field">
                        <label>ชื่อ (TH) <span className="home-required">*</span></label>
                        <input
                          ref={nameInputRef}
                          type="text"
                          value={nameTH}
                          onChange={e => {
                            setNameTH(e.target.value);
                            setDescTH(e.target.value);
                          }}
                          placeholder="ชื่อภาษาไทย"
                        />
                      </div>
                      <div className="field">
                        <label>ชื่อ (EN)</label>
                        <input
                          type="text"
                          value={nameEN}
                          onChange={e => {
                            setNameEN(e.target.value);
                            setDescEN(e.target.value);
                          }}
                          placeholder="ชื่อภาษาอังกฤษ"
                        />
                      </div>
                    </div>
                    <div className="home-row home-row-2">
                      <div className="field">
                        <label>คำอธิบาย (TH)</label>
                        <input
                          type="text"
                          value={descTH}
                          onChange={e => setDescTH(e.target.value)}
                          placeholder="คำอธิบายภาษาไทย"
                        />
                      </div>
                      <div className="field">
                        <label>คำอธิบาย (EN)</label>
                        <input
                          type="text"
                          value={descEN}
                          onChange={e => setDescEN(e.target.value)}
                          placeholder="คำอธิบายภาษาอังกฤษ"
                        />
                      </div>
                    </div>
                  </>
                )}

                <ProductMetaFields
                  categories={categories}
                  productTypes={productTypes}
                  units={units}
                  priceTypes={priceTypes}
                  category={category}
                  productType={productType}
                  unit={unit}
                  priceType={priceType}
                  basePrice={basePrice}
                  onCategory={setCategory}
                  onProductType={setProductType}
                  onUnit={setUnit}
                  onPriceType={setPriceType}
                  onBasePrice={setBasePrice}
                  layout={advancedMode ? 'advanced' : 'simple'}
                  categoryRefMap={categoryRefMap}
                />

                <button
                  type="button"
                  className="home-btn home-btn--add"
                  onMouseDown={e => e.preventDefault()}
                  onClick={addToQueue}
                  disabled={!canAdd}
                >
                  <ListPlus size={18} strokeWidth={2.5} aria-hidden />
                  เพิ่มเข้ารายการ
                </button>

                {canAdd ? (
                  <p className="home-hint home-hint--ok">
                    หลังเพิ่มโฟกัสที่ Barcode พร้อมสแกนชิ้นถัดไปทุกครั้ง · Ctrl+Enter
                  </p>
                ) : (
                  <p className="home-hint">
                    ต้องมี <strong>ชื่อสินค้า</strong> อย่างน้อย — barcode ใส่หรือเว้นว่างก็ได้
                  </p>
                )}
              </section>
            </div>

            <aside className="home-sidebar">
              <section className="home-card home-card--queue">
                <div className="home-card-head">
                  <span className="home-step home-step--queue">3</span>
                  <div>
                    <h2>รายการรอ Export</h2>
                    <p>
                      {masterFileName
                        ? `ไฟล์หลัก: ${masterFileName} · เพิ่มจากหน้าบ้านอยู่ท้ายคิว`
                        : 'Import ไฟล์รายงานสินค้า (.xlsx) หรือเพิ่มทีละชิ้น'}
                    </p>
                  </div>
                  <Package className="home-card-head-icon" size={22} strokeWidth={1.75} aria-hidden />
                </div>

                <div className="home-queue-toolbar">
                  <button
                    type="button"
                    className="home-btn home-btn--primary home-btn--sm"
                    onClick={() => setImportOpen(true)}
                  >
                    <FileUp size={14} strokeWidth={2} aria-hidden />
                    Import Excel
                  </button>
                  {queue.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="home-btn home-btn--ghost home-btn--sm"
                        onClick={() => setTableViewOpen(true)}
                      >
                        <Table2 size={14} strokeWidth={2} aria-hidden />
                        แก้ไขในตาราง
                      </button>
                      <button
                        type="button"
                        className="home-btn home-btn--primary home-btn--sm"
                        onClick={exportQueue}
                      >
                        <Download size={14} strokeWidth={2} aria-hidden />
                        Export Excel
                      </button>
                      <button
                        type="button"
                        className="home-btn home-btn--ghost home-btn--sm home-btn--danger-text"
                        onClick={clearQueue}
                      >
                        <Trash2 size={14} aria-hidden />
                        ล้างคิว
                      </button>
                    </>
                  )}
                </div>

                {queue.length === 0 ? (
                  <div className="home-empty">
                    <Package size={40} strokeWidth={1.25} aria-hidden />
                    <h3>ยังไม่มีรายการ</h3>
                    <p>กด Import Excel หรือเพิ่มสินค้าทีละชิ้นด้านซ้าย</p>
                  </div>
                ) : (
                  <div className="home-queue-summary">
                    {hasStatusLabels && (
                      <div className="home-queue-legend" aria-label="สรุปสถานะรายการ">
                        {queueStatusStats.new > 0 && (
                          <span className="queue-status-badge queue-status--new">
                            ใหม่ {queueStatusStats.new}
                          </span>
                        )}
                        {queueStatusStats.updated > 0 && (
                          <span className="queue-status-badge queue-status--updated">
                            แก้ไข {queueStatusStats.updated}
                          </span>
                        )}
                        {queueStatusStats.unchanged > 0 && (
                          <span className="queue-status-badge queue-status--unchanged">
                            เดิม {queueStatusStats.unchanged}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="home-queue-summary-count">
                      <strong>{queue.length}</strong> รายการในคิว
                    </p>
                    <p className="home-queue-summary-hint">
                      ดูและแก้รายละเอียดทุกแถวใน{' '}
                      <button
                        type="button"
                        className="home-queue-summary-link"
                        onClick={() => setTableViewOpen(true)}
                      >
                        แก้ไขในตาราง
                      </button>
                      {' '}· กด <strong>Export Excel</strong> เพื่อดาวน์โหลดไฟล์
                    </p>
                  </div>
                )}
              </section>

              <section className="home-card home-card--barcode">
                <div className="home-card-head">
                  <span className="home-step home-step--barcode">+</span>
                  <div>
                    <h2>ป้าย Barcode</h2>
                    <p>เลือกรายการแล้วพิมพ์ป้าย — แยกจาก Export</p>
                  </div>
                  <Sticker className="home-card-head-icon" size={22} strokeWidth={1.75} aria-hidden />
                </div>
                <BarcodePrintPanel
                  items={queue}
                  onOpenTable={() => setTableViewOpen(true)}
                />
              </section>
            </aside>
          </div>
        </div>
      </div>

      {importOpen && (
        <ImportCsvModal
          currentQueue={queue}
          onClose={() => setImportOpen(false)}
          onImport={handleCsvImport}
        />
      )}

      {tableViewOpen && (
        <QueueTableView
          key={queueRevision}
          queue={queue}
          dropdownOptions={{
            categories,
            productTypes,
            units,
            priceTypes,
          }}
          onClose={() => setTableViewOpen(false)}
          onQueueChange={handleQueueChange}
        />
      )}

      {toast && (
        <div className="home-toast" role="status">
          <Check size={18} strokeWidth={2.5} aria-hidden />
          {toast}
        </div>
      )}
    </>
  );
}
