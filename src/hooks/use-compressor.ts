"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { CompressorConfig } from "@/types/dashboard";

export function useCompressor() {
  const [compressorConfigOpen, setCompressorConfigOpen] = useState(false);
  const [compressorConfig, setCompressorConfig] = useState<CompressorConfig>({ enabled: false, threshold: -20, ratio: 4, makeup: 6, attack: 20, release: 250 });
  const [compressorConfigLoaded, setCompressorConfigLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveCompressorConfig = useCallback((updates: Partial<CompressorConfig>) => {
    setCompressorConfig((prev) => {
      const updated = { ...prev, ...updates };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/audio/compressor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          });
          if (!res.ok) throw new Error();
        } catch {
          toast.error("Failed to save compressor config");
        }
      }, 500);
      return updated;
    });
  }, []);

  return {
    compressorConfig, setCompressorConfig,
    compressorConfigOpen, setCompressorConfigOpen,
    compressorConfigLoaded, setCompressorConfigLoaded,
    saveCompressorConfig,
  };
}
