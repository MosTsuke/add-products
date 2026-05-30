import * as XLSX from 'xlsx';
import { isManualQueueItem, itemDataEqual } from './queueStatus';
import {
  captureFileBaselineCols,
  CSV_HEADERS,
  normalizeBasePrice,
  QueueItem,
} from './storage';

export function generateQueueId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** แยกแถว CSV รองรับฟิลด์ในเครื่องหมายคำพูด */
export function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
      row.push(cell);
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      if (ch === '\r') i++;
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some(c => c.trim() !== '')) rows.push(row);
  }

  return rows;
}

function isHeaderRow(row: string[]): boolean {
  const a = (row[0] ?? '').trim().toLowerCase();
  const b = (row[1] ?? '').trim();
  return a === 'product id' || b.includes('หมวดหมู่') || b.toLowerCase() === 'category';
}

export function csvRowToQueueItem(cols: string[], id?: string): QueueItem | null {
  const nameTH = (cols[4] ?? '').trim();
  if (!nameTH) return null;

  const standard = [...cols];
  while (standard.length < CSV_HEADERS.length) standard.push('');
  standard[10] = normalizeBasePrice(standard[10] ?? '');

  return {
    id: id ?? generateQueueId(),
    category: (cols[1] ?? '').trim(),
    barcode: (cols[2] ?? '').trim(),
    productType: (cols[3] ?? '').trim(),
    nameTH,
    nameEN: (cols[5] ?? '').trim() || nameTH,
    descTH: (cols[6] ?? '').trim() || nameTH,
    descEN: (cols[7] ?? '').trim() || (cols[5] ?? '').trim() || nameTH,
    unit: (cols[8] ?? '').trim(),
    priceType: (cols[9] ?? '').trim(),
    basePrice: standard[10],
    csvCols: standard.slice(0, CSV_HEADERS.length),
    fileBaselineCols: captureFileBaselineCols(standard),
  };
}

/** แปลงชื่อหัวคอลัมน์จาก Excel → index มาตรฐาน */
const HEADER_TO_COL_INDEX: Record<string, number> = {
  'product id': 0,
  'หมวดหมู่สินค้า': 1,
  category: 1,
  barcode: 2,
  'product type': 3,
  'product name(th)': 4,
  'product name (th)': 4,
  'product name(en)': 5,
  'product name (en)': 5,
  'description (th)': 6,
  'description (en)': 7,
  unit: 8,
  'price type': 9,
  'base price': 10,
  cost: 11,
  'กลุ่มราคา': 12,
  'group price': 13,
  multiprice: 14,
  vat: 15,
  inventory: 16,
  'qty (front)': 17,
  'threshold (front)': 18,
  'qty (back)': 19,
  'threshold (back)': 20,
};

