'use client';
import { useMemo, useState } from 'react';
import { Copy, Plus, Save, Table2, Trash2, X } from 'lucide-react';
import BarcodeGenButton from '@/components/BarcodeGenButton';
import SearchableSelect from '@/components/SearchableSelect';
import QueueFilterBar from '@/components/QueueFilterBar';
import QueueStatusBadge from '@/components/QueueStatusBadge';
import {
  applyQueueFilters,
  DEFAULT_QUEUE_SEARCH_FIELD,
  type QueueFilterId,
  type QueueSearchFieldId,
} from '@/lib/queueFilters';
import {
  CATEGORY_CSV_COL_INDEX,
  filterCategoriesByStoreRef,
  STORE_REF_COLORS,
  STORE_REF_LABELS,
} from '@/lib/supabase';
import { createManualQueueItem } from '@/lib/queueItemFactory';
import { isManualQueueItem } from '@/lib/queueStatus';
import {
  assignSequentialRunBarcodes,
  describeNextRunBarcode,
  parseNewRunSerial,
  patchSingleRunBarcode,
  peekNextRunFromQueue,
  resetBarcodeRunCounter,
  sortBarcodeTargetsFromAnchor,
  syncBarcodeRunCounter,
} from '@/lib/barcodeGenerate';
import {
  FIXED_PRICE_EAN_EXAMPLES,
  FIXED_PRICE_EAN_HELP_LINES,
  needsFixedPriceEan13Update,
  patchFixedPriceEan13Barcodes,
  resolveFixedPriceEan13ForItem,
} from '@/lib/fixedPriceEan13';
import { normalizeBarcodeInput } from '@/lib/barcodeInput';
import {
  handleBarcodeInputChange,
  handleBarcodeInputKeyDown,
} from '@/lib/barcodeInput';
import { applyStatusAfterTableEdit } from '@/lib/queueStatus';
import {
  captureFileBaselineCols,
  CSV_HEADERS,
  CSV_FIELD_BY_INDEX,
  isCsvColChangedFromFile,
  itemToCSVCols,
  normalizeBasePrice,
  sanitizeBasePriceInput,
  patchQueueItemField,
  QueueItem,
  TABLE_VIEW_COLUMN_INDICES,
  withNormalizedBasePrice,
} from '@/lib/storage';

const DROPDOWN_FIELDS = new Set<keyof QueueItem>([
  'category',
  'productType',
  'unit',
  'priceType',
]);

const NAME_TH_COPY_TARGETS = ['nameEN', 'descTH', 'descEN'] as const;

function cellHoverTitle(text: string | undefined | null): string | undefined {
  const s = String(text ?? '').trim();
  return s.length > 0 ? s : undefined;
}

export interface QueueDropdownOptions {
  categories: string[];
  productTypes: string[];
  units: string[];
  priceTypes: string[];
}

interface QueueTableViewProps {
  queue: QueueItem[];
  dropdownOptions: QueueDropdownOptions;
  /** หมวดหมู่ → ref (0/1/2) สำหรับจุดสีสัญลักษณ์ร้าน */
  categoryRefMap?: Map<string, number>;
  onClose: () => void;
  onQueueChange: (queue: QueueItem[]) => void;
}

function cloneQueue(items: QueueItem[]): QueueItem[] {
  return items.map(i => ({ ...i }));
}

