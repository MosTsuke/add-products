import { isGeneratedRunBarcode } from './barcodeGenerate';
import JsBarcode from 'jsbarcode';
import { QueueItem } from './storage';

export interface BarcodePrintRow {
  category: string;
  nameTH: string;
  barcode: string;
}

export type BarcodePrintSort = 'category' | 'selection';

export function queueItemToPrintRow(item: QueueItem): BarcodePrintRow {
  return {
    category: item.category.trim() || '(ไม่มีหมวดหมู่)',
    nameTH: item.nameTH.trim() || '(ไม่มีชื่อ)',
    barcode: item.barcode.trim(),
  };
}

/** เรียงป้ายก่อนพิมพ์ — category: ตามหมวดแล้วชื่อสินค้า · selection: ลำดับในคิว */
export function sortQueueItemsForBarcodePrint(
  items: QueueItem[],
  sort: BarcodePrintSort,
  queueOrder?: QueueItem[]
): QueueItem[] {
  if (sort === 'selection' && queueOrder?.length) {
    const orderIndex = new Map(queueOrder.map((item, index) => [item.id, index]));
    return [...items].sort(
      (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)
    );
  }
  if (sort === 'selection') return items;
  return [...items].sort((a, b) => {
    const cat = a.category.trim().localeCompare(b.category.trim(), 'th');
    if (cat !== 0) return cat;
    return a.nameTH.trim().localeCompare(b.nameTH.trim(), 'th');
  });
}

export function buildBarcodePrintRows(
  items: QueueItem[],
  sort: BarcodePrintSort = 'category',
  queueOrder?: QueueItem[]
): BarcodePrintRow[] {
  return sortQueueItemsForBarcodePrint(items, sort, queueOrder).map(queueItemToPrintRow);
}

/** รายการในคิวที่มีเลข barcode — ใช้แสดงใน modal เลือกพิมพ์ */
export function getPrintableQueueItems(items: QueueItem[]): QueueItem[] {
  return items.filter(i => i.barcode.trim());
}

export function queueItemsToPrintRows(items: QueueItem[]): BarcodePrintRow[] {
  return getPrintableQueueItems(items).map(queueItemToPrintRow);
}

/** เฉพาะ barcode ที่ระบบสร้าง (200 + เลขรัน) — ค่าเริ่มต้นเมื่อเลือกใน modal */
export function getItemsForBarcodePrint(items: QueueItem[]): BarcodePrintRow[] {
  return items.filter(i => isGeneratedRunBarcode(i.barcode)).map(queueItemToPrintRow);
}

export function countBarcodePrintStats(items: QueueItem[]) {
  let generated = 0;
  let noBarcode = 0;
  let otherBarcode = 0;

  for (const item of items) {
    if (isGeneratedRunBarcode(item.barcode)) generated += 1;
    else if (!item.barcode.trim()) noBarcode += 1;
    else otherBarcode += 1;
  }

  return {
    generated,
    noBarcode,
    otherBarcode,
    total: items.length,
  };
}

function renderBarcodeSvg(barcode: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, barcode, {
    format: 'CODE128',
    width: 1.1,
    height: 30,
    displayValue: true,
    fontSize: 10,
    margin: 2,
    background: '#ffffff',
  });
  return new XMLSerializer().serializeToString(svg);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML สำหรับพิมพ์ / แสดงตัวอย่างใน iframe */
export function buildBarcodePrintHtml(
  rows: BarcodePrintRow[],
  title = 'ป้าย Barcode',
  options?: { oneGroupPerPage?: boolean }
): string {
  return buildPrintHtml(rows, title, options);
}

function renderLabel(row: BarcodePrintRow): string {
  const svg = renderBarcodeSvg(row.barcode);
  return `
      <div class="label">
        <p class="product">${escapeHtml(row.nameTH)}</p>
        <div class="barcode">${svg}</div>
      </div>`;
}

