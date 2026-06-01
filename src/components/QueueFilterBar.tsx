'use client';
import { Filter, Search, X } from 'lucide-react';
import {
  countByQueueFilter,
  getQueueSearchFieldLabel,
  QUEUE_FILTERS,
  QUEUE_SEARCH_FIELDS,
  searchFieldPlaceholder,
  type QueueFilterId,
  type QueueSearchFieldId,
} from '@/lib/queueFilters';
import { QueueItem } from '@/lib/storage';

interface QueueFilterBarProps {
  items: QueueItem[];
  filter: QueueFilterId;
  onFilterChange: (id: QueueFilterId) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** กดค้นหาย้ำ (ไม่เปลี่ยน logic เดิม แค่บังคับ re-run ได้) */
  onSearchSubmit?: () => void;
  searchField: QueueSearchFieldId;
  onSearchFieldChange: (field: QueueSearchFieldId) => void;
  filteredCount: number;
  compact?: boolean;
}

export default function QueueFilterBar({
  items,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  searchField,
  onSearchFieldChange,
  filteredCount,
  compact,
}: QueueFilterBarProps) {
  const counts = countByQueueFilter(items);
  const hasSearch = !!searchQuery.trim();
  const showSummary = filter !== 'all' || hasSearch;

  return (
    <div
      className={`queue-filter-bar${compact ? ' queue-filter-bar--compact' : ''}`}
      role="group"
      aria-label="กรองและค้นหารายการ"
    >
      <div className="queue-filter-search-row">
        <label className="queue-filter-search-field-label" htmlFor="queue-search-field">
          ค้นหาใน
        </label>
        <select
          id="queue-search-field"
          className="queue-filter-search-select"
          value={searchField}
          onChange={e => onSearchFieldChange(e.target.value as QueueSearchFieldId)}
          aria-label="เลือกหัวข้อที่จะค้นหา"
        >
          {QUEUE_SEARCH_FIELDS.map(f => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <label className="queue-filter-search-wrap">
          <Search size={14} strokeWidth={2} aria-hidden className="queue-filter-search-icon" />
          <input
            type="search"
            className="queue-filter-search-input"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={searchFieldPlaceholder(searchField)}
            aria-label={`ค้นหา${getQueueSearchFieldLabel(searchField)}`}
          />
          {hasSearch && (
            <button
              type="button"
              className="queue-filter-search-clear"
              onClick={() => onSearchChange('')}
              aria-label="ล้างคำค้นหา"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </label>
        {onSearchSubmit && (
          <button
            type="button"
            className="queue-filter-search-btn"
            onClick={onSearchSubmit}
            aria-label="ค้นหาย้ำ"
            title="ค้นหาย้ำ"
          >
            <Search size={14} strokeWidth={2} aria-hidden />
            ค้นหา
          </button>
        )}
      </div>
      <div className="queue-filter-chips">
        {QUEUE_FILTERS.map(f => {
          const n = counts[f.id];
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              className={`queue-filter-chip${active ? ' queue-filter-chip--active' : ''}${n === 0 && f.id !== 'all' ? ' queue-filter-chip--empty' : ''}`}
              onClick={() => onFilterChange(f.id)}
              aria-pressed={active}
              disabled={f.id !== 'all' && n === 0}
            >
              {f.label}
              <span className="queue-filter-chip-count">{n}</span>
            </button>
          );
        })}
      </div>
      {showSummary && (
        <p className="queue-filter-summary">
          แสดง <strong>{filteredCount}</strong> จาก {items.length} รายการ
          {hasSearch && (
            <span className="queue-filter-summary-search">
              {' '}
              · {getQueueSearchFieldLabel(searchField)}: &quot;{searchQuery.trim()}&quot;
            </span>
          )}
        </p>
      )}
    </div>
  );
}
