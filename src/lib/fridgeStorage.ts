// Fridge Management — all data stored in localStorage (no expiry)

// ============================================================
// Types
// ============================================================

export interface FridgeSlotItem {
  name: string;
  barcode?: string;
  category?: string;
  shape?: import('@/components/FridgeShapeIcon').SlotShape;
  quantity?: number; // par level (full stock)
}

export interface FridgeShelf {
  id: string;
  name: string;   // e.g. "ชั้น 1"
  slots: number;  // 4–9
}

export interface FridgeDoor {
  id: string;
  name: string;   // e.g. "ประตู 1"
  shelves: FridgeShelf[];
}

export interface FridgeConfig {
  doors: FridgeDoor[];
}

/** key: `${doorId}__${shelfId}__${slotIndex}` */
export type FridgeLayout = Record<string, FridgeSlotItem | null>;

export interface RestockItem {
  slotKey: string;
  doorId: string;
  doorName: string;
  shelfId: string;
  shelfName: string;
  slotIndex: number;
  productName: string;
  count: number;
  /** เช็คแล้วว่าเติมเสร็จ */
  checked?: boolean;
}

// ============================================================
// localStorage keys
// ============================================================
const KEY_CONFIG = 'fridge_config';
const KEY_LAYOUT = 'fridge_layout';

// ============================================================
// Helpers
// ============================================================
function ls<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

// ============================================================
// Default config — 3 doors, 5/4/4 shelves, 6 slots each
// ============================================================
export function defaultFridgeConfig(): FridgeConfig {
  return {
    doors: [
      {
        id: 'd1',
        name: 'ประตู 1',
        shelves: [
          { id: 'd1s1', name: 'ชั้น 1', slots: 6 },
          { id: 'd1s2', name: 'ชั้น 2', slots: 6 },
          { id: 'd1s3', name: 'ชั้น 3', slots: 6 },
          { id: 'd1s4', name: 'ชั้น 4', slots: 6 },
          { id: 'd1s5', name: 'ชั้น 5', slots: 6 },
        ],
      },
      {
        id: 'd2',
        name: 'ประตู 2',
        shelves: [
          { id: 'd2s1', name: 'ชั้น 1', slots: 6 },
          { id: 'd2s2', name: 'ชั้น 2', slots: 6 },
          { id: 'd2s3', name: 'ชั้น 3', slots: 6 },
          { id: 'd2s4', name: 'ชั้น 4', slots: 6 },
        ],
      },
      {
        id: 'd3',
        name: 'ประตู 3',
        shelves: [
          { id: 'd3s1', name: 'ชั้น 1', slots: 6 },
          { id: 'd3s2', name: 'ชั้น 2', slots: 6 },
          { id: 'd3s3', name: 'ชั้น 3', slots: 6 },
          { id: 'd3s4', name: 'ชั้น 4', slots: 6 },
        ],
      },
    ],
  };
}

// ============================================================
// Config CRUD
// ============================================================
export function getFridgeConfig(): FridgeConfig {
  const saved = ls<FridgeConfig | null>(KEY_CONFIG, null);
  return saved ?? defaultFridgeConfig();
}

export function saveFridgeConfig(config: FridgeConfig) {
  lsSet(KEY_CONFIG, config);
}

// ============================================================
// Layout CRUD
// ============================================================
export function getFridgeLayout(): FridgeLayout {
  return ls<FridgeLayout>(KEY_LAYOUT, {});
}

export function saveFridgeLayout(layout: FridgeLayout) {
  lsSet(KEY_LAYOUT, layout);
}

/** ใช้หลังโหลดจาก DB — เขียนลง localStorage ของเครื่องนี้ */
export function applyFridgeSnapshot(config: FridgeConfig, layout: FridgeLayout) {
  saveFridgeConfig(config);
  saveFridgeLayout(layout);
}

export function slotKey(doorId: string, shelfId: string, slotIndex: number): string {
  return `${doorId}__${shelfId}__${slotIndex}`;
}

export function setSlotItem(
  layout: FridgeLayout,
  doorId: string,
  shelfId: string,
  slotIndex: number,
  item: FridgeSlotItem | null
): FridgeLayout {
  const next = { ...layout, [slotKey(doorId, shelfId, slotIndex)]: item };
  saveFridgeLayout(next);
  return next;
}