function groupRowsByCategory(rows: BarcodePrintRow[]): { category: string; rows: BarcodePrintRow[] }[] {
  const groups: { category: string; rows: BarcodePrintRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (!last || last.category !== row.category) {
      groups.push({ category: row.category, rows: [row] });
    } else {
      last.rows.push(row);
    }
  }
  return groups;
}

/** ความสูงโดยประมาณ (mm) สำหรับจัดหน้า A4 — ให้ตรงกับ CSS ด้านล่าง */
const PAGE_INNER_HEIGHT_MM = 267;
const CATEGORY_HEADER_MM = 14;
const BLOCK_GAP_MM = 6;
const LABEL_ROW_MM = 27;
const LABELS_PER_ROW = 3;

interface PageChunk {
  category: string;
  continued: boolean;
  rows: BarcodePrintRow[];
}

interface PrintPage {
  chunks: PageChunk[];
}

function labelRowCount(labelCount: number): number {
  return Math.ceil(labelCount / LABELS_PER_ROW);
}

function chunkHeightMm(labelCount: number, withHeader: boolean, withBlockGap: boolean): number {
  return (
    (withBlockGap ? BLOCK_GAP_MM : 0) +
    (withHeader ? CATEGORY_HEADER_MM : 0) +
    labelRowCount(labelCount) * LABEL_ROW_MM
  );
}

function paginateBarcodeGroups(
  groups: { category: string; rows: BarcodePrintRow[] }[],
  options?: { oneGroupPerPage?: boolean }
): PrintPage[] {
  const pages: PrintPage[] = [{ chunks: [] }];
  let usedOnPage = 0;

  const startNewPage = () => {
    pages.push({ chunks: [] });
    usedOnPage = 0;
  };

  const currentPage = () => pages[pages.length - 1];

  for (const group of groups) {
    if (options?.oneGroupPerPage && currentPage().chunks.length > 0) {
      startNewPage();
    }
    let remaining = group.rows;
    let isFirstChunkOfCategory = true;

    while (remaining.length > 0) {
      const withBlockGap = currentPage().chunks.length > 0;
      let available = PAGE_INNER_HEIGHT_MM - usedOnPage;
      if (withBlockGap) available -= BLOCK_GAP_MM;

      const headerCost = CATEGORY_HEADER_MM;
      const spaceForLabels = available - headerCost;

      if (spaceForLabels < LABEL_ROW_MM) {
        startNewPage();
        continue;
      }

      const maxRows = Math.floor(spaceForLabels / LABEL_ROW_MM);
      const take = Math.min(remaining.length, maxRows * LABELS_PER_ROW);
      if (take <= 0) {
        startNewPage();
        continue;
      }

      const chunkRows = remaining.slice(0, take);
      remaining = remaining.slice(take);

      currentPage().chunks.push({
        category: group.category,
        continued: !isFirstChunkOfCategory,
        rows: chunkRows,
      });

      usedOnPage += chunkHeightMm(chunkRows.length, true, withBlockGap);
      isFirstChunkOfCategory = false;
    }
  }

  return pages.filter(p => p.chunks.length > 0);
}

export function countBarcodePrintPages(rows: BarcodePrintRow[], options?: { oneGroupPerPage?: boolean }): number {
  if (rows.length === 0) return 0;
  return paginateBarcodeGroups(groupRowsByCategory(rows), options).length;
}

function renderPageChunk(chunk: PageChunk): string {
  const cont = chunk.continued
    ? ` <span class="sheet-category-cont">(ต่อ)</span>`
    : '';
  return `
    <section class="category-block">
      <h2 class="sheet-category">${escapeHtml(chunk.category)}${cont}</h2>
      <div class="labels">${chunk.rows.map(renderLabel).join('')}</div>
    </section>`;
}

