import { isGeneratedRunBarcode } from './barcodeGenerate';
import { isProductPriceCategoryItem } from './fixedPriceEan13';
import {
  buildCsvColsFromItem,
  CSV_HEADERS,
  normalizeBasePrice,
  QueueItem,
} from './storage';
import { isManualQueueItem } from './queueStatus';

export type QueueSearchFieldId =
  | 'product'
  | 'description'
  | 'price'
  | 'barcode'
  | 'category'
  | 'product-id'
  | 'csv-other';

export const QUEUE_SEARCH_FIELDS: { id: QueueSearchFieldId; label: string }[] = [
  { id: 'product', label: 'ชื่อสินค้า' },
  { id: 'description', label: 'คำอธิบาย' },
  { id: 'price', label: 'Base Price' },
  { id: 'barcode', label: 'Barcode' },
  { id: 'category', label: 'หมวดหมู่/ประเภท/หน่วย' },
  { id: 'product-id', label: 'Product ID' },
  { id: 'csv-other', label: 'อื่นๆ (Vat, สต็อก ฯลฯ)' },
];

export const DEFAULT_QUEUE_SEARCH_FIELD: QueueSearchFieldId = 'product';

export function getQueueSearchFieldLabel(id: QueueSearchFieldId): string {
  return QUEUE_SEARCH_FIELDS.find(f => f.id === id)?.label ?? id;
}

function pushParts(parts: string[], values: (string | undefined)[]) {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) parts.push(s);
  }
}

/** แปลงราคาเป็นตัวเลข (ว่าง / 0 / 0.00 เท่ากัน) */
function parsePriceNumber(value: string): number | null {
  const t = value.replace(/,/g, '').trim();
  if (t === '') return null;
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

/** Base Price ที่แสดงในตาราง (ไม่รวม Cost — กัน 0.00 ใน Cost ทำให้ทุกแถวติด) */
function getItemBasePriceNumber(item: QueueItem): number {
  const cols = buildCsvColsFromItem(item);
  const display = normalizeBasePrice(cols[10] ?? item.basePrice);
  return parsePriceNumber(display) ?? 0;
}

function collectPriceSearchValues(item: QueueItem, cols: string[]): string[] {
  const out = new Set<string>();
  const base = normalizeBasePrice(cols[10] ?? item.basePrice);
  out.add(base);
  const raw = String(item.basePrice ?? '').trim();
  if (raw && raw !== base) out.add(raw);
  const priceType = (item.priceType ?? '').trim();
  if (priceType) out.add(priceType);
  for (const v of [cols[12], cols[13]]) {
    const s = String(v ?? '').trim();
    if (s) out.add(s);
  }
  return [...out];
}

function matchesPriceSearch(item: QueueItem, query: string): boolean {
  const q = query.trim();
  if (!q) return true;

  const queryNum = parsePriceNumber(q);
  if (queryNum !== null) {
    return getItemBasePriceNumber(item) === queryNum;
  }

  const cols = buildCsvColsFromItem(item);
  const textHaystack = [item.priceType, cols[12], cols[13]]
    .map(v => String(v ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every(t => textHaystack.includes(t));
}

/** ข้อความสำหรับค้นหา ตามฟิลด์ที่เลือก */
export function getQueueItemSearchText(
  item: QueueItem,
  field: QueueSearchFieldId
): string {
  const cols = buildCsvColsFromItem(item);
  const parts: string[] = [];

  switch (field) {
    case 'product':
      pushParts(parts, [item.nameTH, item.nameEN]);
      break;
    case 'description':
      pushParts(parts, [item.descTH, item.descEN]);
      break;
    case 'price':
      pushParts(parts, collectPriceSearchValues(item, cols));
      break;
    case 'barcode':
      pushParts(parts, [item.barcode]);
      break;
    case 'category':
      pushParts(parts, [item.category, item.productType, item.unit]);
      break;
    case 'product-id':
      pushParts(parts, [cols[0]]);
      break;
    case 'csv-other':
      pushParts(parts, cols.slice(14, CSV_HEADERS.length));
      break;
    default:
      break;
  }

  return parts.join(' ').toLowerCase();
}

export function matchesQueueSearch(
  item: QueueItem,
  query: string,
  field: QueueSearchFieldId
): boolean {
  const q = query.trim();
  if (!q) return true;
  if (field === 'price') return matchesPriceSearch(item, q);

  const haystack = getQueueItemSearchText(item, field);
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every(t => haystack.includes(t));
}

export function searchFieldPlaceholder(field: QueueSearchFieldId): string {
  return `ค้นหา${getQueueSearchFieldLabel(field)}…`;
}

export type QueueFilterId =
  | 'all'
  | 'new'
  | 'unchanged'
  | 'edited'
  | 'no-barcode'
  | 'generated-barcode'
  | 'price-category';

export const QUEUE_FILTERS: { id: QueueFilterId; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'new', label: 'ใหม่' },
  { id: 'unchanged', label: 'เดิม' },
  { id: 'edited', label: 'เดิม (แก้แล้ว)' },
  { id: 'no-barcode', label: 'ไม่มี barcode' },
  { id: 'generated-barcode', label: 'barcode สร้างใหม่' },
  { id: 'price-category', label: 'barcode กำหนดราคา' },
];

/** รายการจากไฟล์ที่ค่าเปลี่ยนจากตอน import */
export function hasFileEdits(item: QueueItem): boolean {
  if (isManualQueueItem(item)) return false;
  if (item.status === 'updated') return true;
  if (!item.fileBaselineCols?.length) return false;
  const cols = buildCsvColsFromItem(item);
  return item.fileBaselineCols.some(
    (v, i) => (v ?? '').trim() !== (cols[i] ?? '').trim()
  );
}

export function matchesQueueFilter(item: QueueItem, filter: QueueFilterId): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'new':
      return isManualQueueItem(item);
    case 'unchanged':
      return !isManualQueueItem(item) && item.status === 'unchanged' && !hasFileEdits(item);
    case 'edited':
      return !isManualQueueItem(item) && hasFileEdits(item);
    case 'no-barcode':
      return !item.barcode.trim();
    case 'generated-barcode':
      return isGeneratedRunBarcode(item.barcode);
    case 'price-category':
      return isProductPriceCategoryItem(item);
    default:
      return true;
  }
}

