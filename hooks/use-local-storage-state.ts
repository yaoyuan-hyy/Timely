"use client";

import { useEffect, useState } from "react";

export function useLocalStorageState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        setValue(JSON.parse(stored) as T);
      }
    } finally {
      setIsReady(true);
    }
  }, [key]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    window.localStorage.setItem(key, JSON.stringify(value));
  }, [isReady, key, value]);

  return [value, setValue, isReady] as const;
}
