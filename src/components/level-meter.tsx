"use client";

import { useEffect, useRef, useState } from "react";

interface LevelMeterProps {
  audioElement: HTMLAudioElement | null;
  audioContext: AudioContext | null;
  active: boolean;
  streamUrl?: string | null;
}

export function LevelMeter({ audioElement, audioContext, active, streamUrl }: LevelMeterProps) {
  const [displayDb, setDisplayDb] = useState("-∞");
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const barRef = useRef<HTMLDivElement>(null);
  const dbValueRef = useRef<number>(-60);

  // Fetch fallback refs (for Safari/WebKit)
  const fallbackActiveRef = useRef(false);
  const fallbackAbortRef = useRef<AbortController | null>(null);
  const zeroFrameCountRef = useRef(0);

  useEffect(() => {
    if (!active || !audioElement) {
      setDisplayDb("-∞");
      dbValueRef.current = -60;
      if (barRef.current) {
        barRef.current.style.width = "0%";
        barRef.current.className =
          "h-full rounded-full bg-green-500 transition-[width] duration-250 ease-out";
      }
      // Clean up fallback
      if (fallbackActiveRef.current && audioElement) {
        audioElement.volume = 1;
      }
      fallbackActiveRef.current = false;
      fallbackAbortRef.current?.abort();
      fallbackAbortRef.current = null;
      zeroFrameCountRef.current = 0;
      return;
    }

    if (!audioContext) return;
    const ctx = audioContext;
    const audio = audioElement;

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    if (!sourceRef.current) {
      try {
        sourceRef.current = ctx.createMediaElementSource(audioElement);
      } catch {
        // Already connected — ignore
      }
    }

    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      if (sourceRef.current) {
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(ctx.destination);
      }
    }

    const analyser = analyserRef.current;
    const dataArray = new Float32Array(analyser.fftSize);
    let lastDisplayUpdate = 0;

    // Reset fallback state for this activation
    if (fallbackActiveRef.current) {
      audio.volume = 1;
    }
    fallbackActiveRef.current = false;
    fallbackAbortRef.current?.abort();
    fallbackAbortRef.current = null;
    zeroFrameCountRef.current = 0;

    function findMp3SyncOffset(data: Uint8Array): number {
      for (let i = 0; i < data.length - 1; i++) {
        if (data[i] === 0xFF && (data[i + 1] & 0xE0) === 0xE0) {
          return i;
        }
      }
      return -1;
    }

    function startFetchFallback() {
      if (fallbackActiveRef.current || !streamUrl) return;
      fallbackActiveRef.current = true;

      // Mute the hardware-bypass audio element; Web Audio will handle playback
      audio.volume = 0;

      const controller = new AbortController();
      fallbackAbortRef.current = controller;

      let nextStartTime = 0;

      (async () => {
        try {
          const res = await fetch(streamUrl, { signal: controller.signal });
          if (!res.ok || !res.body) return;

          const reader = res.body.getReader();
          let buffer = new Uint8Array(0);
          let pendingBytes = 0;
          const DECODE_THRESHOLD = 4096;
          const MAX_BUFFER = 32768;

          while (true) {
            const { done, value } = await reader.read();
            if (done || controller.signal.aborted) break;

            // Append chunk to buffer
            const newBuf = new Uint8Array(buffer.length + value.length);
            newBuf.set(buffer);
            newBuf.set(value, buffer.length);
            buffer = newBuf;
            pendingBytes += value.length;

            if (pendingBytes < DECODE_THRESHOLD) continue;

            const syncOffset = findMp3SyncOffset(buffer);
            if (syncOffset < 0) {
              buffer = buffer.slice(-512);
              pendingBytes = 0;
              continue;
            }

            try {
              const aligned = buffer.slice(syncOffset);
              const arrayBuf = aligned.buffer.slice(
                aligned.byteOffset,
                aligned.byteOffset + aligned.byteLength
              );
              const audioBuffer = await ctx.decodeAudioData(arrayBuf);

              // Schedule playback through the analyser → destination graph
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(analyser);

              // Initialize or catch up if fallen behind
              if (nextStartTime < ctx.currentTime) {
                nextStartTime = ctx.currentTime;
              }
              source.start(nextStartTime);
              nextStartTime += audioBuffer.duration;

              // Discard decoded data, start fresh
              buffer = new Uint8Array(0);
              pendingBytes = 0;
            } catch {
              if (buffer.length > MAX_BUFFER) {
                buffer = buffer.slice(-512);
                pendingBytes = 0;
              }
            }
          }
        } catch {
          // Fetch aborted or network error
        }
      })();
    }

    function tick() {
      // Always read from analyser — works for both normal and fallback modes
      analyser.getFloatTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const dB = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

      // Zero-frame detection (only when fallback not yet active)
      if (!fallbackActiveRef.current && !audio.paused && audio.readyState >= 2) {
        if (rms < 1e-5) {
          zeroFrameCountRef.current++;
          if (zeroFrameCountRef.current >= 60 && streamUrl) {
            startFetchFallback();
          }
        } else {
          zeroFrameCountRef.current = 0;
        }
      }

      // Bar: update DOM directly (bypass React for smooth animation)
      const clamped = Math.max(-60, Math.min(0, dB));
      dbValueRef.current = clamped;
      const percent = ((clamped + 60) / 60) * 100;
      if (barRef.current) {
        barRef.current.style.width = `${percent}%`;
        const color =
          clamped > -3
            ? "bg-red-500"
            : clamped > -12
              ? "bg-yellow-500"
              : "bg-green-500";
        barRef.current.className = `h-full rounded-full ${color} transition-[width] duration-100 ease-out`;
      }

      // Numeric display: update via React every 300ms
      const now = performance.now();
      if (now - lastDisplayUpdate > 300) {
        setDisplayDb(dB === -Infinity ? "-∞" : `${dB.toFixed(1)}`);
        lastDisplayUpdate = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (fallbackActiveRef.current) {
        audio.volume = 1;
      }
      fallbackActiveRef.current = false;
      fallbackAbortRef.current?.abort();
      fallbackAbortRef.current = null;
      zeroFrameCountRef.current = 0;
    };
  }, [active, audioElement, audioContext, streamUrl]);

  return (
    <div className="space-y-1" role="region" aria-label="Audio level meter">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Level</span>
        <span className="font-mono" aria-live="polite" aria-atomic="true">{displayDb} dB</span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-muted-foreground/20 overflow-hidden"
        role="progressbar"
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={dbValueRef.current}
        aria-label="Audio level"
      >
        <div ref={barRef} className="h-full rounded-full bg-green-500 transition-[width] duration-250 ease-out" />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>-60</span>
        <span>-36</span>
        <span>-12</span>
        <span>0 dB</span>
      </div>
    </div>
  );
}
