import { supabase } from './supabase';
import type { FridgeConfig, FridgeLayout } from './fridgeStorage';

export const FRIDGE_ACTIVE_STORE_KEY = 'fridge_active_store_name';

export interface FridgeStoreListItem {
  id: string;
  name: string;
  updated_at: string;
}

export async function listFridgeStores(): Promise<FridgeStoreListItem[]> {
  const { data, error } = await supabase
    .from('fridge_stores')
    .select('id, name, updated_at')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function loadFridgeStore(name: string): Promise<{ config: FridgeConfig; layout: FridgeLayout }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('กรุณาเลือกหรือระบุชื่อร้าน');

  const { data, error } = await supabase
    .from('fridge_stores')
    .select('config, layout')
    .eq('name', trimmed)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`ไม่พบ "${trimmed}" บนระบบ — ลองบันทึกจากเครื่องตั้งค่าก่อน`);

  return {
    config: data.config as FridgeConfig,
    layout: (data.layout ?? {}) as FridgeLayout,
  };
}

export async function saveFridgeStore(
  name: string,
  config: FridgeConfig,
  layout: FridgeLayout,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('กรุณาระบุชื่อร้าน');

  const { error } = await supabase.from('fridge_stores').upsert(
    {
      name: trimmed,
      config,
      layout,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'name' },
  );

  if (error) throw error;
}

export async function deleteFridgeStore(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('กรุณาระบุชื่อร้าน');

  const { error } = await supabase.from('fridge_stores').delete().eq('name', trimmed);
  if (error) throw error;
}

export function getActiveFridgeStoreName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(FRIDGE_ACTIVE_STORE_KEY);
}

export function setActiveFridgeStoreName(name: string | null) {
  if (typeof window === 'undefined') return;
  if (name?.trim()) localStorage.setItem(FRIDGE_ACTIVE_STORE_KEY, name.trim());
  else localStorage.removeItem(FRIDGE_ACTIVE_STORE_KEY);
}
