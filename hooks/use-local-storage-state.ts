"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        setValue(normalize(stored, fallback));
      }
    } catch {
      setValue(fallback);
    } finally {
      setIsReady(true);
    }
  }, [fallback, key, normalize]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      setStorageError(null);
    } catch {
      setStorageError("浏览器未能保存最新记录，请先到设置导出备份，暂时不要关闭页面。");
    }
  }, [isReady, key, value]);

  return [value, setValue, isReady, storageError] as const;
}
