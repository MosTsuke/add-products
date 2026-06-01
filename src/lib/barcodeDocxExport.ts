import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import {
  BarcodePrintOptions,
  BarcodePrintRow,
  barcodePngBytes,
  getBarcodePrintPages,
  renderBarcodeToCanvas,
} from './barcodePrintSheet';

const LABELS_PER_ROW = 3;

/** แปลง mm → twips (DXA) ให้ตรงกับ CSS หน้าพิมพ์ */
function mmToDxa(mm: number): number {
  return Math.round((mm / 25.4) * 1440);
}

/** A4 + margin 15mm ตาม .print-page { padding: 15mm } */
const PAGE_WIDTH_DXA = 11906;
const PAGE_MARGIN_DXA = mmToDxa(15);
const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - PAGE_MARGIN_DXA * 2;
const COL_WIDTH_DXA = Math.floor(CONTENT_WIDTH_DXA / LABELS_PER_ROW);
const COLUMN_WIDTHS = Array.from({ length: LABELS_PER_ROW }, () => COL_WIDTH_DXA);

/** ป้าย min-height 24mm, บาร์โค้ด max-height 15mm — ตาม CSS หน้าเว็บ */
const LABEL_MIN_HEIGHT_DXA = mmToDxa(24);
const MAX_BARCODE_HEIGHT_PT = Math.round((15 / 25.4) * 72);
const MAX_BARCODE_WIDTH_PT = Math.floor(COL_WIDTH_DXA / 20) - 6;

const LABEL_CELL_MARGIN = {
  marginUnitType: WidthType.DXA,
  top: mmToDxa(2),
  bottom: mmToDxa(1.5),
  left: mmToDxa(1.5),
  right: mmToDxa(1.5),
};

const dashedCellBorder = {
  top: { style: BorderStyle.DASHED, size: 1, color: 'BBBBBB' },
  bottom: { style: BorderStyle.DASHED, size: 1, color: 'BBBBBB' },
  left: { style: BorderStyle.DASHED, size: 1, color: 'BBBBBB' },
  right: { style: BorderStyle.DASHED, size: 1, color: 'BBBBBB' },
};

const labelCellWidth = { size: COL_WIDTH_DXA, type: WidthType.DXA };

function emptyLabelCell(): TableCell {
  return new TableCell({
    width: labelCellWidth,
    margins: LABEL_CELL_MARGIN,
    children: [new Paragraph({ children: [new TextRun('')] })],
  });
}

/** ชื่อสินค้า + รูปบาร์โค้ด (PNG จาก jsbarcode — มีเลขใต้แท่งเหมือนหน้าเว็บ) */
function labelCell(row: BarcodePrintRow): TableCell {
  const canvas = renderBarcodeToCanvas(row.barcode);
  const png = barcodePngBytes(row.barcode);
  const imgW = Math.min(MAX_BARCODE_WIDTH_PT, canvas.width);
  const imgH = Math.min(
    MAX_BARCODE_HEIGHT_PT,
    Math.max(28, Math.round((canvas.height / canvas.width) * imgW))
  );

  return new TableCell({
    width: labelCellWidth,
    verticalAlign: VerticalAlign.CENTER,
    margins: LABEL_CELL_MARGIN,
    borders: dashedCellBorder,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: row.nameTH,
            bold: true,
            size: 15,
            font: 'Sarabun',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: png,
            transformation: { width: imgW, height: imgH },
          }),
        ],
      }),
    ],
  });
}

function labelTable(rows: BarcodePrintRow[]): Table {
  const tableRows: TableRow[] = [];
  for (let i = 0; i < rows.length; i += LABELS_PER_ROW) {
    const cells: TableCell[] = [];
    for (let c = 0; c < LABELS_PER_ROW; c++) {
      const item = rows[i + c];
      cells.push(item ? labelCell(item) : emptyLabelCell());
    }
    tableRows.push(
      new TableRow({
        children: cells,
        height: { value: LABEL_MIN_HEIGHT_DXA, rule: HeightRule.ATLEAST },
      })
    );
  }

  return new Table({
    columnWidths: COLUMN_WIDTHS,
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    layout: 'fixed',
    rows: tableRows,
  });
}

function categoryHeading(text: string, spacingBefore: number): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: spacingBefore, after: 80 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 6,
        color: 'CBD5E1',
        space: 4,
      },
    },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        font: 'Sarabun',
      }),
    ],
  });
}

function pageNumberParagraph(current: number, total: number): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 200 },
    children: [
      new TextRun({
        text: `หน้า ${current} / ${total}`,
        size: 16,
        color: '94A3B8',
        font: 'Sarabun',
      }),
    ],
  });
}

function buildDocxChildren(rows: BarcodePrintRow[], options?: BarcodePrintOptions) {
  const pages = getBarcodePrintPages(rows, options);
  const totalPages = pages.length;
  const blocks: (Paragraph | Table)[] = [];

  pages.forEach((page, pageIdx) => {
    if (pageIdx > 0) {
      blocks.push(new Paragraph({ children: [new PageBreak()] }));
    }
    page.chunks.forEach((chunk, chunkIdx) => {
      const heading = chunk.continued ? `${chunk.category} (ต่อ)` : chunk.category;
      const gapBefore =
        pageIdx === 0 && chunkIdx === 0 ? 0 : chunkIdx === 0 ? mmToDxa(0) : mmToDxa(6);
      blocks.push(categoryHeading(heading, gapBefore));
      if (chunk.rows.length > 0) {
        blocks.push(labelTable(chunk.rows));
      }
    });
    blocks.push(pageNumberParagraph(pageIdx + 1, totalPages));
  });

  return blocks;
}

/** ดาวน์โหลดไฟล์ Word (.docx) — layout + บาร์โค้ดเหมือนหน้าพิมพ์ในแอป */
export async function downloadBarcodePrintDoc(
  rows: BarcodePrintRow[],
  filename?: string,
  title = 'ป้าย Barcode',
  options?: BarcodePrintOptions
): Promise<void> {
  if (rows.length === 0) return;

  const doc = new Document({
    title,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: PAGE_MARGIN_DXA,
              right: PAGE_MARGIN_DXA,
              bottom: PAGE_MARGIN_DXA,
              left: PAGE_MARGIN_DXA,
            },
          },
        },
        children: buildDocxChildren(rows, options),
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    filename ??
    `barcode-labels-${new Date().toISOString().slice(0, 10)}-${rows.length}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
