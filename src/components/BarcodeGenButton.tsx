'use client';
import { Sparkles } from 'lucide-react';

interface BarcodeGenButtonProps {
  onClick: () => void;
  label?: string;
  compact?: boolean;
  title?: string;
}

export default function BarcodeGenButton({
  onClick,
  label = 'Gen',
  compact,
  title = 'สร้าง barcode อัตโนมัติ',
}: BarcodeGenButtonProps) {
  return (
    <button
      type="button"
      className={`barcode-gen-btn${compact ? ' barcode-gen-btn--compact' : ''}`}
      onClick={onClick}
      title={title}
    >
      <Sparkles size={compact ? 12 : 14} strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}
