'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Store } from 'lucide-react';

export type FridgeStorePickerOption = {
  id: string;
  name: string;
  updated_at?: string;
};

function formatUpdatedAt(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('th-TH', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

export default function FridgeStorePicker({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = '— เลือกร้าน —',
}: {
  value: string;
  options: FridgeStorePickerOption[];
  onChange: (name: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = options.find(o => o.name === value);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`fridge-store-picker${open ? ' fridge-store-picker--open' : ''}${disabled ? ' fridge-store-picker--disabled' : ''}`}
    >
      <button
        type="button"
        className="fridge-store-picker-trigger"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Store size={16} className="fridge-store-picker-trigger-icon" aria-hidden />
        <span className={`fridge-store-picker-trigger-label${value ? '' : ' fridge-store-picker-trigger-label--placeholder'}`}>
          {value || placeholder}
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`fridge-store-picker-chevron${open ? ' fridge-store-picker-chevron--up' : ''}`}
          aria-hidden
        />
      </button>

      {open && !disabled && (
        <ul className="fridge-store-picker-list" role="listbox">
          {options.length === 0 ? (
            <li className="fridge-store-picker-empty" role="option" aria-disabled>
              ยังไม่มีร้านบน DB
            </li>
          ) : (
            options.map(opt => {
              const isSelected = opt.name === value;
              return (
                <li
                  key={opt.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`fridge-store-picker-option${isSelected ? ' fridge-store-picker-option--selected' : ''}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => pick(opt.name)}
                >
                  <div className="fridge-store-picker-option-main">
                    <span className="fridge-store-picker-option-name">{opt.name}</span>
                    {opt.updated_at && (
                      <span className="fridge-store-picker-option-meta">
                        อัปเดต {formatUpdatedAt(opt.updated_at)}
                      </span>
                    )}
                  </div>
                  {isSelected && <Check size={16} strokeWidth={2.5} aria-hidden />}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