export function filterQueueItems(items: QueueItem[], filter: QueueFilterId): QueueItem[] {
  if (filter === 'all') return items;
  return items.filter(item => matchesQueueFilter(item, filter));
}

/** ตัวกรองชิป + ช่องค้นหา */
export function applyQueueFilters(
  items: QueueItem[],
  filter: QueueFilterId,
  searchQuery: string,
  searchField: QueueSearchFieldId
): QueueItem[] {
  let result = filterQueueItems(items, filter);
  const q = searchQuery.trim();
  if (q) {
    result = result.filter(item => matchesQueueSearch(item, searchQuery, searchField));
  }
  return result;
}

export function countByQueueFilter(items: QueueItem[]): Record<QueueFilterId, number> {
  const counts: Record<QueueFilterId, number> = {
    all: items.length,
    new: 0,
    unchanged: 0,
    edited: 0,
    'no-barcode': 0,
    'generated-barcode': 0,
    'price-category': 0,
  };
  for (const item of items) {
    if (matchesQueueFilter(item, 'new')) counts.new++;
    if (matchesQueueFilter(item, 'unchanged')) counts.unchanged++;
    if (matchesQueueFilter(item, 'edited')) counts.edited++;
    if (matchesQueueFilter(item, 'no-barcode')) counts['no-barcode']++;
    if (matchesQueueFilter(item, 'generated-barcode')) counts['generated-barcode']++;
    if (matchesQueueFilter(item, 'price-category')) counts['price-category']++;
  }
  return counts;
}
