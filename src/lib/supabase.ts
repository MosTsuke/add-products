import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

export type DropdownType = 'category' | 'product_type' | 'unit' | 'price_type';

/** ref: 0=ทั้งหมด · 1=ร้านแรก · 2=ร้านที่สอง */
export interface CategoryOption {
  value: string;
  ref: number;
}

export const STORE_REF_LABELS: Record<number, string> = {
  0: 'ทั้งหมด',
  1: 'ร้านแรก',
  2: 'ร้านที่สอง',
};

/** สีของแต่ละ ref (Tailwind-style hex) */
export const STORE_REF_COLORS: Record<number, string> = {
  0: '#9ca3af', // gray-400
  1: '#3b82f6', // blue-500
  2: '#f97316', // orange-500
};

/** index คอลัมน์ หมวดหมู่สินค้า ใน CSV / ตารางภาพรวม */
export const CATEGORY_CSV_COL_INDEX = 1;

/** กรองรายการหมวดหมู่ตามร้าน (0 = ทั้งหมด, ref 0 = ใช้ร่วมทุกร้าน) */
export function filterCategoriesByStoreRef(
  categories: string[],
  categoryRefMap: Map<string, number> | undefined,
  storeFilter: number,
): string[] {
  if (storeFilter === 0 || !categoryRefMap?.size) return categories;
  return categories.filter(c => {
    const r = categoryRefMap.get(c) ?? 0;
    return r === 0 || r === storeFilter;
  });
}

export async function fetchOptions(type: DropdownType): Promise<string[]> {
  const { data, error } = await supabase
    .from('dropdown_options')
    .select('value')
    .eq('type', type)
    .order('value');
  if (error) throw error;
  return data.map((r: { value: string }) => r.value);
}

/** โหลด category พร้อม ref */
export async function fetchCategoryOptions(): Promise<CategoryOption[]> {
  const { data, error } = await supabase
    .from('dropdown_options')
    .select('value, ref')
    .eq('type', 'category')
    .order('value');
  if (error) throw error;
  return data.map((r: { value: string; ref: number }) => ({
    value: r.value,
    ref: r.ref ?? 0,
  }));
}

export async function addOption(
  type: DropdownType,
  value: string,
  ref = 0
): Promise<void> {
  const row: Record<string, unknown> = { type, value };
  if (type === 'category') row.ref = ref;
  const { error } = await supabase.from('dropdown_options').insert(row);
  if (error) throw error;
}

export async function addOptions(
  type: DropdownType,
  values: string[],
  ref = 0
): Promise<void> {
  if (values.length === 0) return;
  const rows = values.map(value => {
    const row: Record<string, unknown> = { type, value };
    if (type === 'category') row.ref = ref;
    return row;
  });
  const { error } = await supabase.from('dropdown_options').insert(rows);
  if (error) throw error;
}

/** แก้ ref ของ category ที่มีอยู่แล้ว */
export async function updateCategoryRef(value: string, ref: number): Promise<void> {
  const { error } = await supabase
    .from('dropdown_options')
    .update({ ref })
    .eq('type', 'category')
    .eq('value', value);
  if (error) throw error;
}

export async function deleteOption(type: DropdownType, value: string): Promise<void> {
  const { error } = await supabase
    .from('dropdown_options')
    .delete()
    .eq('type', type)
    .eq('value', value);
  if (error) throw error;
}
