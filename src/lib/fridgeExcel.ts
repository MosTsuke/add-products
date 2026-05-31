import * as XLSX from 'xlsx';
import type { FridgeConfig, FridgeLayout, FridgeSlotItem } from './fridgeStorage';
import { slotKey } from './fridgeStorage';

// ============================================================
// Export layout → Excel
// ============================================================
export function exportFridgeLayout(config: FridgeConfig, layout: FridgeLayout, filename = 'fridge-layout.xlsx') {
  const rows: string[][] = [['ประตู', 'ชั้น', 'Slot', 'ชื่อสินค้า', 'Barcode', 'หมวดหมู่']];

  for (const door of config.doors) {
    for (const shelf of door.shelves) {
      for (let i = 0; i < shelf.slots; i++) {
        const key = slotKey(door.id, shelf.id, i);
        const item = layout[key];
        rows.push([
          door.name,
          shelf.name,
          String(i + 1),
          item?.name ?? '',
          item?.barcode ?? '',
          item?.category ?? '',
        ]);
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 36 }, { wch: 16 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Layout');
  XLSX.writeFile(wb, filename);
}

// ============================================================
// Export config → Excel (for backup/restore)
// ============================================================
export function exportFridgeConfig(config: FridgeConfig, filename = 'fridge-config.xlsx') {
  const rows: string[][] = [['ประตู ID', 'ประตู', 'ชั้น ID', 'ชั้น', 'จำนวน Slot']];
  for (const door of config.doors) {
    for (const shelf of door.shelves) {
      rows.push([door.id, door.name, shelf.id, shelf.name, String(shelf.slots)]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Config');
  XLSX.writeFile(wb, filename);
}

// ============================================================
// Import layout from Excel
// ============================================================
export async function importFridgeLayout(
  file: File,
  config: FridgeConfig
): Promise<{ layout: FridgeLayout; imported: number; skipped: number }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];

  // Build lookup maps
  const doorByName = new Map(config.doors.map(d => [d.name, d]));
  const shelfByName = new Map(
    config.doors.flatMap(d => d.shelves.map(s => [`${d.id}__${s.name}`, s]))
  );

  const layout: FridgeLayout = {};
  let imported = 0;
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const [doorName, shelfName, slotStr, name, barcode, category] = rows[r].map(c => String(c ?? '').trim());
    const door = doorByName.get(doorName);
    if (!door) { skipped++; continue; }
    const shelf = shelfByName.get(`${door.id}__${shelfName}`);
    if (!shelf) { skipped++; continue; }
    const slotIdx = parseInt(slotStr) - 1;
    if (isNaN(slotIdx) || slotIdx < 0 || slotIdx >= shelf.slots) { skipped++; continue; }

    const item: FridgeSlotItem | null = name ? { name, barcode: barcode || undefined, category: category || undefined } : null;
    layout[slotKey(door.id, shelf.id, slotIdx)] = item;
    imported++;
  }

  return { layout, imported, skipped };
}
