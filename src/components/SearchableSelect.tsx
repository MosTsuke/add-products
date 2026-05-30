'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

interface SearchableSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  prependOptions?: string[];
  disabled?: boolean;
  /** ใช้ในตาราง — ไม่แสดง label, ขนาดกะทัดรัด */
  compact?: boolean;
  /** tooltip เมื่อชี้ — มักใส่ค่าที่เลือกเต็มๆ */
  inputTitle?: string;
  /** map ของ option → ref number เพื่อแสดง dot สี (0=gray, 1=blue, 2=orange) */
  optionMeta?: Map<string, number>;
  /** ซ่อน label element (ใช้เมื่อ parent render label เอง) */
  hideLabel?: boolean;
}

const REF_COLORS: Record<number, string> = {
  0: '#9ca3af',
  1: '#3b82f6',
  2: '#f97316',
};

function RefDot({ storeRef, inline = false }: { storeRef: number; inline?: boolean }) {
  const color = REF_COLORS[storeRef] ?? REF_COLORS[0];
  return (
    <span
      className={inline ? 'searchable-select-ref-dot--inline' : 'searchable-select-ref-dot'}
      style={{ background: color }}
      aria-hidden
    />
  );
}

export default function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'พิมพ์เพื่อค้นหา…',
  prependOptions = [],
  disabled = false,
  compact = false,
  inputTitle,
  optionMeta,
  hideLabel = false,
}: SearchableSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const allOptions = useMemo(() => {
    const merged = [...prependOptions];
    for (const o of options) {
      if (!merged.includes(o)) merged.push(o);
    }
    if (value && !merged.includes(value)) merged.unshift(value);
    return merged;
  }, [options, prependOptions, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(o => o.toLowerCase().includes(q));
  }, [allOptions, query]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const select = (opt: string) => {
    onChange(opt);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[highlight]) select(filtered[highlight]);
      else if (!open) setOpen(true);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div
      ref={rootRef}
      className={`${compact ? '' : 'field '}searchable-select${compact ? ' searchable-select--compact' : ''}${open ? ' searchable-select--open' : ''}${disabled ? ' searchable-select--disabled' : ''}`}
    >
      {!compact && !hideLabel && <label htmlFor={listId}>{label}</label>}
      <div className={`searchable-select-control${optionMeta && !open && value && optionMeta.has(value) ? ' searchable-select-control--has-dot' : ''}`}>
        {optionMeta && !open && value && optionMeta.has(value)
          ? <RefDot storeRef={optionMeta.get(value)!} />
          : <Search size={15} strokeWidth={2} className="searchable-select-search-icon" aria-hidden />
        }
        <input
          ref={inputRef}
          id={listId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-listbox`}
          aria-autocomplete="list"
          aria-label={compact ? label : undefined}
          value={open ? query : value}
          placeholder={value || placeholder}
          disabled={disabled}
          onChange={e => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onKeyDown={onKeyDown}
          title={inputTitle}
        />
        {open && query && (
          <button
            type="button"
            className="searchable-select-clear"
            onClick={() => setQuery('')}
            aria-label="ล้างการค้นหา"
            tabIndex={-1}
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          className="searchable-select-chevron"
          onClick={() => {
            if (disabled) return;
            setOpen(o => !o);
            if (!open) {
              setQuery('');
              inputRef.current?.focus();
            }
          }}
          aria-label={open ? 'ปิดรายการ' : 'เปิดรายการ'}
          tabIndex={-1}
          disabled={disabled}
        >
          <ChevronDown size={16} strokeWidth={2} className={open ? 'searchable-select-chevron-up' : ''} />
        </button>
      </div>

      {open && !disabled && (
        <ul
          id={`${listId}-listbox`}
          role="listbox"
          className="searchable-select-list"
        >
          {filtered.length === 0 ? (
            <li className="searchable-select-empty" role="option" aria-disabled>
              ไม่พบรายการ
            </li>
          ) : (
            filtered.map((opt, i) => (
              <li
                key={opt}
                role="option"
                aria-selected={opt === value}
                className={`searchable-select-option${opt === value ? ' searchable-select-option--selected' : ''}${i === highlight ? ' searchable-select-option--highlight' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => select(opt)}
              >
                {optionMeta?.has(opt) && <RefDot storeRef={optionMeta.get(opt)!} inline />}
                <span>{opt}</span>
                {opt === value && <Check size={14} strokeWidth={2.5} aria-hidden />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
