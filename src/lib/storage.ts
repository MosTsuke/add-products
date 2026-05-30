// Queue is still stored in localStorage (no need for cloud)
import type { QueueItemStatus } from './queueStatus';

function get<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function set(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  getQueue: () => get<QueueItem[]>('pos_queue', []),
  setQueue: (v: QueueItem[]) => set('pos_queue', v),
  getMasterImportName: () => get<string | null>('pos_master_import', null),
  setMasterImportName: (name: string) => set('pos_master_import', name),
  clearMasterImportName: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('pos_master_import');
  },
  /** เลขรันล่าสุดของ barcode ที่ระบบสร้าง (prefix 200) */
  getBarcodeRun: () => get<number>('pos_barcode_run', 0),
  setBarcodeRun: (n: number) => set('pos_barcode_run', n),
};

export interface QueueItem {
  id: string;
  barcode: string;
  category: string;
  productType: string;
  nameTH: string;
  nameEN: string;
  descTH: string;
  descEN: string;
  unit: string;
  priceType: string;
  basePrice: string;
  /** ค่าคอลัมน์ CSV ทั้งแถวจากไฟล์ (Product ID, Cost, Vat ฯลฯ) */
  csvCols?: string[];
  /** ค่าตอนนำเข้าจากไฟล์หลัก — ใช้ไฮไลต์ช่องที่แก้ในตาราง */
  fileBaselineCols?: string[];
  /** ใหม่ = หน้าบ้าน · เดิม = จากไฟล์ · แก้ไข = อัปเดตแล้ว */
  status?: QueueItemStatus;
}

/** Base Price ว่าง → 0.00 · ตัวเลข → ทศนิยม 2 ตำแหน่ง (เช่น 10 → 10.00) */
export function normalizeBasePrice(value: string): string {
  const v = value.replace(/,/g, '').trim();
  if (v === '') return '0.00';
  const n = parseFloat(v);
  if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return '0.00';
  return n.toFixed(2);
}

export function captureFileBaselineCols(cols: string[]): string[] {
  const base = [...cols];
  while (base.length < CSV_HEADERS.length) base.push('');
  return base.slice(0, CSV_HEADERS.length);
}

/** ช่องนี้ต่างจากค่าในไฟล์หลักตอน import หรือไม่ */
export function isCsvColChangedFromFile(
  item: QueueItem,
  colIndex: number,
  currentCols: string[],
  baselineById?: Map<string, string[]>
): boolean {
  if (item.status === 'new') return false;
  const base =
    baselineById?.get(item.id) ??
    (item.fileBaselineCols?.length === CSV_HEADERS.length ? item.fileBaselineCols : null);
  if (!base?.length) return false;
  const baseVal = (base[colIndex] ?? '').trim();
  const curVal = (currentCols[colIndex] ?? '').trim();
  return baseVal !== curVal;
}

const CSV_DEFAULT_TAIL = ['0.00', '', '', 'N', 'N', 'N', '0', '0', '0', '0'] as const;

function defaultCsvCols(): string[] {
  return Array(CSV_HEADERS.length).fill('');
}

/** สร้าง/อัปเดตแถว CSV จากฟิลด์ที่แก้ได้ */
export function buildCsvColsFromItem(item: QueueItem): string[] {
  const cols = item.csvCols?.length === CSV_HEADERS.length
    ? [...item.csvCols]
    : defaultCsvCols();

  if (!item.csvCols?.length) {
    cols[11] = CSV_DEFAULT_TAIL[0];
    cols[14] = CSV_DEFAULT_TAIL[3];
    cols[15] = CSV_DEFAULT_TAIL[4];
    cols[16] = CSV_DEFAULT_TAIL[5];
    cols[17] = CSV_DEFAULT_TAIL[6];
    cols[18] = CSV_DEFAULT_TAIL[7];
    cols[19] = CSV_DEFAULT_TAIL[8];
    cols[20] = CSV_DEFAULT_TAIL[9];
  }

  cols[1] = item.category;
  cols[2] = item.barcode;
  cols[3] = item.productType;
  cols[4] = item.nameTH;
  cols[5] = item.nameEN;
  cols[6] = item.descTH;
  cols[7] = item.descEN;
  cols[8] = item.unit;
  cols[9] = item.priceType;
  cols[10] = normalizeBasePrice(item.basePrice);
  return cols;
}

export function patchQueueItemField(
  item: QueueItem,
  field: keyof QueueItem,
  value: string
): QueueItem {
  const normalized = field === 'basePrice' ? normalizeBasePrice(value) : value;
  const next = { ...item, [field]: normalized };
  const colIndex = Object.entries(CSV_FIELD_BY_INDEX).find(([, f]) => f === field)?.[0];
  if (colIndex !== undefined) {
    const cols = buildCsvColsFromItem(next);
    cols[Number(colIndex)] = normalized;
    next.csvCols = cols;
  }
  return next;
}

export const CSV_HEADERS = [
  'Product ID',
  'หมวดหมู่สินค้า',
  'Barcode',
  'Product Type',
  'Product Name(TH)',
  'Product Name(EN)',
  'Description (TH)',
  'Description (EN)',
  'Unit',
  'Price Type',
  'Base Price',
  'Cost',
  'กลุ่มราคา',
  'Group price',
  'Multiprice',
  'Vat',
  'Inventory',
  'Qty (Front)',
  'Threshold (Front)',
  'Qty (Back)',
  'Threshold (Back)',
];

/** คอลัมน์ที่ซ่อนในตารางแก้ไข — ยังอยู่ครบใน Export Excel */
export const TABLE_HIDDEN_COLUMN_INDICES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
]);

export function isColumnVisibleInTable(colIndex: number): boolean {
  return !TABLE_HIDDEN_COLUMN_INDICES.has(colIndex);
}

export const TABLE_VIEW_COLUMN_INDICES = CSV_HEADERS.map((_, i) => i).filter(
  isColumnVisibleInTable
);

/** คอลัมน์ CSV ตามลำดับ export (index ตรงกับ CSV_HEADERS) */
export function itemToCSVCols(item: QueueItem): string[] {
  return buildCsvColsFromItem(item);
}

/** index ใน CSV ที่แก้ไขได้ → ฟิลด์ใน QueueItem */
export const CSV_FIELD_BY_INDEX: Partial<Record<number, keyof QueueItem>> = {
  1: 'category',
  2: 'barcode',
  3: 'productType',
  4: 'nameTH',
  5: 'nameEN',
  6: 'descTH',
  7: 'descEN',
  8: 'unit',
  9: 'priceType',
  10: 'basePrice',
};

export function itemToCSVRow(item: QueueItem): string {
  return itemToCSVCols(item)
    .map(c => `"${String(c).replace(/"/g, '""')}"`)
    .join(',');
}
