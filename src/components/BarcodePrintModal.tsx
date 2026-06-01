'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronRight, FileText, LayoutGrid, Printer, Sticker, X } from 'lucide-react';
import BarcodePrintLayoutStep from '@/components/BarcodePrintLayoutStep';
import ConfirmDialog from '@/components/ConfirmDialog';
import { isGeneratedRunBarcode } from '@/lib/barcodeGenerate';
import {
  createDefaultBarcodePrintLayout,
  buildBarcodePrintRowsFromLayout,
  syncBarcodePrintLayout,
  type BarcodePrintLayout,
} from '@/lib/barcodePrintLayout';
import {
  buildBarcodePrintHtml,
  buildBarcodePrintRows,
  countBarcodePrintPages,
  downloadBarcodePrintDoc,
  getPrintableQueueItems,
  openBarcodePrintPreview,
} from '@/lib/barcodePrintSheet';
import { QueueItem } from '@/lib/storage';

type ListFilter = 'all' | 'generated' | 'from-file' | 'selected';
type ModalStep = 'select' | 'preview' | 'layout';
type BarcodeSearchField = 'product' | 'category';

interface BarcodePrintModalProps {
  items: QueueItem[];
  onClose: () => void;
  onOpenTable?: () => void;
}

function categoryLabel(item: QueueItem): string {
  return item.category.trim() || '(ไม่มีหมวดหมู่)';
}

function matchesBarcodeSearch(
  item: QueueItem,
  field: BarcodeSearchField,
  value: string
): boolean {
  const v = value.trim();
  if (!v) return true;
  if (field === 'category') return categoryLabel(item) === v;
  const needle = v.toLowerCase();
  return (
    item.nameTH.trim().toLowerCase().includes(needle) ||
    item.nameEN.trim().toLowerCase().includes(needle)
  );
}

function matchesListFilter(
  item: QueueItem,
  filter: ListFilter,
  selectedIds: Set<string>
): boolean {
  if (filter === 'selected') return selectedIds.has(item.id);
  if (filter === 'generated') return isGeneratedRunBarcode(item.barcode);
  if (filter === 'from-file') return !isGeneratedRunBarcode(item.barcode);
  return true;
}

