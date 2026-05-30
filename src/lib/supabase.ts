import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

export type DropdownType = 'category' | 'product_type' | 'unit' | 'price_type';

export async function fetchOptions(type: DropdownType): Promise<string[]> {
  const { data, error } = await supabase
    .from('dropdown_options')
    .select('value')
    .eq('type', type)
    .order('value');
  if (error) throw error;
  return data.map((r: { value: string }) => r.value);
}

export async function addOption(type: DropdownType, value: string): Promise<void> {
  const { error } = await supabase
    .from('dropdown_options')
    .insert({ type, value });
  if (error) throw error;
}

export async function addOptions(type: DropdownType, values: string[]): Promise<void> {
  if (values.length === 0) return;
  const { error } = await supabase
    .from('dropdown_options')
    .insert(values.map(value => ({ type, value })));
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
