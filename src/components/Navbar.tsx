'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const path = usePathname();
  return (
    <nav>
      <span className="brand">🛒 POS Lookup</span>
      <Link href="/" className={path === '/' ? 'active' : ''}>เพิ่มสินค้า</Link>
      <Link href="/fridge" className={path?.startsWith('/fridge') ? 'active' : ''}>🧊 ตู้เย็น</Link>
      <Link href="/settings" className={path === '/settings' ? 'active' : ''}>ตั้งค่า</Link>
    </nav>
  );
}