export default function BarcodePrintModal({
  items,
  onClose,
  onOpenTable,
}: BarcodePrintModalProps) {
  const printable = useMemo(() => getPrintableQueueItems(items), [items]);

  const defaultSelectedIds = useMemo(
    () => new Set(printable.filter(i => isGeneratedRunBarcode(i.barcode)).map(i => i.id)),
    [printable]
  );

  const [step, setStep] = useState<ModalStep>('select');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(defaultSelectedIds));
  const [searchField, setSearchField] = useState<BarcodeSearchField>('product');
  const [searchValue, setSearchValue] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [printLayout, setPrintLayout] = useState<BarcodePrintLayout | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<BarcodePrintLayout | null>(null);
  const [confirmDiscardLayout, setConfirmDiscardLayout] = useState(false);
  const [confirmCloseLayout, setConfirmCloseLayout] = useState(false);
  const [oneGroupPerPage, setOneGroupPerPage] = useState(false);
  const layoutDraftBaseRef = useRef<string>('');
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
    document.body.classList.add('barcode-print-modal-open');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('barcode-print-modal-open');
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const resizePreviewIframe = useCallback(() => {
    const iframe = previewIframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      const height = doc?.documentElement?.scrollHeight ?? doc?.body?.scrollHeight;
      if (height) iframe.style.height = `${height}px`;
    } catch {
      /* cross-origin guard */
    }
  }, []);

  useEffect(() => {
    setSelectedIds(new Set(defaultSelectedIds));
  }, [defaultSelectedIds]);

  const selectedIdsKey = useMemo(
    () => [...selectedIds].sort().join(','),
    [selectedIds],
  );

  useEffect(() => {
    setPrintLayout(null);
    setLayoutDraft(null);
  }, [selectedIdsKey]);

  useEffect(() => {
    if (step === 'preview' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [step]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of printable) set.add(categoryLabel(item));
    return [...set].sort((a, b) => a.localeCompare(b, 'th'));
  }, [printable]);

  const filtered = useMemo(
    () =>
      printable.filter(
        item =>
          matchesListFilter(item, listFilter, selectedIds) &&
          matchesBarcodeSearch(item, searchField, searchValue)
      ),
    [printable, listFilter, searchField, searchValue, selectedIds]
  );

  const selectedItems = useMemo(() => {
    const idSet = selectedIds;
    return printable.filter(i => idSet.has(i.id));
  }, [printable, selectedIds]);

  const selectedRows = useMemo(() => {
    if (printLayout) {
      return buildBarcodePrintRowsFromLayout(
        selectedItems,
        syncBarcodePrintLayout(printLayout, selectedItems.map(i => i.id)),
      );
    }
    return buildBarcodePrintRows(selectedItems, 'category', items);
  }, [selectedItems, printLayout, items]);

  const usesCustomLayout = printLayout != null;

  const pageCount = useMemo(
    () => countBarcodePrintPages(selectedRows, { oneGroupPerPage }),
    [selectedRows, oneGroupPerPage]
  );

  const previewHtml = useMemo(
    () => (selectedRows.length > 0 ? buildBarcodePrintHtml(selectedRows, 'ป้าย Barcode', { oneGroupPerPage }) : ''),
    [selectedRows, oneGroupPerPage]
  );

  useEffect(() => {
    if (step !== 'preview') return;
    const t = window.setTimeout(resizePreviewIframe, 80);
    return () => window.clearTimeout(t);
  }, [step, previewHtml, resizePreviewIframe]);

  const openLayoutStep = () => {
    const base = printLayout ?? createDefaultBarcodePrintLayout(selectedItems);
    const synced = syncBarcodePrintLayout(base, selectedItems.map(i => i.id));
    setLayoutDraft(synced);
    layoutDraftBaseRef.current = JSON.stringify(synced);
    setStep('layout');
  };

  const isLayoutDirty = useMemo(() => {
    if (!layoutDraft) return false;
    return JSON.stringify(layoutDraft) !== layoutDraftBaseRef.current;
  }, [layoutDraft]);

  const selectedInView = filtered.filter(i => selectedIds.has(i.id)).length;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every(i => selectedIds.has(i.id));

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setFilteredSelection = (select: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const item of filtered) {
        if (select) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  };

  const selectGenerated = () => {
    setSelectedIds(
      new Set(printable.filter(i => isGeneratedRunBarcode(i.barcode)).map(i => i.id))
    );
  };

  const handlePrint = () => {
    if (selectedRows.length === 0) return;
    openBarcodePrintPreview(selectedRows, 'ป้าย Barcode', { oneGroupPerPage });
  };

  const handleDownloadDoc = () => {
    if (selectedRows.length === 0) return;
    downloadBarcodePrintDoc(selectedRows, undefined, 'ป้าย Barcode', { oneGroupPerPage });
  };

  const generatedCount = printable.filter(i => isGeneratedRunBarcode(i.barcode)).length;
  const fromFileCount = printable.length - generatedCount;

  const panelClass =
    step === 'preview'
      ? 'barcode-print-modal-panel barcode-print-modal-panel--preview'
      : step === 'layout'
        ? 'barcode-print-modal-panel barcode-print-modal-panel--layout'
        : 'barcode-print-modal-panel';

  const modal = (
    <div className="barcode-print-modal" role="dialog" aria-labelledby="barcode-print-modal-title">
      <div className="barcode-print-modal-backdrop" aria-hidden />
      <div className={panelClass} onClick={e => e.stopPropagation()}>
        <header className="barcode-print-modal-header">
          <div className="barcode-print-modal-title">
            <Sticker size={22} strokeWidth={2} aria-hidden />
            <div>
              <h2 id="barcode-print-modal-title">จัดการ Barcode เพื่อพิมพ์</h2>
              <p className="barcode-print-modal-steps" aria-label="ขั้นตอน">
                <span className={step === 'select' ? 'is-active' : ''}>1. เลือกรายการ</span>
                <ChevronRight size={14} strokeWidth={2} aria-hidden />
                <span className={step === 'preview' || step === 'layout' ? 'is-active' : ''}>
                  2. ตัวอย่าง A4
                  {usesCustomLayout && step !== 'select' ? ' · จัดตำแหน่งแล้ว' : ''}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="queue-table-view-close"
            onClick={() => {
              if (step === 'layout') {
                // หน้านี้มี draft ที่ยังไม่ได้ apply — เตือนก่อนปิดเสมอ
                setConfirmCloseLayout(true);
                return;
              }
              onClose();
            }}
            aria-label="ปิด"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        {step === 'layout' && layoutDraft ? (
          <>
            <BarcodePrintLayoutStep
              items={selectedItems}
              layout={layoutDraft}
              onLayoutChange={setLayoutDraft}
              onBack={() => {
                if (!isLayoutDirty) {
                  setLayoutDraft(null);
                  setStep('preview');
                  return;
                }
                setConfirmDiscardLayout(true);
              }}
              onApply={() => {
                setPrintLayout(layoutDraft);
                setLayoutDraft(null);
                setConfirmDiscardLayout(false);
                setStep('preview');
              }}
            />
            {confirmDiscardLayout && (
              <ConfirmDialog
                message="กลับไปตัวอย่าง A4 โดยไม่บันทึกการจัดตำแหน่งที่แก้ไขไว้?"
                confirmLabel="กลับโดยไม่บันทึก"
                cancelLabel="อยู่หน้านี้"
                danger
                onConfirm={() => {
                  setConfirmDiscardLayout(false);
                  setLayoutDraft(null);
                  setStep('preview');
                }}
                onCancel={() => setConfirmDiscardLayout(false)}
              />
            )}
            {confirmCloseLayout && (
              <ConfirmDialog
                message={
                  isLayoutDirty
                    ? 'ปิดโมดัลโดยไม่บันทึกการจัดตำแหน่งที่แก้ไขไว้?'
                    : 'ปิดโมดัล? (การจัดตำแหน่งในหน้านี้ยังไม่ได้บันทึก)'
                }
                confirmLabel="ปิดโดยไม่บันทึก"
                cancelLabel="อยู่หน้านี้"
                danger={isLayoutDirty}
                onConfirm={() => {
                  setConfirmCloseLayout(false);
                  onClose();
                }}
                onCancel={() => setConfirmCloseLayout(false)}
              />
            )}
          </>
        ) : step === 'select' ? (
          <>
            <div className="barcode-print-modal-toolbar">
              <div className="barcode-print-modal-search-row">
                <label className="barcode-print-modal-search-label" htmlFor="barcode-search-field">
                  ค้นหาใน
                </label>
                <select
                  id="barcode-search-field"
                  className="barcode-print-modal-search-select"
                  value={searchField}
                  onChange={e => {
                    setSearchField(e.target.value as BarcodeSearchField);
                    setSearchValue('');
                  }}
                  aria-label="เลือกหัวข้อที่จะค้นหา"
                >
                  <option value="product">ชื่อสินค้า</option>
                  <option value="category">หมวดหมู่</option>
                </select>
                {searchField === 'category' ? (
                  <select
                    className="barcode-print-modal-search-value"
                    value={searchValue}
                    onChange={e => setSearchValue(e.target.value)}
                    aria-label="เลือกหมวดหมู่"
                  >
                    <option value="">ทุกหมวดหมู่</option>
                    {categoryOptions.map(cat => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="barcode-print-modal-search-value"
                    autoComplete="off"
                    value={searchValue}
                    onChange={e => setSearchValue(e.target.value)}
                    placeholder="พิมพ์ชื่อสินค้า…"
                    aria-label="ค้นหาชื่อสินค้า"
                  />
                )}
              </div>
              <div className="barcode-print-modal-filters" role="group" aria-label="กรองรายการ">
                <button
                  type="button"
                  className={`barcode-print-modal-filter${listFilter === 'all' ? ' is-active' : ''}`}
                  onClick={() => setListFilter('all')}
                >
                  ทั้งหมด ({printable.length})
                </button>
                <button
                  type="button"
                  className={`barcode-print-modal-filter${listFilter === 'generated' ? ' is-active' : ''}`}
                  onClick={() => setListFilter('generated')}
                >
                  สร้างใหม่ 200… ({generatedCount})
                </button>
                <button
                  type="button"
                  className={`barcode-print-modal-filter${listFilter === 'from-file' ? ' is-active' : ''}`}
                  onClick={() => setListFilter('from-file')}
                  disabled={fromFileCount === 0}
                >
                  จากไฟล์ ({fromFileCount})
                </button>
                <button
                  type="button"
                  className={`barcode-print-modal-filter${listFilter === 'selected' ? ' is-active' : ''}`}
                  onClick={() => setListFilter('selected')}
                  disabled={selectedIds.size === 0}
                >
                  รายการที่ถูกเลือกทั้งหมด ({selectedIds.size})
                </button>
              </div>
              <div className="barcode-print-modal-bulk">
                <button
                  type="button"
                  className="home-btn home-btn--ghost home-btn--sm"
                  onClick={selectGenerated}
                >
                  เลือกสร้างใหม่ทั้งหมด
                </button>
                <button
                  type="button"
                  className="home-btn home-btn--ghost home-btn--sm"
                  onClick={() => setFilteredSelection(!allFilteredSelected)}
                  disabled={filtered.length === 0}
                >
                  {allFilteredSelected ? 'ยกเลิกในรายการที่แสดง' : 'เลือกในรายการที่แสดง'}
                </button>
              </div>
            </div>

            <div className="barcode-print-modal-body">
              {printable.length === 0 ? (
                <p className="barcode-print-modal-empty">
                  ยังไม่มีรายการที่มีเลข barcode — Gen ใน{' '}
                  {onOpenTable ? (
                    <button type="button" className="home-queue-summary-link" onClick={onOpenTable}>
                      แก้ไขในตาราง
                    </button>
                  ) : (
                    'แก้ไขในตาราง'
                  )}{' '}
                  ก่อน
                </p>
              ) : filtered.length === 0 ? (
                <p className="barcode-print-modal-empty">
                  {listFilter === 'selected'
                    ? 'ยังไม่มีรายการที่เลือก — ติ๊ก checkbox หรือเปลี่ยนตัวกรอง'
                    : 'ไม่พบรายการตามคำค้นหา/ตัวกรอง'}
                </p>
              ) : (
                <ul className="barcode-print-modal-list">
                  {filtered.map(item => {
                    const checked = selectedIds.has(item.id);
                    const generated = isGeneratedRunBarcode(item.barcode);
                    const categoryLabel = item.category.trim() || '(ไม่มีหมวดหมู่)';
                    return (
                      <li key={item.id}>
                        <label className={`barcode-print-modal-row${checked ? ' is-checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(item.id)}
                          />
                          <span className="barcode-print-modal-row-main">
                            <span className="barcode-print-modal-row-name" title={categoryLabel}>
                              {categoryLabel}
                            </span>
                            <span className="barcode-print-modal-row-sub" title={item.nameTH}>
                              {item.nameTH.trim() || '(ไม่มีชื่อ)'} · {item.barcode.trim()}
                            </span>
                          </span>
                          <span
                            className={`barcode-print-modal-tag${generated ? ' barcode-print-modal-tag--gen' : ''}`}
                          >
                            {generated ? 'สร้างใหม่' : 'จากไฟล์'}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="barcode-print-modal-footer">
              <p className="barcode-print-modal-footer-meta">
                เลือกแล้ว <strong>{selectedRows.length}</strong> ป้าย
                {filtered.length > 0 && (
                  <span>
                    {' '}
                    · ในรายการที่แสดง {selectedInView}/{filtered.length}
                  </span>
                )}
              </p>
              <div className="barcode-print-modal-footer-actions">
                <button type="button" className="home-btn home-btn--ghost home-btn--sm" onClick={onClose}>
                  ปิด
                </button>
                <button
                  type="button"
                  className="home-btn home-btn--primary home-btn--sm"
                  onClick={() => setStep('preview')}
                  disabled={selectedRows.length === 0}
                >
                  ถัดไป — ตัวอย่าง A4
                  <ChevronRight size={14} strokeWidth={2} aria-hidden />
                </button>
              </div>
            </footer>
          </>
        ) : (
          <>
            <div className="barcode-print-modal-preview-body">
              <div className="barcode-print-modal-preview-toolbar">
                <p className="barcode-print-modal-preview-hint">
                  หัวกระดาษ = {usesCustomLayout ? 'ชื่อกลุ่มที่ตั้ง' : 'หมวดหมู่'} · บนบาร์โค้ด = ชื่อสินค้า ·{' '}
                  <strong>{pageCount}</strong> หน้า A4 · <strong>{selectedRows.length}</strong> ป้าย
                </p>
                <button
                  type="button"
                  className="home-btn home-btn--ghost home-btn--sm barcode-print-layout-open-btn"
                  onClick={openLayoutStep}
                >
                  <LayoutGrid size={14} strokeWidth={2} aria-hidden />
                  จัดตำแหน่งบน A4
                </button>
                <button
                  type="button"
                  className={`home-btn home-btn--ghost home-btn--sm barcode-print-one-group-btn${oneGroupPerPage ? ' is-active' : ''}`}
                  onClick={() => setOneGroupPerPage(v => !v)}
                  aria-pressed={oneGroupPerPage}
                  title="แยกหน้ากระดาษตามกลุ่ม (1 กลุ่มต่อ 1 หน้า)"
                >
                  1 กลุ่ม/หน้า
                </button>
              </div>
              <div className="barcode-print-modal-preview-scaler">
                <iframe
                  ref={previewIframeRef}
                  key={previewHtml.length}
                  title="ตัวอย่างป้าย Barcode หน้า A4"
                  className="barcode-print-modal-preview-iframe"
                  srcDoc={previewHtml}
                  onLoad={resizePreviewIframe}
                />
              </div>
            </div>

            <footer className="barcode-print-modal-footer">
              <p className="barcode-print-modal-footer-meta">
                พร้อมพิมพ์ <strong>{selectedRows.length}</strong> ป้าย
              </p>
              <div className="barcode-print-modal-footer-actions">
                <button
                  type="button"
                  className="home-btn home-btn--ghost home-btn--sm"
                  onClick={() => setStep('select')}
                >
                  <ArrowLeft size={14} strokeWidth={2} aria-hidden />
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  className="home-btn home-btn--ghost home-btn--sm"
                  onClick={openLayoutStep}
                >
                  <LayoutGrid size={14} strokeWidth={2} aria-hidden />
                  จัดตำแหน่ง
                </button>
                <button
                  type="button"
                  className="home-btn home-btn--ghost home-btn--sm"
                  onClick={handleDownloadDoc}
                >
                  <FileText size={14} strokeWidth={2} aria-hidden />
                  ดาวน์โหลด Word
                </button>
                <button
                  type="button"
                  className="home-btn home-btn--primary home-btn--sm"
                  onClick={handlePrint}
                >
                  <Printer size={14} strokeWidth={2} aria-hidden />
                  พิมพ์ป้าย A4
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );

  if (!portalReady) return null;
  return createPortal(modal, document.body);
}
