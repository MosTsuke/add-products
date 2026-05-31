'use client';

import { useEffect, useState } from 'react';
import { CloudDownload, CloudUpload, RefreshCw, Store, Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import FridgeStorePicker from '@/components/FridgeStorePicker';
import type { FridgeConfig, FridgeLayout } from '@/lib/fridgeStorage';
import {
  getActiveFridgeStoreName,
  deleteFridgeStore,
  listFridgeStores,
  loadFridgeStore,
  saveFridgeStore,
  setActiveFridgeStoreName,
  type FridgeStoreListItem,
} from '@/lib/fridgeDb';

type PanelMode = 'save' | 'load' | 'delete';

function formatUpdatedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

export default function FridgeStorePanel({
  config,
  layout,
  onApply,
  onToast,
  compact = false,
}: {
  config: FridgeConfig;
  layout: FridgeLayout;
  onApply: (config: FridgeConfig, layout: FridgeLayout) => void;
  onToast?: (msg: string) => void;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<PanelMode>('save');
  const [saveName, setSaveName] = useState('');
  const [stores, setStores] = useState<FridgeStoreListItem[]>([]);
  const [pickerSelected, setPickerSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null);

  const notify = (msg: string) => onToast?.(msg);

  useEffect(() => {
    const active = getActiveFridgeStoreName();
    if (active) setSaveName(active);
  }, []);

  const fetchStoreList = async (): Promise<FridgeStoreListItem[]> => {
    setListError('');
    const list = await listFridgeStores();
    setStores(list);
    return list;
  };

  const enterPickerMode = async (next: 'load' | 'delete') => {
    setLoading(true);
    setListError('');
    try {
      const list = await fetchStoreList();
      if (list.length === 0) {
        notify('ยังไม่มีร้านบน DB — บันทึกจากเครื่องตั้งค่าก่อน');
        return;
      }
      const active = getActiveFridgeStoreName();
      setPickerSelected(active && list.some(s => s.name === active) ? active : '');
      setMode(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'โหลดรายการร้านไม่สำเร็จ';
      setListError(msg);
      notify(msg);
    } finally {
      setLoading(false);
    }
  };

  const exitPickerMode = () => {
    setMode('save');
    setPickerSelected('');
    setListError('');
  };

  const handleRefreshList = async () => {
    if (mode === 'save') return;
    setLoading(true);
    try {
      await fetchStoreList();
      notify('รีเฟรชรายการร้านแล้ว');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'โหลดรายการร้านไม่สำเร็จ';
      setListError(msg);
      notify(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSync = async () => {
    const name = pickerSelected.trim();
    if (!name) {
      notify('กรุณาเลือกร้านจากรายการ');
      return;
    }
    setLoading(true);
    try {
      const data = await loadFridgeStore(name);
      onApply(data.config, data.layout);
      setActiveFridgeStoreName(name);
      setSaveName(name);
      notify(`ซิงค์ "${name}" จาก DB แล้ว`);
      exitPickerMode();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'ซิงค์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const name = saveName.trim();
    if (!name) {
      notify('กรุณาระบุชื่อร้านก่อนบันทึก');
      return;
    }
    setLoading(true);
    try {
      let exists = false;
      try {
        const list = await listFridgeStores();
        exists = list.some(s => s.name === name);
      } catch {
        /* ถ้าเช็ครายการไม่ได้ ยังให้บันทึกได้ */
      }
      if (
        exists &&
        !window.confirm(
          `มีชื่อร้าน "${name}" ในระบบอยู่แล้ว\nต้องการบันทึกทับข้อมูลเดิมหรือไม่?`,
        )
      ) {
        return;
      }
      await saveFridgeStore(name, config, layout);
      setActiveFridgeStoreName(name);
      notify(`บันทึก "${name}" ลง DB แล้ว`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const requestDeleteConfirm = () => {
    const name = pickerSelected.trim();
    if (!name) {
      notify('กรุณาเลือกร้านที่จะลบ');
      return;
    }
    setConfirmDeleteName(name);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteName) return;
    const name = confirmDeleteName;
    setConfirmDeleteName(null);
    setLoading(true);
    try {
      await deleteFridgeStore(name);
      if (getActiveFridgeStoreName() === name) setActiveFridgeStoreName(null);
      if (saveName.trim() === name) setSaveName('');
      const list = await fetchStoreList();
      setPickerSelected('');
      notify(`ลบ "${name}" จาก DB แล้ว`);
      if (list.length === 0) exitPickerMode();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'ลบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const activeName = typeof window !== 'undefined' ? getActiveFridgeStoreName() : null;
  const selectedMeta = stores.find(s => s.name === pickerSelected);

  return (
    <div className={`fridge-store-panel${compact ? ' fridge-store-panel--compact' : ''}`}>
      <div className="fridge-store-panel-head">
        <Store size={16} aria-hidden />
        <span className="fridge-store-panel-title">ข้อมูลร้านบน DB</span>
        {activeName && mode === 'save' && (
          <span className="fridge-store-panel-active">ใช้งาน: {activeName}</span>
        )}
        {mode !== 'save' && (
          <span className={`fridge-store-panel-mode${mode === 'delete' ? ' fridge-store-panel-mode--danger' : ''}`}>
            {mode === 'load' ? 'โหมดโหลด' : 'โหมดลบ'}
          </span>
        )}
        {mode !== 'save' && (
          <button
            type="button"
            className="fridge-store-panel-refresh"
            onClick={handleRefreshList}
            disabled={loading}
            title="รีเฟรชรายการร้าน"
            aria-label="รีเฟรชรายการร้าน"
          >
            <RefreshCw size={14} className={loading ? 'home-spin' : ''} />
          </button>
        )}
      </div>

      {mode === 'save' ? (
        <>
          <div className="fridge-store-panel-row">
            <label className="fridge-store-panel-label" htmlFor="fridge-store-save-name">
              ชื่อร้าน
            </label>
            <input
              id="fridge-store-save-name"
              type="text"
              className="fridge-store-panel-input fridge-store-panel-input--wide"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="เช่น ร้าน A"
              disabled={loading}
            />
          </div>
          <div className="fridge-store-panel-actions">
            <button
              type="button"
              className="home-btn home-btn--ghost home-btn--sm"
              onClick={() => enterPickerMode('load')}
              disabled={loading}
            >
              <CloudDownload size={14} /> โหลดจาก DB
            </button>
            <button
              type="button"
              className="home-btn home-btn--primary home-btn--sm"
              onClick={handleSave}
              disabled={loading}
            >
              <CloudUpload size={14} /> บันทึกลง DB
            </button>
            <button
              type="button"
              className="home-btn home-btn--ghost home-btn--sm home-btn--danger-text"
              onClick={() => enterPickerMode('delete')}
              disabled={loading}
            >
              <Trash2 size={14} /> ลบร้าน
            </button>
          </div>
          {!compact && (
            <p className="fridge-store-panel-hint">
              บันทึก: พิมพ์ชื่อแล้วกดบันทึก · โหลด/ลบ: กดปุ่มแล้วเลือกร้านจากรายการ → ยืนยัน
            </p>
          )}
        </>
      ) : (
        <>
          {listError && (
            <p className="fridge-store-panel-error">
              {listError}
              {listError.toLowerCase().includes('fridge_stores') && (
                <> — รัน SQL ใน <code>supabase/fridge_stores.sql</code> ก่อน</>
              )}
            </p>
          )}
          <div className="fridge-store-panel-picker-wrap">
            <label className="fridge-store-panel-label">
              {mode === 'load' ? 'เลือกร้านที่จะโหลด' : 'เลือกร้านที่จะลบ'}
            </label>
            <FridgeStorePicker
              value={pickerSelected}
              options={stores}
              onChange={setPickerSelected}
              disabled={loading}
              placeholder="— เลือกร้านจาก DB —"
            />
          </div>
          {selectedMeta && (
            <p className="fridge-store-panel-meta">
              อัปเดตล่าสุดบน DB: {formatUpdatedAt(selectedMeta.updated_at)}
            </p>
          )}
          <div className="fridge-store-panel-actions">
            <button
              type="button"
              className="home-btn home-btn--ghost home-btn--sm"
              onClick={exitPickerMode}
              disabled={loading}
            >
              ยกเลิก
            </button>
            {mode === 'load' ? (
              <button
                type="button"
                className="home-btn home-btn--primary home-btn--sm"
                onClick={handleConfirmSync}
                disabled={loading || !pickerSelected}
              >
                <CloudDownload size={14} /> ซิงค์ยืนยัน
              </button>
            ) : (
              <button
                type="button"
                className="home-btn home-btn--danger home-btn--sm"
                onClick={requestDeleteConfirm}
                disabled={loading || !pickerSelected}
              >
                <Trash2 size={14} /> ยืนยันลบ
              </button>
            )}
          </div>
        </>
      )}

      {confirmDeleteName && (
        <ConfirmDialog
          message={`ลบ "${confirmDeleteName}" จาก DB?\nข้อมูลตู้เย็นของร้านนี้บนระบบจะหายถาวร (ไม่กระทบข้อมูลบนเครื่องนี้)`}
          confirmLabel="ลบร้าน"
          danger
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDeleteName(null)}
        />
      )}
    </div>
  );
}
