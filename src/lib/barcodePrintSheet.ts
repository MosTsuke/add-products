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

/** รูปแบบที่สแกนเนอร์ร้านรับบ่อย — เลข 13 หลักใช้ EAN-13 */
function jsBarcodeFormat(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (digits.length === 13) return 'EAN13';
  if (digits.length === 8) return 'EAN8';
  return 'CODE128';
}

const BARCODE_CANVAS_OPTS = {
  width: 2,
  height: 44,
  displayValue: true,
  fontSize: 11,
  margin: 6,
  background: '#ffffff',
};

export function renderBarcodeToCanvas(barcode: string): HTMLCanvasElement {
  const code = barcode.trim();
  const canvas = document.createElement('canvas');
  const format = jsBarcodeFormat(code);
  try {
    JsBarcode(canvas, code, { ...BARCODE_CANVAS_OPTS, format });
  } catch {
    JsBarcode(canvas, code, { ...BARCODE_CANVAS_OPTS, format: 'CODE128' });
  }
  return canvas;
}

export function barcodePngBytes(barcode: string): Uint8Array {
  const dataUrl = renderBarcodeToCanvas(barcode).toDataURL('image/png');
  const base64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** เรนเดอร์เป็น PNG สำหรับ HTML พิมพ์ */
function renderBarcodeMarkup(barcode: string, extraImgAttrs = ''): string {
  const code = barcode.trim();
  if (!code) return '';
  const canvas = renderBarcodeToCanvas(code);
  const w = canvas.width;
  const h = canvas.height;
  const src = canvas.toDataURL('image/png');
  const extra = extraImgAttrs ? ` ${extraImgAttrs}` : '';
  return `<img class="barcode-img" src="${src}" width="${w}" height="${h}" alt="${escapeHtml(code)}" decoding="sync"${extra} />`;
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
  const markup = renderBarcodeMarkup(row.barcode);
  return `
      <div class="label">
        <p class="product">${escapeHtml(row.nameTH)}</p>
        <div class="barcode">${markup}</div>
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

export function getBarcodePrintPages(rows: BarcodePrintRow[], options?: BarcodePrintOptions) {
  return paginateBarcodeGroups(groupRowsByCategory(rows), options);
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
    .barcode {
      flex: 1;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      width: 100%;
      min-height: 0;
    }
    .barcode-img {
      display: block;
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 15mm;
      object-fit: contain;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }
    @media print {
      body {
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .barcode-img {
        max-width: 100%;
        max-height: 15mm;
        image-rendering: crisp-edges;
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

export type BarcodePrintOptions = { oneGroupPerPage?: boolean };

function writeHtmlToIframe(iframe: HTMLIFrameElement, html: string): Window | null {
  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) return null;
  doc.open();
  doc.write(html);
  doc.close();
  return win;
}

/** พิมพ์ผ่าน iframe ซ่อน — ไม่ต้องเปิด popup (มักถูกบล็อกบนมือถือ/Vercel) */
export function printBarcodeLabels(
  rows: BarcodePrintRow[],
  title = 'ป้าย Barcode',
  options?: BarcodePrintOptions
): boolean {
  if (rows.length === 0) return false;
  const html = buildBarcodePrintHtml(rows, title, options);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', title);
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(iframe);

  const win = writeHtmlToIframe(iframe, html);
  if (!win) {
    iframe.remove();
    return false;
  }

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 2000);
  };

  const doPrint = () => {
    try {
      win.focus();
      win.print();
      cleanup();
    } catch {
      cleanup();
    }
  };

  iframe.onload = () => window.setTimeout(doPrint, 200);
  window.setTimeout(doPrint, 400);

  return true;
}

/** พิมพ์จาก iframe ที่มี HTML อยู่แล้ว (เช่น ตัวอย่างใน modal) */
export function printBarcodeFromIframe(iframe: HTMLIFrameElement | null): boolean {
  if (!iframe?.contentWindow) return false;
  try {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    return true;
  } catch {
    return false;
  }
}

/** เปิดหน้าต่างพิมพ์ (A4) — ลอง iframe ก่อน แล้วค่อย popup */
export function openBarcodePrintPreview(
  rows: BarcodePrintRow[],
  title = 'ป้าย Barcode',
  options?: BarcodePrintOptions
): void {
  if (rows.length === 0) return;
  if (printBarcodeLabels(rows, title, options)) return;

  const html = buildBarcodePrintHtml(rows, title, options);
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) {
    alert(
      'พิมพ์ไม่สำเร็จ — ลองกด "ดาวน์โหลด Word" แล้วเปิดไฟล์จากนั้น หรืออนุญาต popup ของเว็บนี้แล้วลองอีกครั้ง'
    );
    return;
  }
  w.document.write(html);
  w.document.close();
  w.onload = () => {
    setTimeout(() => w.print(), 300);
  };
}