function headerMatchesPosTemplate(headerRow: string[]): boolean {
  let matched = 0;
  const limit = Math.min(headerRow.length, CSV_HEADERS.length);
  for (let i = 0; i < limit; i++) {
    if (normalizeHeader(headerRow[i] ?? '') === normalizeHeader(CSV_HEADERS[i])) {
      matched++;
    }
  }
  return matched >= 10;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cellToString(cell: unknown): string {
  if (cell == null || cell === '') return '';
  if (typeof cell === 'number') {
    if (Number.isFinite(cell) && Number.isInteger(cell) && Math.abs(cell) >= 1e9) {
      return String(Math.trunc(cell));
    }
    return String(cell);
  }
  return String(cell).trim();
}

function sheetRowsToGrid(raw: unknown[][]): string[][] {
  return raw
    .filter(row => row && row.some(c => cellToString(c) !== ''))
    .map(row => (row ?? []).map(cellToString));
}

function buildHeaderColumnMap(headerRow: string[]): Map<number, number> | null {
  const map = new Map<number, number>();
  let matched = 0;
  headerRow.forEach((h, i) => {
    const idx = HEADER_TO_COL_INDEX[normalizeHeader(h)];
    if (idx !== undefined) {
      map.set(i, idx);
      matched++;
    }
  });
  return matched >= 3 ? map : null;
}

/** จัดแถวให้ตรง index ตาม CSV_HEADERS (รองรับ Excel สลับคอลัมน์) */
function rowToStandardCols(headerRow: string[] | null, row: string[]): string[] {
  const cols = new Array(CSV_HEADERS.length).fill('');

  if (headerRow && headerMatchesPosTemplate(headerRow)) {
    for (let i = 0; i < CSV_HEADERS.length; i++) {
      cols[i] = row[i] ?? '';
    }
    return cols;
  }

  const colMap = headerRow ? buildHeaderColumnMap(headerRow) : null;
  if (colMap) {
    colMap.forEach((targetIdx, sourceIdx) => {
      cols[targetIdx] = row[sourceIdx] ?? '';
    });
    return cols;
  }

  row.forEach((val, i) => {
    if (i < cols.length) cols[i] = val;
  });
  return cols;
}

export type ParseImportResult = {
  items: QueueItem[];
  skipped: number;
  totalRows: number;
  source?: 'csv' | 'xlsx';
  sheetName?: string;
};

export function parseRowsToQueueItems(rows: string[][]): ParseImportResult {
  if (rows.length === 0) {
    return { items: [], skipped: 0, totalRows: 0 };
  }

  const hasHeader = isHeaderRow(rows[0]);
  const headerRow = hasHeader ? rows[0] : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const items: QueueItem[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const cols = rowToStandardCols(headerRow, row);
    const item = csvRowToQueueItem(cols);
    if (item) items.push(item);
    else skipped += 1;
  }

  return { items, skipped, totalRows: dataRows.length };
}

export function parseCsvToQueueItems(text: string): ParseImportResult {
  const rows = parseCSVText(text.trim());
  return { ...parseRowsToQueueItems(rows), source: 'csv' };
}

export function parseXlsxArrayBuffer(buffer: ArrayBuffer): ParseImportResult {
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('ไฟล์ไม่มีชีต');

  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const rows = sheetRowsToGrid(raw);

  return {
    ...parseRowsToQueueItems(rows),
    source: 'xlsx',
    sheetName,
  };
}

export function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.xlsm') ||
    file.type.includes('spreadsheet') ||
    file.type === 'application/vnd.ms-excel'
  );
}

export interface ImportApplyResult {
  queue: QueueItem[];
  stats: { appended: number; updated: number; unchanged: number };
}

/**
 * นำเข้าไฟล์หลัก (ไฟล์เดียว): แทนที่เฉพาะรายการจากไฟล์เดิมในคิว
 * · barcode ตรง → อัปเดตแถวเดิม (คง id)
 * · รายการจากหน้าบ้าน (ใหม่) คงอยู่ท้ายคิว ไม่ถูกทับ
 */
export function applyCsvImport(
  existing: QueueItem[],
  imported: QueueItem[]
): ImportApplyResult {
  const manualItems = existing.filter(isManualQueueItem);
  const fileItems = existing.filter(i => !isManualQueueItem(i));

  const fileByBarcode = new Map<string, QueueItem>();
  for (const item of fileItems) {
    const bc = item.barcode.trim();
    if (bc) fileByBarcode.set(bc, item);
  }

  const newFileQueue: QueueItem[] = [];
  let updated = 0;
  let unchanged = 0;
  let appended = 0;

  for (const row of imported) {
    const bc = row.barcode.trim();
    const prev = bc ? fileByBarcode.get(bc) : undefined;
    const merged: QueueItem = prev
      ? {
          ...row,
          id: prev.id,
          csvCols: row.csvCols ?? prev.csvCols,
          fileBaselineCols: row.fileBaselineCols ?? captureFileBaselineCols(row.csvCols ?? []),
        }
      : { ...row };

    if (!prev) {
      appended++;
      newFileQueue.push({ ...merged, status: 'unchanged' });
      continue;
    }

    if (itemDataEqual(prev, merged)) {
      unchanged++;
      newFileQueue.push({ ...merged, status: 'unchanged' });
    } else {
      updated++;
      newFileQueue.push({ ...merged, status: 'updated' });
    }
  }

  return {
    queue: [...newFileQueue, ...manualItems],
    stats: { appended, updated, unchanged },
  };
}

/** ตัวอย่าง header สำหรับดาวน์โหลด template */
export function csvTemplateText(): string {
  const header = CSV_HEADERS.map(h => `"${h}"`).join(',');
  const sample = [
    '',
    'อื่นๆ',
    '8851234567890',
    'สินค้าเดี่ยว',
    'ตัวอย่างสินค้า',
    'Sample Product',
    'ตัวอย่างสินค้า',
    'Sample Product',
    'ชิ้น',
    'ราคาปกติ',
    '99',
    '0.00',
    '',
    '',
    'N',
    'N',
    'N',
    '0',
    '0',
    '0',
    '0',
  ]
    .map(c => `"${c}"`)
    .join(',');
  return `${header}\n${sample}`;
}
