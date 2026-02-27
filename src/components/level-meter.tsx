"use client";

import { useEffect, useRef, useState } from "react";

interface LevelMeterProps {
  audioElement: HTMLAudioElement | null;
  active: boolean;
}

export function LevelMeter({ audioElement, active }: LevelMeterProps) {
  const [displayDb, setDisplayDb] = useState("-\u221E");
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const barRef = useRef<HTMLDivElement>(null);
  const dbValueRef = useRef<number>(-60);

  useEffect(() => {
    if (!active || !audioElement) {
      setDisplayDb("-\u221E");
      dbValueRef.current = -60;
      if (barRef.current) {
        barRef.current.style.width = "0%";
        barRef.current.className =
          "h-full rounded-full bg-green-500";
      }
      return;
    }

    if (!contextRef.current) {
      contextRef.current = new AudioContext();
    }
    const ctx = contextRef.current;

    if (!sourceRef.current) {
      try {
        sourceRef.current = ctx.createMediaElementSource(audioElement);
      } catch {
        // Already connected
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

    function tick() {
      analyser.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const dB = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

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
        barRef.current.className = `h-full rounded-full ${color}`;
      }

      // Numeric display: update via React every 300ms
      const now = performance.now();
      if (now - lastDisplayUpdate > 300) {
        setDisplayDb(dB === -Infinity ? "-\u221E" : `${dB.toFixed(1)}`);
        lastDisplayUpdate = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, audioElement]);

  return (
    <div className="space-y-1" role="region" aria-label="Audio level meter">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Level</span>
        <span className="font-mono" aria-live="polite" aria-atomic="true">{displayDb} dB</span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={dbValueRef.current}
        aria-label="Audio level"
      >
        <div ref={barRef} className="h-full rounded-full bg-green-500" />
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
