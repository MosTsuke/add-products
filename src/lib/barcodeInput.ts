import type { ChangeEvent, KeyboardEvent } from 'react';

/** แปลงตัวเลขไทย / ตัวอักษรรบกวนจาก IME ให้เหลือรูปแบบ barcode */
export function normalizeBarcodeInput(raw: string): string {
  const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
  let s = raw;
  for (let i = 0; i < 10; i++) {
    s = s.replaceAll(thaiDigits[i], String(i));
  }
  // ตัวเลขเต็มความกว้าง
  s = s.replace(/[\uFF10-\uFF19]/g, ch => String(ch.charCodeAt(0) - 0xff10));
  // เก็บเฉพาะที่ใช้ใน barcode ทั่วไป
  return s.replace(/[^\dA-Za-z.\-_/]/g, '');
}

/**
 * อ่านจาก event.code (ตำแหน่งปุ่มจริง) — ไม่ขึ้นกับภาษาคีย์บอร์ด
 * สแกนเนอร์ส่งเหมือนพิมพ์ US keyboard แม้ระบบตั้งเป็นไทย
 */
export function barcodeCharFromKeyEvent(e: KeyboardEvent): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;

  const { code } = e;

  if (code.startsWith('Digit')) {
    return code.slice(5);
  }

  if (code.startsWith('Numpad')) {
    const k = code.slice(6);
    if (k === 'Decimal') return '.';
    if (/^\d$/.test(k)) return k;
    return null;
  }

  if (code.startsWith('Key')) {
    const letter = code.slice(3);
    return e.shiftKey ? letter.toUpperCase() : letter.toLowerCase();
  }

  const map: Record<string, string> = {
    Minus: '-',
    Equal: e.shiftKey ? '+' : '=',
    BracketLeft: e.shiftKey ? '{' : '[',
    BracketRight: e.shiftKey ? '}' : ']',
    Backslash: e.shiftKey ? '|' : '\\',
    Semicolon: e.shiftKey ? ':' : ';',
    Quote: e.shiftKey ? '"' : "'",
    Comma: e.shiftKey ? '<' : ',',
    Period: '.',
    Slash: e.shiftKey ? '?' : '/',
    Space: ' ',
  };

  return map[code] ?? null;
}

export function isBarcodeEnter(e: KeyboardEvent): boolean {
  return e.code === 'Enter' || e.code === 'NumpadEnter';
}

const BARCODE_NAV_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Home',
  'End',
]);

/** สำหรับ input ในตาราง / ฟอร์ม — รองรับสแกนเนอร์เมื่อคีย์บอร์ดเป็นไทย */
export function handleBarcodeInputKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  currentValue: string,
  setValue: (next: string) => void,
  options?: { onEnter?: () => void }
): void {
  const ne = e.nativeEvent;

  if (isBarcodeEnter(ne)) {
    e.preventDefault();
    options?.onEnter?.();
    return;
  }

  if (BARCODE_NAV_KEYS.has(ne.key) || ne.key.startsWith('Arrow')) return;

  const ch = barcodeCharFromKeyEvent(ne);
  if (ch !== null) {
    e.preventDefault();
    const piece = normalizeBarcodeInput(ch);
    if (piece) setValue(normalizeBarcodeInput(currentValue + piece));
  }
}

export function handleBarcodeInputChange(
  e: ChangeEvent<HTMLInputElement>,
  setValue: (next: string) => void
): void {
  setValue(normalizeBarcodeInput(e.target.value));
}
