import { generateQueueId } from './csvImport';
import { buildCsvColsFromItem, QueueItem } from './storage';

export interface ManualRowDefaults {
  category?: string;
  productType?: string;
  unit?: string;
  priceType?: string;
}

/** แถวใหม่จากตาราง (สถานะ ใหม่ — ต่อท้ายคิว) */
export function createManualQueueItem(defaults?: ManualRowDefaults): QueueItem {
  const item: QueueItem = {
    id: generateQueueId(),
    barcode: '',
    category: defaults?.category ?? 'อื่นๆ',
    productType: defaults?.productType ?? 'สินค้าเดี่ยว',
    nameTH: '',
    nameEN: '',
    descTH: '',
    descEN: '',
    unit: defaults?.unit ?? 'ชิ้น',
    priceType: defaults?.priceType ?? 'ราคาปกติ',
    basePrice: '0.00',
    status: 'new',
  };
  return { ...item, csvCols: buildCsvColsFromItem(item) };
}
