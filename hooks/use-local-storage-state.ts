"use client";

import { useEffect, useRef, useState } from "react";
import { loadStoredState, saveStoredState } from "@/lib/repository/state-storage";

import type { AsyncStorage } from "@/lib/repository/queued-storage";
let nativeStorage: AsyncStorage | undefined;
export function configureStateStorage(storage: AsyncStorage) { nativeStorage = storage; }

function identityNormalizer<T>(value: unknown) {
  return value as T;
}

export function useLocalStorageState<T>(
  key: string,
  fallback: T,
  normalize: (value: unknown, fallback: T) => T = identityNormalizer
) {
  const [value, setValue] = useState<T>(fallback);
  const [isReady, setIsReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const canPersist = useRef(false);

  useEffect(() => {
    let active = true;
    canPersist.current = false;
    setIsReady(false);
    const load = async () => {
      try {
        if (nativeStorage) {
          const stored = await nativeStorage.getItem(key);
          if (!active) return;
          setValue(stored === null ? fallback : normalize(stored, fallback));
          canPersist.current = true;
        } else {
          const loaded = loadStoredState(window.localStorage, key, fallback, normalize);
          if (!active) return;
          canPersist.current = loaded.ok;
          if (loaded.ok) setValue(loaded.value);
          else setStorageError(loaded.message);
        }
      } catch {
        if (active) setStorageError("无法读取本机记录，请检查存储权限后重试。");
      } finally { if (active) setIsReady(true); }
    };
    void load();
    return () => { active = false; };
  }, [fallback, key, normalize]);

  useEffect(() => {
    if (!isReady || !canPersist.current) return;
    let active = true;
    const save = async () => {
      try {
        if (nativeStorage) {
          await nativeStorage.setItem(key, JSON.stringify(value));
          if (active) setStorageError(null);
        } else {
          const saved = saveStoredState(window.localStorage, key, value);
          if (active) setStorageError(saved.ok ? null : saved.message);
        }
      } catch {
        if (active) setStorageError("本机未能保存最新记录，请先到设置导出备份，暂时不要关闭应用。");
      }
    };
    void save();
    return () => { active = false; };
  }, [isReady, key, value]);

  return [value, setValue, isReady, storageError] as const;
}
