import type { OperationResult } from "../query-contract";
export type StateStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export function loadStoredState<T>(storage: StateStorage, key: string, fallback: T, normalize: (value: unknown, fallback: T) => T): OperationResult<T> {
  try {
    const stored = storage.getItem(key);
    return { ok: true, value: stored === null ? fallback : normalize(stored, fallback) };
  } catch { return { ok: false, code: "storage_error", message: "无法读取浏览器记录。" }; }
}
export function saveStoredState<T>(storage: StateStorage, key: string, value: T): OperationResult<null> {
  try { storage.setItem(key, JSON.stringify(value)); return { ok: true, value: null }; }
  catch { return { ok: false, code: "storage_error", message: "浏览器未能保存最新记录，请先到设置导出备份，暂时不要关闭页面。" }; }
}
