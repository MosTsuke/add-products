/** จำนวนชุดสีหัวประตู (วนซ้ำถ้ามีประตูมากกว่านี้) */
export const FRIDGE_DOOR_TONE_COUNT = 6;

export function fridgeDoorToneClass(index: number): string {
  const tone = ((index % FRIDGE_DOOR_TONE_COUNT) + FRIDGE_DOOR_TONE_COUNT) % FRIDGE_DOOR_TONE_COUNT;
  return `fridge-door--tone-${tone}`;
}

export function fridgeDoorToneIndexForDoorId(doorId: string, doorIdsInOrder: readonly string[]): number {
  const idx = doorIdsInOrder.indexOf(doorId);
  return idx >= 0 ? idx : 0;
}

/** สีข้อความตำแหน่ง (ประตู · ชั้น) ให้ตรงโทนหัวประตู */
export function fridgeDoorPosToneClass(
  doorIndex: number,
  base: 'fridge-restock-item-pos' | 'fridge-qty-pos',
): string {
  const tone = ((doorIndex % FRIDGE_DOOR_TONE_COUNT) + FRIDGE_DOOR_TONE_COUNT) % FRIDGE_DOOR_TONE_COUNT;
  return `${base} ${base}--tone-${tone}`;
}
