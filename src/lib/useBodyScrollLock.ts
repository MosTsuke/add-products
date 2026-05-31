import { useEffect } from 'react';

let lockCount = 0;
let savedBodyOverflow = '';
let savedHtmlOverflow = '';

/** ป้องกัน scroll พื้นหลังเมื่อมี modal เปิด (รองรับหลาย modal พร้อมกัน) */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    if (lockCount === 0) {
      savedBodyOverflow = document.body.style.overflow;
      savedHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = savedBodyOverflow;
        document.documentElement.style.overflow = savedHtmlOverflow;
      }
    };
  }, [locked]);
}
