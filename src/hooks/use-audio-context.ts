"use client";

import { useEffect, useRef, useState } from "react";

export function useAudioContext(statusLoaded: boolean, recording: boolean) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [audioContextReady, setAudioContextReady] = useState(false);

  useEffect(() => {
    if (statusLoaded && recording && !audioContextReady) {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().then(() => setAudioContextReady(true)).catch(() => {});
      } else {
        setAudioContextReady(true);
      }
    }
  }, [statusLoaded, recording, audioContextReady]);

  function ensureAudioContext() {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    if (audioContextRef.current.state === "suspended") audioContextRef.current.resume();
    setAudioContextReady(true);
  }

  return { audioRef, audioContextRef, audioContextReady, ensureAudioContext };
}
