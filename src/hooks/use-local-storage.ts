import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

export function useLocalStorage<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue);
  const initialized = useRef(false);

  // Read from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {
      // Invalid JSON or unavailable
    }
    initialized.current = true;
  }, [key]);

  // Persist to localStorage on changes (skip the initial mount read)
  useEffect(() => {
    if (!initialized.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable
    }
  }, [key, value]);

  return [value, setValue];
}
