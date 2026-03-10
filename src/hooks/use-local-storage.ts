import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from "react";

export function useLocalStorage<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, _setValue] = useState<T>(defaultValue);
  const keyRef = useRef(key);
  keyRef.current = key;

  // Read from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) _setValue(JSON.parse(stored) as T);
    } catch {
      // Invalid JSON or unavailable
    }
  }, [key]);

  // Wrapped setter that also persists to localStorage
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    _setValue((prev) => {
      const next = typeof action === "function" ? (action as (prev: T) => T)(prev) : action;
      try { localStorage.setItem(keyRef.current, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return [value, setValue];
}
