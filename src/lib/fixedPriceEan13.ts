import { normalizeBarcodeInput } from './barcodeInput';
import { normalizeBasePrice, patchQueueItemField, QueueItem } from './storage';

/** หมวดหมู่ป้ายราคากำหนด (ใช้กรองตาราง / modal พิมพ์) */
export const PRODUCT_PRICE_CATEGORY = 'ราคาสินค้า';

/** 29 = in-store · 99 = รหัสหมวดพิเศษ */
export const FIXED_PRICE_EAN_PREFIX = '2999';

const RESERVED_SUFFIX = '0000';

/** ตัวอย่างสำหรับแสดงในตาราง — แปลงจาก P-code เป็นหลัก */
export const FIXED_PRICE_EAN_EXAMPLES = [
  { p: 'P0010', ean: '2999001000006', baht: 10 },
  { p: 'P0100', ean: '2999010000002', baht: 100 },
  { p: 'P0400', ean: '2999040000008', baht: 400 },
] as const;

export const FIXED_PRICE_EAN_HELP_LINES = [
  'gen barcode กำหนดราคา แปลงจาก barcode แบบ P ในช่อง (เช่น P0010) → EAN-13 เลข 13 หลัก',
  'รูปแบบ: 29 (ในร้าน) + 99 (หมวดพิเศษ) + ราคา 4 หลักหลัง P + 0000 + check digit',
  'ใส่ P-code ก่อนแล้วกด gen — ราคา 500 บาท ใช้ P0500',
] as const;

/**
 * ตัวอย่างที่ระบุไว้ — ใช้เมื่อตรง P-code เท่านั้น
 * · P0010 (0010) = 10 บาท · P0100 (0100) = 100 บาท — ห้ามใช้ EAN เดียวกัน
 */
const EXACT_LEGACY_P_EAN13: Readonly<Record<string, string>> = {
  P0002: '2999000200008',
  P0005: '2999000500007',
  P0010: '2999001000006',
  P0400: '2999040000008',
};

export function isProductPriceCategoryItem(item: Pick<QueueItem, 'category'>): boolean {
  return item.category.trim() === PRODUCT_PRICE_CATEGORY;
}

/** barcode ราคาแบบเดิม P + ตัวเลข (เช่น P0400) */
export function isLegacyPricePBarcode(barcode: string): boolean {
  const bc = normalizeBarcodeInput(barcode);
  return /^P\d+$/.test(bc);
}

/** อ่านส่วนราคา 4 หลักจาก P-code (P0400 → 0400) */
export function parseLegacyPPrice4(barcode: string): string | null {
  const bc = normalizeBarcodeInput(barcode);
  if (!isLegacyPricePBarcode(bc)) return null;
  return bc.slice(1).padStart(4, '0');
}

/** EAN-13 กำหนดราคา — 13 หลัก รูปแบบ 2999 + ราคา 4 หลัก + 0000 + check */
export function isFixedPriceEan13(barcode: string): boolean {
  const bc = normalizeBarcodeInput(barcode);
  if (!/^\d{13}$/.test(bc)) return false;
  if (!bc.startsWith(FIXED_PRICE_EAN_PREFIX)) return false;
  if (bc.slice(8, 12) !== RESERVED_SUFFIX) return false;
  if (Object.values(EXACT_LEGACY_P_EAN13).includes(bc)) return true;
  return ean13CheckDigit(bc.slice(0, 12)) === parseInt(bc[12]!, 10);
}

/** check digit มาตรฐาน GTIN/EAN-13 (น้ำหนัก 1/3 จากซ้าย) */
export function ean13CheckDigit(data12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(data12[i]!, 10);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function formatFixedPriceEan13FromPrice4(price4: string): string {
  const p = price4.replace(/\D/g, '').padStart(4, '0').slice(-4);
  const body = `${FIXED_PRICE_EAN_PREFIX}${p}${RESERVED_SUFFIX}`;
  return body + String(ean13CheckDigit(body));
}

/** แปลง P-code → EAN-13 กำหนดราคา */
export function legacyPBarcodeToFixedPriceEan13(barcode: string): string | null {
  const bc = normalizeBarcodeInput(barcode);
  if (EXACT_LEGACY_P_EAN13[bc]) return EXACT_LEGACY_P_EAN13[bc];
  const price4 = parseLegacyPPrice4(bc);
  if (!price4) return null;
  return formatFixedPriceEan13FromPrice4(price4);
}

export function price4FromBaht(baht: number): string {
  return String(Math.round(baht)).padStart(4, '0');
}

export function parsePrice4FromFixedPriceEan13(barcode: string): string | null {
  const bc = normalizeBarcodeInput(barcode);
  if (!isFixedPriceEan13(bc)) return null;
  return bc.slice(4, 8);
}

export function parseBahtFromItem(item: Pick<QueueItem, 'basePrice'>): number | null {
  const raw = normalizeBasePrice(item.basePrice);
  if (!raw) return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 9999) return null;
  return Math.round(n);
}

/** EAN ที่ควรได้สำหรับแถวนี้ (จาก P… หรือ Base Price) */
export function resolveFixedPriceEan13ForItem(item: QueueItem): string | null {
  if (!isProductPriceCategoryItem(item)) return null;
  const bc = normalizeBarcodeInput(item.barcode);
  if (isLegacyPricePBarcode(bc)) return legacyPBarcodeToFixedPriceEan13(bc);
  const baht = parseBahtFromItem(item);
  if (baht == null) return null;
  return formatFixedPriceEan13FromPrice4(price4FromBaht(baht));
}

/** ต้องสร้าง/แก้ EAN — รวมกรณี P0100 ถูกแปลงผิดเป็น EAN ของ 10 บาท */
export function needsFixedPriceEan13Update(item: QueueItem): boolean {
  const next = resolveFixedPriceEan13ForItem(item);
  if (!next) return false;
  const current = normalizeBarcodeInput(item.barcode);
  if (!current) return true;
  if (isLegacyPricePBarcode(current)) return current !== next;
  if (isFixedPriceEan13(current)) {
    const baht = parseBahtFromItem(item);
    if (baht == null) return false;
    const embedded4 = parsePrice4FromFixedPriceEan13(current);
    return embedded4 !== price4FromBaht(baht);
  }
  return false;
}

export function canConvertToFixedPriceEan13(barcode: string): boolean {
  return legacyPBarcodeToFixedPriceEan13(barcode) != null;
}

/** @deprecated ใช้ needsFixedPriceEan13Update(item) แทน */
export function canAssignFixedPriceEan13(item: QueueItem): boolean {
  return needsFixedPriceEan13Update(item);
}

/** แปลง/แก้ barcode ในหมวดราคาสินค้า */
export function patchFixedPriceEan13Barcodes(
  allItems: QueueItem[],
  targets: QueueItem[]
): { items: QueueItem[]; assigned: number; first?: string; last?: string } {
  const byId = new Map<string, string>();
  let first: string | undefined;
  let last: string | undefined;

  for (const item of targets) {
    if (!needsFixedPriceEan13Update(item)) continue;
    const next = resolveFixedPriceEan13ForItem(item);
    if (!next) continue;
    const current = normalizeBarcodeInput(item.barcode);
    if (current === next) continue;
    byId.set(item.id, next);
    if (!first) first = next;
    last = next;
  }

  const items = allItems.map(item => {
    const code = byId.get(item.id);
    return code ? patchQueueItemField(item, 'barcode', code) : item;
  });

  return { items, assigned: byId.size, first, last };
}
