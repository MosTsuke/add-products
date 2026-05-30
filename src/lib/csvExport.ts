import * as XLSX from 'xlsx';
import { CSV_HEADERS, itemToCSVCols, QueueItem } from './storage';

const DEFAULT_SHEET_NAME = 'Sheet1';

export function buildQueueSheetData(items: QueueItem[]): string[][] {
  return [CSV_HEADERS, ...items.map(item => itemToCSVCols(item))];
}

/** ดาวน์โหลดคิวเป็นไฟล์ Excel (.xlsx) */
export function downloadQueueExcel(
  items: QueueItem[],
  filename?: string,
  sheetName = DEFAULT_SHEET_NAME
): void {
  if (items.length === 0) return;

  const ws = XLSX.utils.aoa_to_sheet(buildQueueSheetData(items));
  const wb = XLSX.utils.book_new();
  const safeSheet = sheetName.slice(0, 31) || DEFAULT_SHEET_NAME;
  XLSX.utils.book_append_sheet(wb, ws, safeSheet);

  const base =
    filename ??
    `pos-export-${new Date().toISOString().slice(0, 10)}-${items.length}`;
  const name = base.toLowerCase().endsWith('.xlsx') ? base : `${base}.xlsx`;
  XLSX.writeFile(wb, name);
}

/** ดาวน์โหลด template หัวคอลัมน์สำหรับกรอกใน Excel */
export function downloadQueueTemplateExcel(): void {
  const ws = XLSX.utils.aoa_to_sheet([CSV_HEADERS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, DEFAULT_SHEET_NAME);
  XLSX.writeFile(wb, 'pos-product-template.xlsx');
}