function queuesEqual(a: QueueItem[], b: QueueItem[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function QueueTableView({
  queue,
  dropdownOptions,
  categoryRefMap,
  onClose,
  onQueueChange,
}: QueueTableViewProps) {
  const [draft, setDraft] = useState(() => {
    const d = cloneQueue(queue);
    syncBarcodeRunCounter(d);
    return d;
  });
  const [savedSnapshot, setSavedSnapshot] = useState(() => cloneQueue(queue));
  const [tableFilter, setTableFilter] = useState<QueueFilterId>('all');
  const [tableSearch, setTableSearch] = useState('');
  const [tableSearchField, setTableSearchField] = useState<QueueSearchFieldId>(
    DEFAULT_QUEUE_SEARCH_FIELD
  );
  const [tableSearchRevision, setTableSearchRevision] = useState(0);
  /** ปักแถวที่กำลังแก้ไขไว้ ไม่ให้หายจาก filter/search ระหว่างพิมพ์ */
  const [pinnedRowId, setPinnedRowId] = useState<string | null>(null);
  const [runHintKey, setRunHintKey] = useState(0);
  const [categoryStoreFilter, setCategoryStoreFilter] = useState(0);
  const dirty = !queuesEqual(draft, savedSnapshot);
  const runHint = useMemo(
    () => describeNextRunBarcode(draft),
    [draft, runHintKey]
  );

  const filteredDraft = useMemo(() => {
    const base = applyQueueFilters(draft, tableFilter, tableSearch, tableSearchField);
    if (!pinnedRowId) return base;
    if (base.some(i => i.id === pinnedRowId)) return base;
    const pinned = draft.find(i => i.id === pinnedRowId);
    return pinned ? [pinned, ...base] : base;
  }, [draft, tableFilter, tableSearch, tableSearchField, tableSearchRevision, pinnedRowId]);

  /** ค่าจากไฟล์หลักตอนเปิดตาราง (ไม่เปลี่ยนระหว่างแก้ — เทียบกับ draft ทันที) */
  const fileBaselineById = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const item of queue) {
      if (item.status === 'new') continue;
      if (item.fileBaselineCols?.length === CSV_HEADERS.length) {
        m.set(item.id, [...item.fileBaselineCols]);
      } else {
        m.set(item.id, captureFileBaselineCols(itemToCSVCols(item)));
      }
    }
    return m;
  }, [queue]);

  const rows = useMemo(
    () => filteredDraft.map(item => ({ item, cols: itemToCSVCols(item) })),
    [filteredDraft]
  );

  /** แถวที่แสดงในตารางตอนนี้และยังไม่มี barcode — ใช้กับปุ่มสร้างทีละกลุ่ม */
  const visibleWithoutBarcode = useMemo(
    () => filteredDraft.filter(i => !i.barcode.trim()),
    [filteredDraft]
  );

  const canAddRow = tableFilter === 'all' || tableFilter === 'new';
  const noBarcodeCount = visibleWithoutBarcode.length;
  const barcodeGenScopedToTable =
    tableFilter !== 'all' ||
    tableSearch.trim() !== '' ||
    filteredDraft.length < draft.length;

  const fixedPriceConvertTargets = useMemo(
    () => filteredDraft.filter(needsFixedPriceEan13Update),
    [filteredDraft]
  );
  const fixedPriceConvertCount = fixedPriceConvertTargets.length;
  const showFixedPriceGenBar = tableFilter === 'price-category' && fixedPriceConvertCount > 0;

  const tableColSpan = TABLE_VIEW_COLUMN_INDICES.length + 3;

  const assignBarcode = (id: string) => {
    setDraft(prev => {
      const next = patchSingleRunBarcode(prev, id);
      if (next !== prev) syncBarcodeRunCounter(next);
      return next;
    });
    setRunHintKey(k => k + 1);
  };

  const assignFixedPriceEan13 = () => {
    const targets = fixedPriceConvertTargets;
    const n = targets.length;
    if (n === 0) return;
    const sample = targets[0]!;
    const from = normalizeBarcodeInput(sample.barcode);
    const previewTo = resolveFixedPriceEan13ForItem(sample);
    const preview = previewTo ? `ตัวอย่าง ${from || '(ว่าง)'} → ${previewTo}` : '';
    if (
      !window.confirm(
        `แปลง barcode เป็น EAN-13 กำหนดราคาให้ ${n} รายการ?\n\n` +
          `จากรูปแบบ P ในช่อง (เช่น P0010 → 2999001000006)\n` +
          `29 + 99 + ราคา 4 หลักหลัง P + 0000 + check digit\n` +
          `เฉพาะหมวดหมู่ «ราคาสินค้า»\n\n${preview}`
      )
    ) {
      return;
    }
    const { items, assigned, first, last } = patchFixedPriceEan13Barcodes(draft, targets);
    setDraft(items);
    if (assigned > 0 && first && last && first !== last) {
      window.alert(`แปลงแล้ว ${assigned} รายการ\n${first} → ${last}`);
    } else if (assigned > 0 && first) {
      window.alert(`แปลงแล้ว ${assigned} รายการ\n${first}`);
    }
  };

  const assignAllMissingBarcodes = () => {
    const targets = sortBarcodeTargetsFromAnchor(draft, visibleWithoutBarcode);
    const n = targets.length;
    if (n === 0) return;
    const nextStart = peekNextRunFromQueue(draft);
    const hasAnchor = draft.some(i => parseNewRunSerial(i.barcode) != null);
    const scopeLine = barcodeGenScopedToTable
      ? `เฉพาะ ${n} รายการที่แสดงในตารางตอนนี้ (ตาม filter/ค้นหา)`
      : `ทุกแถวในคิวที่ยังไม่มี barcode (${n} รายการ)`;
    if (
      !window.confirm(
        `สร้าง barcode ให้ ${n} รายการ?\n\n${scopeLine}\n\nเริ่มที่ ${nextStart} แล้ว +1 ต่อเนื่อง\n${
          hasAnchor
            ? 'ต่อจากแถวที่มีเลขรันล่าสุด — แถวล่างก่อน แล้วแถวบน'
            : 'แถวบนก่อน'
        }`
      )
    ) {
      return;
    }
    const { items, first, last } = assignSequentialRunBarcodes(draft, targets);
    setDraft(items);
    setRunHintKey(k => k + 1);
    if (first && last && first !== last) {
      window.alert(`สร้างแล้ว ${n} รายการ\n${first} → ${last}`);
    }
  };

  const addManualRow = () => {
    const pick = (list: string[], fallback: string) =>
      list.includes(fallback) ? fallback : list[0] ?? fallback;

    const row = createManualQueueItem({
      category: pick(dropdownOptions.categories, 'อื่นๆ'),
      productType: pick(dropdownOptions.productTypes, 'สินค้าเดี่ยว'),
      unit: pick(dropdownOptions.units, 'ชิ้น'),
      priceType: pick(dropdownOptions.priceTypes, 'ราคาปกติ'),
    });
    setDraft(prev => [...prev, row]);
  };

  const tryClose = () => {
    if (dirty && !window.confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการปิดโดยไม่บันทึก?')) {
      return;
    }
    onClose();
  };

  const handleSave = () => {
    const incomplete = draft.filter(i => isManualQueueItem(i) && !i.nameTH.trim());
    let toSave = draft;
    if (incomplete.length > 0) {
      const ok = window.confirm(
        `มี ${incomplete.length} แถวใหม่ที่ยังไม่มีชื่อสินค้า — จะไม่บันทึกแถวเหล่านั้น\nต้องการบันทึกต่อ?`
      );
      if (!ok) return;
      toSave = draft.filter(i => !isManualQueueItem(i) || i.nameTH.trim());
    }
    toSave = toSave.map(withNormalizedBasePrice);
    const next = applyStatusAfterTableEdit(queue, toSave);
    setDraft(cloneQueue(next));
    onQueueChange(next);
    setSavedSnapshot(cloneQueue(next));
  };

  const updateField = (id: string, field: keyof QueueItem, value: string) => {
    setDraft(prev =>
      prev.map(item => (item.id === id ? patchQueueItemField(item, field, value) : item))
    );
  };

  const copyNameThToFollowing = (id: string) => {
    setDraft(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        const name = item.nameTH.trim();
        if (!name) return item;
        return NAME_TH_COPY_TARGETS.reduce(
          (row, field) => patchQueueItemField(row, field, name),
          item
        );
      })
    );
  };

  const removeRow = (id: string) => {
    setDraft(prev => prev.filter(item => item.id !== id));
  };

  const getDropdownConfig = (field: keyof QueueItem) => {
    switch (field) {
      case 'category': {
        const cats = filterCategoriesByStoreRef(
          dropdownOptions.categories,
          categoryRefMap,
          categoryStoreFilter,
        );
        return {
          options: cats,
          prepend: cats.includes('อื่นๆ') ? [] : ['อื่นๆ'],
        };
      }
      case 'productType':
        return { options: dropdownOptions.productTypes, prepend: [] as string[] };
      case 'unit':
        return { options: dropdownOptions.units, prepend: [] as string[] };
      case 'priceType':
        return { options: dropdownOptions.priceTypes, prepend: [] as string[] };
      default:
        return { options: [] as string[], prepend: [] as string[] };
    }
  };

  const cellClass = (item: QueueItem, colIndex: number, cols: string[], extra = '') => {
    const changed = isCsvColChangedFromFile(item, colIndex, cols, fileBaselineById);
    return [
      extra,
      changed ? 'queue-csv-table-cell--changed' : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  const renderEditableCell = (
    item: QueueItem,
    field: keyof QueueItem,
    colIndex: number,
    rowIndex: number,
    cols: string[]
  ) => {
    const aria = `${CSV_HEADERS[colIndex]} แถว ${rowIndex + 1}`;
    const isBarcode = field === 'barcode';
    const isNameTH = field === 'nameTH';
    const isBasePrice = field === 'basePrice';
    const tdClass = cellClass(
      item,
      colIndex,
      cols,
      [
        'queue-csv-table-editable',
        isBarcode ? 'queue-csv-table-cell--barcode' : '',
        isNameTH ? 'queue-csv-table-cell--name-th' : '',
        isBasePrice ? 'queue-csv-table-cell--base-price' : '',
      ]
        .filter(Boolean)
        .join(' ')
    );

    if (DROPDOWN_FIELDS.has(field)) {
      const { options, prepend } = getDropdownConfig(field);
      return (
        <td key={colIndex} className={`${tdClass} queue-csv-table-dropdown`}>
          <SearchableSelect
            compact
            label={aria}
            value={String(item[field] ?? '')}
            options={options}
            prependOptions={prepend}
            onChange={v => {
              setPinnedRowId(item.id);
              updateField(item.id, field, v);
            }}
            placeholder="เลือก…"
            inputTitle={cellHoverTitle(String(item[field] ?? ''))}
            optionMeta={field === 'category' ? categoryRefMap : undefined}
          />
        </td>
      );
    }

    const value = String(item[field] ?? '');

    if (isNameTH) {
      return (
        <td key={colIndex} className={tdClass}>
          <div className="queue-csv-table-name-th-wrap">
            <input
              type="text"
              value={value}
              className="queue-csv-table-name-th-input"
              onFocus={() => setPinnedRowId(item.id)}
              onChange={e => updateField(item.id, field, e.target.value)}
              aria-label={aria}
              title={cellHoverTitle(String(value))}
            />
            <button
              type="button"
              className="queue-csv-copy-name-btn"
              onClick={() => copyNameThToFollowing(item.id)}
              disabled={!String(value).trim()}
              title="คัดลอกไป Product Name(EN), Description (TH), Description (EN)"
              aria-label="คัดลอกชื่อไป 3 ช่องถัดไป"
            >
              <Copy size={12} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </td>
      );
    }

    if (isBarcode) {
      return (
        <td key={colIndex} className={tdClass}>
          <div className="queue-csv-table-barcode-wrap">
            <input
              type="text"
              value={value}
              className="queue-csv-table-barcode-input"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              onFocus={() => setPinnedRowId(item.id)}
              onChange={e =>
                handleBarcodeInputChange(e, v => updateField(item.id, 'barcode', v))
              }
              onKeyDown={e =>
                handleBarcodeInputKeyDown(e, value, v => updateField(item.id, 'barcode', v))
              }
              aria-label={aria}
              title={cellHoverTitle(String(value))}
            />
            {!value.trim() && (
              <BarcodeGenButton
                compact
                onClick={() => assignBarcode(item.id)}
                title={`สร้างเลขรัน ${peekNextRunFromQueue(draft)}`}
              />
            )}
          </div>
        </td>
      );
    }

    return (
      <td key={colIndex} className={tdClass}>
        <input
          type="text"
          inputMode={isBasePrice ? 'decimal' : undefined}
          value={value}
          className={isBasePrice ? 'queue-csv-table-base-price-input' : undefined}
          onFocus={() => setPinnedRowId(item.id)}
          onChange={e => {
            const raw = e.target.value;
            updateField(item.id, field, isBasePrice ? sanitizeBasePriceInput(raw) : raw);
          }}
          onBlur={
            isBasePrice
              ? e => updateField(item.id, field, normalizeBasePrice(e.target.value))
              : undefined
          }
          aria-label={aria}
          title={cellHoverTitle(String(value))}
        />
      </td>
    );
  };

  return (
    <div className="queue-table-view" role="dialog" aria-labelledby="queue-table-title">
      <div className="queue-table-view-backdrop" aria-hidden />
      <div className="queue-table-view-panel">
        <header className="queue-table-view-header">
          <div className="queue-table-view-title">
            <Table2 size={22} strokeWidth={2} aria-hidden />
            <div>
              <h2 id="queue-table-title">แก้ไขภาพรวม — ตารางสินค้า</h2>
              <p>
                {draft.length} แถว
                {dirty ? (
                  <span className="queue-table-view-dirty"> · ยังไม่บันทึก</span>
                ) : (
                  <span className="queue-table-view-saved"> · บันทึกแล้ว</span>
                )}
              </p>
            </div>
          </div>
          <button type="button" className="queue-table-view-close" onClick={tryClose} aria-label="ปิด">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <div className="queue-table-view-hint">
          แก้ไขได้ในตาราง — หมวดหมู่/ประเภท/หน่วย/ราคาเลือกจาก dropdown · กด <strong>บันทึก</strong> เพื่อยืนยัน
          <span className="queue-table-view-hint-legend">
            <span className="queue-table-view-legend-swatch" aria-hidden />
            แถบส้มซ้าย = แก้จากไฟล์หลัก · ช่อง Barcode รองรับสแกนเนอร์ · Cost / Vat / สต็อก อยู่ใน Export Excel
          </span>
        </div>

        {draft.length > 0 && (
          <div className="queue-table-filter-block">
            <QueueFilterBar
              items={draft}
              filter={tableFilter}
              onFilterChange={setTableFilter}
              searchQuery={tableSearch}
              onSearchChange={setTableSearch}
              onSearchSubmit={() => setTableSearchRevision(v => v + 1)}
              searchField={tableSearchField}
              onSearchFieldChange={setTableSearchField}
              filteredCount={filteredDraft.length}
              compact
            />
            {tableFilter === 'price-category' && (
              <div className="queue-table-fixed-price-help" role="note">
                <p className="queue-table-fixed-price-help-title">วิธี gen barcode กำหนดราคา</p>
                {FIXED_PRICE_EAN_HELP_LINES.map(line => (
                  <p key={line} className="queue-table-fixed-price-help-line">
                    {line}
                  </p>
                ))}
                <ul className="queue-table-fixed-price-examples">
                  {FIXED_PRICE_EAN_EXAMPLES.map(ex => (
                    <li key={ex.p}>
                      <code>{ex.p}</code>
                      <span aria-hidden> → </span>
                      <code>{ex.ean}</code>
                      <span className="queue-table-fixed-price-examples-baht">({ex.baht} บาท)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(noBarcodeCount > 0 || showFixedPriceGenBar) && (
              <div className="queue-table-gen-bar">
                {noBarcodeCount > 0 && tableFilter !== 'price-category' && (
                  <>
                    <BarcodeGenButton
                      label={`สร้าง barcode (${noBarcodeCount})`}
                      onClick={assignAllMissingBarcodes}
                      title="สร้างให้แถวที่แสดงในตารางและยังไม่มี barcode — ต่อจากเลขรันล่าสุด"
                    />
                    <span className="queue-table-gen-hint">{runHint}</span>
                    <button
                      type="button"
                      className="queue-table-reset-run"
                      onClick={() => {
                        if (
                          window.confirm(
                            'รีเซ็ตเลขรันเป็น 0?\nครั้งถัดไปจะได้ 2000000000001 (ถ้าในคิวยังไม่มีเลขรัน 200… ซ้ำ)'
                          )
                        ) {
                          resetBarcodeRunCounter();
                          syncBarcodeRunCounter(draft);
                          setRunHintKey(k => k + 1);
                        }
                      }}
                    >
                      รีเซ็ตเลขรัน
                    </button>
                  </>
                )}
                {showFixedPriceGenBar && (
                  <>
                    <BarcodeGenButton
                      label={`gen barcode กำหนดราคา (${fixedPriceConvertCount})`}
                      onClick={assignFixedPriceEan13}
                      title="แปลงจาก P-code ในช่อง เช่น P0010 → 2999001000006"
                    />
                    <span className="queue-table-gen-hint">
                      แปลงจาก P ในช่อง · ตัวอย่าง P0010 → 2999001000006
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {draft.length === 0 ? (
          <div className="queue-table-view-empty">ยังไม่มีรายการ — ใช้ Import Excel จากหน้าหลัก</div>
        ) : (
          <div className="queue-table-view-scroll">
            <table className="queue-csv-table">
              <thead>
                <tr>
                  <th className="queue-csv-table-sticky-col queue-csv-table-status">สถานะ</th>
                  <th className="queue-csv-table-sticky-col queue-csv-table-num">#</th>
                  {TABLE_VIEW_COLUMN_INDICES.map(colIndex => {
                    if (
                      colIndex === CATEGORY_CSV_COL_INDEX &&
                      categoryRefMap &&
                      categoryRefMap.size > 0
                    ) {
                      return (
                        <th key={colIndex} className="queue-csv-table-th-category">
                          <div className="queue-csv-table-category-th">
                            <span>{CSV_HEADERS[colIndex]}</span>
                            <label className="queue-csv-table-store-filter">
                              <span className="queue-csv-table-store-filter-dot" style={{ background: STORE_REF_COLORS[categoryStoreFilter] }} aria-hidden />
                              <select
                                value={categoryStoreFilter}
                                onChange={e => setCategoryStoreFilter(Number(e.target.value))}
                                aria-label="กรองหมวดหมู่ตามร้าน"
                              >
                                {[0, 1, 2].map(ref => (
                                  <option key={ref} value={ref}>
                                    {STORE_REF_LABELS[ref]}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </th>
                      );
                    }
                    return <th key={colIndex}>{CSV_HEADERS[colIndex]}</th>;
                  })}
                  <th className="queue-csv-table-actions-col" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !canAddRow ? (
                  <tr>
                    <td
                      colSpan={tableColSpan}
                      className="queue-csv-table-filter-empty-cell"
                    >
                      ไม่มีรายการตรงกับตัวกรองหรือคำค้นหา — ลองเปลี่ยนคำค้นหาหรือตัวกรอง
                    </td>
                  </tr>
                ) : (
                rows.map(({ item, cols }, rowIndex) => (
                  <tr
                    key={item.id}
                    className={item.status ? `queue-csv-table-row--${item.status}` : undefined}
                  >
                    <td className="queue-csv-table-sticky-col queue-csv-table-status">
                      <QueueStatusBadge status={item.status} compact />
                    </td>
                    <td className="queue-csv-table-sticky-col queue-csv-table-num">
                      {rowIndex + 1}
                    </td>
                    {TABLE_VIEW_COLUMN_INDICES.map(colIndex => {
                      const cell = cols[colIndex];
                      const field = CSV_FIELD_BY_INDEX[colIndex];
                      if (field) {
                        return renderEditableCell(item, field, colIndex, rowIndex, cols);
                      }
                      const readonlyClass = cellClass(
                        item,
                        colIndex,
                        cols,
                        'queue-csv-table-readonly'
                      );
                      return (
                        <td
                          key={colIndex}
                          className={readonlyClass}
                          title={cellHoverTitle(cell)}
                        >
                          <span className="queue-csv-table-readonly-text">
                            {cell || '—'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="queue-csv-table-actions-col">
                      <button
                        type="button"
                        className="queue-csv-table-delete"
                        onClick={() => removeRow(item.id)}
                        aria-label={`ลบแถว ${rowIndex + 1}`}
                      >
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))
                )}
                {canAddRow && (
                  <tr className="queue-csv-table-add-row">
                    <td
                      colSpan={tableColSpan}
                      className="queue-csv-table-add-row-cell"
                    >
                      <button
                        type="button"
                        className="home-btn home-btn--primary home-btn--sm"
                        onClick={addManualRow}
                      >
                        <Plus size={14} strokeWidth={2} aria-hidden />
                        เพิ่ม
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <footer className="queue-table-view-footer">
          <button type="button" className="home-btn home-btn--ghost" onClick={tryClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="home-btn home-btn--primary"
            onClick={handleSave}
            disabled={!dirty || draft.length === 0}
          >
            <Save size={16} strokeWidth={2} aria-hidden />
            บันทึก
          </button>
        </footer>
      </div>
    </div>
  );
}
