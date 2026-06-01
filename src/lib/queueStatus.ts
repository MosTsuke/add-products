import { normalizeBasePrice, QueueItem } from './storage';

/** new = เพิ่มจากหน้าบ้าน · unchanged = จากไฟล์หลัก · updated = แก้หลังนำเข้า/ในตาราง */
export type QueueItemStatus = 'new' | 'updated' | 'unchanged';

export const QUEUE_DATA_KEYS: (keyof QueueItem)[] = [
  'barcode',
  'category',
  'productType',
  'nameTH',
  'nameEN',
  'descTH',
  'descEN',
  'unit',
  'priceType',
  'basePrice',
];

export const STATUS_LABELS: Record<
  QueueItemStatus,
  { label: string; short: string; className: string }
> = {
  new: { label: 'ใหม่ (เพิ่มจากหน้าบ้าน)', short: 'ใหม่', className: 'queue-status--new' },
  updated: { label: 'แก้ไขแล้ว', short: 'แก้ไข', className: 'queue-status--updated' },
  unchanged: { label: 'เดิม (จากไฟล์)', short: 'เดิม', className: 'queue-status--unchanged' },
};

/** รายการที่เพิ่มจากฟอร์มหน้าบ้าน (ไม่ใช่จากไฟล์หลัก) */
export function isManualQueueItem(item: QueueItem): boolean {
  return item.status === 'new';
}

export function itemDataEqual(a: QueueItem, b: QueueItem): boolean {
  return QUEUE_DATA_KEYS.every(k => {
    const av = String(a[k] ?? '').trim();
    const bv = String(b[k] ?? '').trim();
    if (k === 'basePrice') return normalizeBasePrice(av) === normalizeBasePrice(bv);
    return av === bv;
  });
}

export interface QueueStatusStats {
  new: number;
  updated: number;
  unchanged: number;
}

/** แปลงคิวเก่า: manual→new, นำเข้าเคยติด new→unchanged */
export function migrateQueueItems(items: QueueItem[]): QueueItem[] {
  const migrated = items.map(item => {
    const raw = item.status as string | undefined;
    let next = item;
    if (raw === 'manual') next = { ...next, status: 'new' as const };
    else if (item.status === 'new' && !item.csvCols) {
      next = { ...next, status: 'unchanged' as const };
    }
    const bp = normalizeBasePrice(next.basePrice);
    if (bp !== next.basePrice) {
      next = { ...next, basePrice: bp };
      if (next.csvCols?.length) {
        const cols = [...next.csvCols];
        cols[10] = bp;
        next = { ...next, csvCols: cols };
      }
    }
    return next;
  });
  const file = migrated.filter(i => !isManualQueueItem(i));
  const manual = migrated.filter(isManualQueueItem);
  return [...file, ...manual];
}

export function countQueueStatus(items: QueueItem[]): QueueStatusStats {
  const stats: QueueStatusStats = { new: 0, updated: 0, unchanged: 0 };
  for (const item of items) {
    const s = item.status;
    if (!s) continue;
    stats[s]++;
  }
  return stats;
}

/** หลังแก้ในตาราง — เทียบกับ snapshot ตอนเปิด */
export function applyStatusAfterTableEdit(baseline: QueueItem[], draft: QueueItem[]): QueueItem[] {
  const baseById = new Map(baseline.map(i => [i.id, i]));
  return draft.map(item => {
    const base = baseById.get(item.id);
    if (!base) return { ...item, status: 'new' as const };
    if (!itemDataEqual(base, item)) {
      const status = base.status === 'new' ? 'new' : 'updated';
      return { ...item, status };
    }
    return { ...item, status: base.status ?? 'unchanged' };
  });
}
