"use client";

import { useEffect, useRef, useState } from "react";
import type { VoxState } from "@/lib/vox";

interface VoxLevelEvent {
  state: VoxState;
  currentLevel: number;
  threshold: number;
  recordingDuration: number;
  recordingFilename: string | null;
  silenceRemaining: number;
}

export function useVoxStream(voxActive: boolean) {
  const [sseVox, setSseVox] = useState<VoxLevelEvent | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!voxActive) {
      esRef.current?.close();
      esRef.current = null;
      setSseVox(null);
      return;
    }

    const es = new EventSource("/api/vox/stream");
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        setSseVox(JSON.parse(e.data));
      } catch {}
    };

    es.onerror = () => {
      // EventSource auto-reconnects; if VOX stopped the server closes immediately
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [voxActive]);

  return sseVox;
}
