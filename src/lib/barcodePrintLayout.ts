import { BarcodePrintRow, queueItemToPrintRow, sortQueueItemsForBarcodePrint } from './barcodePrintSheet';
import { QueueItem } from './storage';

export interface BarcodePrintGroup {
  id: string;
  name: string;
}

export interface BarcodePrintLayout {
  groups: BarcodePrintGroup[];
  assignments: Record<string, string>;
  /** ลำดับ item ภายในแต่ละกลุ่ม (item.id) */
  orderByGroup: Record<string, string[]>;
}

function newGroupId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** สร้างกลุ่มจากหมวดหมู่ของรายการที่เลือก (ค่าเริ่มต้น) */
export function createDefaultBarcodePrintLayout(items: QueueItem[]): BarcodePrintLayout {
  const sorted = sortQueueItemsForBarcodePrint(items, 'category');
  const groups: BarcodePrintGroup[] = [];
  const assignments: Record<string, string> = {};
  const orderByGroup: Record<string, string[]> = {};
  const catToId = new Map<string, string>();

  for (const item of sorted) {
    const cat = item.category.trim() || '(ไม่มีหมวดหมู่)';
    let gid = catToId.get(cat);
    if (!gid) {
      gid = newGroupId();
      groups.push({ id: gid, name: cat });
      catToId.set(cat, gid);
      orderByGroup[gid] = [];
    }
    assignments[item.id] = gid;
    orderByGroup[gid].push(item.id);
  }

  if (groups.length === 0) {
    const gid = newGroupId();
    groups.push({ id: gid, name: 'กลุ่ม 1' });
    orderByGroup[gid] = [];
  }

  return { groups, assignments, orderByGroup };
}

function uniqueInOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** ตัดกลุ่ม/การจัดที่ไม่ตรงรายการที่เลือกแล้ว */
export function syncBarcodePrintLayout(
  layout: BarcodePrintLayout,
  itemIds: string[],
): BarcodePrintLayout {
  const groups = layout.groups.length
    ? layout.groups
    : [{ id: newGroupId(), name: 'กลุ่ม 1' }];
  const defaultId = groups[0].id;
  const assignments: Record<string, string> = {};
  const groupIds = new Set(groups.map(g => g.id));

  for (const id of itemIds) {
    const gid = layout.assignments[id];
    assignments[id] = gid && groupIds.has(gid) ? gid : defaultId;
  }

  const orderByGroup: Record<string, string[]> = {};
  const inputOrder = uniqueInOrder(itemIds);
  for (const g of groups) {
    const existing = layout.orderByGroup?.[g.id] ?? [];
    const keep = existing.filter(id => assignments[id] === g.id);
    const keepSet = new Set(keep);
    const missing = inputOrder.filter(id => assignments[id] === g.id && !keepSet.has(id));
    orderByGroup[g.id] = [...keep, ...missing];
  }

  return { groups, assignments, orderByGroup };
}

export function buildBarcodePrintRowsFromLayout(
  items: QueueItem[],
  layout: BarcodePrintLayout,
): BarcodePrintRow[] {
  const synced = syncBarcodePrintLayout(layout, items.map(i => i.id));
  const rows: BarcodePrintRow[] = [];

  for (const group of synced.groups) {
    const header = group.name.trim() || '(กลุ่มว่าง)';
    const byId = new Map(items.map(i => [i.id, i]));
    const orderedIds = synced.orderByGroup[group.id] ?? [];
    for (const id of orderedIds) {
      const item = byId.get(id);
      if (!item) continue;
      rows.push({
        ...queueItemToPrintRow(item),
        category: header,
      });
    }
  }

  return rows;
}

export function addBarcodePrintGroup(layout: BarcodePrintLayout): BarcodePrintLayout {
  const g: BarcodePrintGroup = { id: newGroupId(), name: `กลุ่ม ${layout.groups.length + 1}` };
  return {
    ...layout,
    groups: [...layout.groups, g],
    orderByGroup: { ...layout.orderByGroup, [g.id]: [] },
  };
}

export function removeBarcodePrintGroup(
  layout: BarcodePrintLayout,
  groupId: string,
): BarcodePrintLayout | null {
  if (layout.groups.length <= 1) return null;
  const fallback = layout.groups.find(g => g.id !== groupId)?.id;
  if (!fallback) return null;
  const groups = layout.groups.filter(g => g.id !== groupId);
  const assignments = { ...layout.assignments };
  for (const [itemId, gid] of Object.entries(assignments)) {
    if (gid === groupId) assignments[itemId] = fallback;
  }
  const orderByGroup = { ...layout.orderByGroup };
  const moved = orderByGroup[groupId] ?? [];
  delete orderByGroup[groupId];
  orderByGroup[fallback] = uniqueInOrder([...(orderByGroup[fallback] ?? []), ...moved]);

  return syncBarcodePrintLayout({ groups, assignments, orderByGroup }, Object.keys(assignments));
}

export function moveBarcodePrintGroup(
  layout: BarcodePrintLayout,
  groupId: string,
  dir: -1 | 1,
): BarcodePrintLayout {
  const idx = layout.groups.findIndex(g => g.id === groupId);
  if (idx < 0) return layout;
  const next = idx + dir;
  if (next < 0 || next >= layout.groups.length) return layout;
  const groups = [...layout.groups];
  [groups[idx], groups[next]] = [groups[next], groups[idx]];
  return { ...layout, groups };
}

export function assignBarcodePrintItemToGroup(
  layout: BarcodePrintLayout,
  itemId: string,
  groupId: string,
): BarcodePrintLayout {
  const prevGroup = layout.assignments[itemId];
  if (prevGroup === groupId) return layout;
  const assignments = { ...layout.assignments, [itemId]: groupId };
  const orderByGroup = { ...layout.orderByGroup };

  if (prevGroup && orderByGroup[prevGroup]) {
    orderByGroup[prevGroup] = orderByGroup[prevGroup].filter(id => id !== itemId);
  }
  orderByGroup[groupId] = uniqueInOrder([...(orderByGroup[groupId] ?? []), itemId]);

  return { ...layout, assignments, orderByGroup };
}

export function setBarcodePrintGroupOrder(
  layout: BarcodePrintLayout,
  groupId: string,
  orderedItemIds: string[],
): BarcodePrintLayout {
  return {
    ...layout,
    orderByGroup: { ...layout.orderByGroup, [groupId]: uniqueInOrder(orderedItemIds) },
  };
}
