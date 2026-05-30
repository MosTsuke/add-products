import { normalizeBarcodeInput } from './barcodeInput';
import { patchQueueItemField, QueueItem, storage } from './storage';

/** prefix + เลขรัน 10 หลัก = 13 หลักเรียงต่อเนื่อง */
export const BARCODE_RUN_PREFIX = '200';
const RUN_DIGITS = 10;
const NEW_RUN_RE = new RegExp(`^${BARCODE_RUN_PREFIX}(\\d{10})$`);

export function formatRunBarcode(serial: number): string {
  const runPart = String(serial).padStart(RUN_DIGITS, '0');
  return BARCODE_RUN_PREFIX + runPart;
}

/** เฉพาะรูปแบบใหม่ 200 + 10 หลัก (ใช้นับเลขรัน) */
export function parseNewRunSerial(barcode: string): number | null {
  const m = normalizeBarcodeInput(barcode).match(NEW_RUN_RE);
  return m ? parseInt(m[1], 10) : null;
}

/** barcode ที่ระบบสร้าง (prefix 200 + เลขรัน 10 หลัก) */
export function isGeneratedRunBarcode(barcode: string): boolean {
  return parseNewRunSerial(barcode) != null;
}

export function maxRunSerialInBarcodes(barcodes: Iterable<string>): number {
  let max = 0;
  for (const bc of barcodes) {
    const s = parseNewRunSerial(bc);
    if (s != null) max = Math.max(max, s);
  }
  return max;
}

export function maxRunSerialInQueue(items: QueueItem[]): number {
  return maxRunSerialInBarcodes(items.map(i => i.barcode));
}

/**
 * ซิงค์ตัวนับรันกับคิว
 * · ไม่มี barcode รูปแบบ 200xxxxxxxxxx ในคิว → เริ่มที่ 1 (ไม่ใช้เลขค้างในเครื่อง)
 * · มีในคิวแล้ว → ต่อจากเลขสูงสุดในคิว
 */
export function syncBarcodeRunCounter(items: QueueItem[]): number {
  const fromQueue = maxRunSerialInQueue(items);
  const synced = fromQueue > 0 ? fromQueue : 0;
  storage.setBarcodeRun(synced);
  return synced;
}

export function resetBarcodeRunCounter(): void {
  storage.setBarcodeRun(0);
}

export function getBarcodeRunCounter(): number {
  return storage.getBarcodeRun();
}

export function peekNextRunBarcode(): string {
  return formatRunBarcode(storage.getBarcodeRun() + 1);
}

export function collectUsedBarcodes(items: QueueItem[]): Set<string> {
  const used = new Set<string>();
  for (const item of items) {
    const bc = normalizeBarcodeInput(item.barcode);
    if (bc) used.add(bc);
  }
  return used;
}

/** เลขรันล่าสุดที่ใช้แล้ว — อิงคิวก่อน (ไม่ใช้เลขค้างใน localStorage ที่สูงกว่าคิว) */
function baseRunSerial(items: QueueItem[]): number {
  const fromQueue = maxRunSerialInQueue(items);
  if (fromQueue > 0) return fromQueue;
  return storage.getBarcodeRun();
}

/** เลขรันถัดไปจากคิว (ไม่เขียน storage — ปลอดภัยใน React Strict Mode) */
export function peekNextRunFromQueue(items: QueueItem[]): string {
  return formatRunBarcode(baseRunSerial(items) + 1);
}

/** ใส่ barcode ให้แถวเดียว — ไม่เขียน storage */
export function patchSingleRunBarcode(
  items: QueueItem[],
  id: string
): QueueItem[] {
  const target = items.find(i => i.id === id);
  if (!target || target.barcode.trim()) return items;

  const used = collectUsedBarcodes(items);
  let run = baseRunSerial(items) + 1;
  let code = formatRunBarcode(run);
  while (used.has(code)) {
    run += 1;
    code = formatRunBarcode(run);
  }

  return items.map(item =>
    item.id === id ? patchQueueItemField(item, 'barcode', code) : item
  );
}

/**
 * สร้างหลายแถวในรอบเดียว — เลขรัน +1 ต่อเนื่อง (ไม่ recalc max ทุกแถว, ไม่เขียน storage)
 */
export function patchSequentialRunBarcodes(
  allItems: QueueItem[],
  targets: QueueItem[]
): { items: QueueItem[]; assigned: number; first?: string; last?: string } {
  const used = collectUsedBarcodes(allItems);
  let run = baseRunSerial(allItems);
  const byId = new Map<string, string>();
  let first: string | undefined;
  let last: string | undefined;

  for (const item of targets) {
    if (item.barcode.trim()) continue;
    run += 1;
    let code = formatRunBarcode(run);
    while (used.has(code)) {
      run += 1;
      code = formatRunBarcode(run);
    }
    used.add(code);
    byId.set(item.id, code);
    if (!first) first = code;
    last = code;
  }

  const items = allItems.map(item => {
    const bc = byId.get(item.id);
    return bc ? patchQueueItemField(item, 'barcode', bc) : item;
  });

  return { items, assigned: byId.size, first, last };
}

/** สร้างหลายแถว + ซิงค์ตัวนับ (ใช้นอก setState updater) */
export function assignSequentialRunBarcodes(
  allItems: QueueItem[],
  targets: QueueItem[]
): { items: QueueItem[]; assigned: number; first?: string; last?: string } {
  const result = patchSequentialRunBarcodes(allItems, targets);
  syncBarcodeRunCounter(result.items);
  return result;
}

export function itemsWithoutBarcode(items: QueueItem[]): QueueItem[] {
  return items.filter(i => !i.barcode.trim());
}

/**
 * เรียงแถวที่จะ Gen ทั้งหมด — ต่อจากแถวที่มีเลขรัน 200… สูงสุดในคิว
 * แถวล่าง (index มากกว่า) ก่อน แล้วค่อยแถวบนที่ยังว่าง
 */
export function sortBarcodeTargetsFromAnchor(
  allItems: QueueItem[],
  targets: QueueItem[]
): QueueItem[] {
  const idToIdx = new Map(allItems.map((it, i) => [it.id, i]));
  let anchorIdx = -1;
  let maxSerial = 0;
  for (const item of allItems) {
    const s = parseNewRunSerial(item.barcode);
    if (s != null && s >= maxSerial) {
      maxSerial = s;
      anchorIdx = idToIdx.get(item.id) ?? -1;
    }
  }
  const sorted = [...targets].sort(
    (a, b) => (idToIdx.get(a.id) ?? 0) - (idToIdx.get(b.id) ?? 0)
  );
  if (anchorIdx < 0) return sorted;

  const atOrBelow: QueueItem[] = [];
  const above: QueueItem[] = [];
  for (const t of sorted) {
    if ((idToIdx.get(t.id) ?? 0) >= anchorIdx) atOrBelow.push(t);
    else above.push(t);
  }
  return [...atOrBelow, ...above];
}

/** ข้อความอธิบายเลขรันถัดไป */
export function describeNextRunBarcode(items: QueueItem[]): string {
  const maxInQueue = maxRunSerialInQueue(items);
  const next = peekNextRunFromQueue(items);
  if (maxInQueue === 0) {
    return `ถัดไป ${next} (เริ่มเลขรัน 1)`;
  }
  return `ในคิวสูงสุดเลขรัน ${maxInQueue} → ถัดไป ${next}`;
}
