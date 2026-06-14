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

    window.localStorage.setItem(key, JSON.stringify(value));
  }, [isReady, key, value]);

  return [value, setValue, isReady] as const;
}