function buildPrintHtml(rows: BarcodePrintRow[], title: string, options?: { oneGroupPerPage?: boolean }): string {
  const pages = paginateBarcodeGroups(groupRowsByCategory(rows), options);
  const totalPages = pages.length;

  const pagesHtml = pages
    .map(
      (page, index) => `
  <div class="print-page" data-page="${index + 1}">
    <div class="print-page-inner">
      ${page.chunks.map(renderPageChunk).join('')}
    </div>
    <div class="print-page-num">หน้า ${index + 1} / ${totalPages}</div>
  </div>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html {
      margin: 0;
      padding: 0;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: "Sarabun", "Segoe UI", sans-serif;
      font-size: 10pt;
      color: #111;
      background: #cbd5e1;
    }
    .print-pages {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 16px 0 24px;
    }
    .print-page {
      width: 210mm;
      height: 297mm;
      padding: 15mm;
      background: #fff;
      box-shadow: 0 6px 28px rgba(15, 23, 42, 0.14);
      position: relative;
      overflow: hidden;
      flex-shrink: 0;
    }
    .print-page-inner {
      height: 100%;
      overflow: hidden;
    }
    .print-page-num {
      position: absolute;
      right: 12mm;
      bottom: 8mm;
      font-size: 8pt;
      color: #94a3b8;
      pointer-events: none;
    }
    .category-block + .category-block {
      margin-top: ${BLOCK_GAP_MM}mm;
    }
    .sheet-category {
      margin: 0 0 4mm;
      padding: 0 0 2mm;
      font-size: 12pt;
      font-weight: 700;
      text-align: center;
      border-bottom: 0.4mm solid #cbd5e1;
      line-height: 1.3;
    }
    .sheet-category-cont {
      font-size: 10pt;
      font-weight: 600;
      color: #64748b;
    }
    .labels {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 3mm 4mm;
    }
    .label {
      border: 0.3mm dashed #bbb;
      border-radius: 2mm;
      padding: 2mm 1.5mm 1.5mm;
      text-align: center;
      min-height: 24mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
    }
    .product {
      margin: 0 0 1.5mm;
      font-size: 7.5pt;
      font-weight: 600;
      line-height: 1.2;
      max-height: 9mm;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      width: 100%;
    }
    .barcode svg {
      max-width: 92%;
      height: auto;
    }
    @media print {
      body {
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .print-pages {
        gap: 0;
        padding: 0;
      }
      .print-page {
        box-shadow: none;
        margin: 0;
        page-break-after: always;
        break-after: page;
      }
      .print-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .print-page-num {
        color: #bbb;
      }
    }
  </style>
</head>
<body>
  <div class="print-pages" aria-label="${escapeHtml(title)} · ${rows.length} ป้าย · ${totalPages} หน้า">${pagesHtml}</div>
</body>
</html>`;
}

/** เปิดหน้าต่างพิมพ์ (A4) */
export function openBarcodePrintPreview(
  rows: BarcodePrintRow[],
  title = 'ป้าย Barcode',
  options?: { oneGroupPerPage?: boolean }
): void {
  if (rows.length === 0) return;
  const html = buildBarcodePrintHtml(rows, title, options);
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต popup แล้วลองอีกครั้ง');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.onload = () => {
    setTimeout(() => w.print(), 300);
  };
}

/** ดาวน์โหลดไฟล์ Word เปิดใน Word / Google Docs ได้ */
export function downloadBarcodePrintDoc(
  rows: BarcodePrintRow[],
  filename?: string,
  title = 'ป้าย Barcode',
  options?: { oneGroupPerPage?: boolean }
): void {
  if (rows.length === 0) return;
  const body = buildBarcodePrintHtml(rows, title, options);
  const wordHtml = `\ufeff${body.replace(
    '<html lang="th">',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="th">'
  )}`;

  const blob = new Blob([wordHtml], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    filename ??
    `barcode-labels-${new Date().toISOString().slice(0, 10)}-${rows.length}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}
