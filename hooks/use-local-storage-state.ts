"use client";

import { useEffect, useRef, useState } from "react";
import { loadStoredState, saveStoredState } from "@/lib/repository/state-storage";

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
    canPersist.current = false;
    try {
      const loaded = loadStoredState(window.localStorage, key, fallback, normalize);
      canPersist.current = loaded.ok;
      if (loaded.ok) setValue(loaded.value);
      else setStorageError(loaded.message);
    } catch {
      setValue(fallback);
      setStorageError("无法读取浏览器记录，请检查存储权限后刷新页面。");
    } finally {
      setIsReady(true);
    }
  }, [fallback, key, normalize]);

  useEffect(() => {
    if (!isReady || !canPersist.current) {
      return;
    }

    try {
      const saved = saveStoredState(window.localStorage, key, value);
      setStorageError(saved.ok ? null : saved.message);
    } catch {
      setStorageError("浏览器未能保存最新记录，请先到设置导出备份，暂时不要关闭页面。");
    }
  }, [isReady, key, value]);

  return [value, setValue, isReady, storageError] as const;
}
