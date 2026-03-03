"use client";

import { useEffect, useRef, useCallback } from "react";

interface LiveWaveformProps {
  active: boolean;
  audioContext: AudioContext | null;
  streamUrl: string;
}

export function LiveWaveform({ active, audioContext, streamUrl }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorProbeRef = useRef<HTMLSpanElement>(null);
  const audioElRef = useRef<HTMLAudioElement>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Float32Array | null>(null);
  const bufferPosRef = useRef(0);
  const barCountRef = useRef(0);

  // Safari/iOS fallback refs
  const fallbackActiveRef = useRef(false);
  const fallbackAbortRef = useRef<AbortController | null>(null);
  const zeroFrameCountRef = useRef(0);

  const getBarColor = useCallback(() => {
    if (colorProbeRef.current) {
      return getComputedStyle(colorProbeRef.current).backgroundColor;
    }
    return "#ef4444";
  }, []);

  const calcBarCount = useCallback((width: number) => {
    const barWidth = 2;
    const gap = 1;
    return Math.floor((width + gap) / (barWidth + gap));
  }, []);

  useEffect(() => {
    if (!active || !audioContext) {
      // Cleanup
      cancelAnimationFrame(rafRef.current);
      fallbackAbortRef.current?.abort();
      fallbackAbortRef.current = null;
      fallbackActiveRef.current = false;
      zeroFrameCountRef.current = 0;

      const audio = audioElRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }

      // Disconnect nodes
      if (sourceRef.current) {
        try { sourceRef.current.disconnect(); } catch {}
        sourceRef.current = null;
      }
      if (analyserRef.current) {
        try { analyserRef.current.disconnect(); } catch {}
        analyserRef.current = null;
      }
      if (gainRef.current) {
        try { gainRef.current.disconnect(); } catch {}
        gainRef.current = null;
      }

      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        }
      }

      bufferRef.current = null;
      bufferPosRef.current = 0;
      return;
    }

    const ctx = audioContext;
    const audio = audioElRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    // Set up audio graph: audio → source → analyser → gain(0) → destination
    // The gain(0) keeps the pipeline flowing without producing sound
    try {
      sourceRef.current = ctx.createMediaElementSource(audio);
    } catch {
      // Already connected — ignore
    }

    analyserRef.current = ctx.createAnalyser();
    analyserRef.current.fftSize = 2048;
    analyserRef.current.smoothingTimeConstant = 0;

    gainRef.current = ctx.createGain();
    gainRef.current.gain.value = 0;

    if (sourceRef.current) {
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(gainRef.current);
      gainRef.current.connect(ctx.destination);
    }

    // Initialize ring buffer
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const count = calcBarCount(displayWidth);
    barCountRef.current = count;
    bufferRef.current = new Float32Array(count);
    bufferPosRef.current = 0;

    // Size canvas for high-DPI
    const displayHeight = canvas.clientHeight;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    const canvasCtx = canvas.getContext("2d");
    if (canvasCtx) canvasCtx.scale(dpr, dpr);

    // Start audio element
    audio.src = `${streamUrl}?t=${Date.now()}`;
    audio.load();
    audio.play().catch(() => {});

    const analyser = analyserRef.current;
    const dataArray = new Float32Array(analyser.fftSize);

    // Accumulate peaks over time so each bar represents a real audio segment
    // rather than a single ~16ms frame snapshot
    const BAR_INTERVAL_MS = 75;
    let runningPeak = 0;
    let lastBarTime = performance.now();

    // Safari fallback: fetch + decodeAudioData
    function findMp3SyncOffset(data: Uint8Array): number {
      for (let i = 0; i < data.length - 1; i++) {
        if (data[i] === 0xFF && (data[i + 1] & 0xE0) === 0xE0) {
          return i;
        }
      }
      return -1;
    }

    function startFetchFallback() {
      if (fallbackActiveRef.current) return;
      fallbackActiveRef.current = true;

      const controller = new AbortController();
      fallbackAbortRef.current = controller;

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

              // Extract peak from decoded audio for waveform
              const channelData = audioBuffer.getChannelData(0);
              let peak = 0;
              for (let i = 0; i < channelData.length; i++) {
                const abs = Math.abs(channelData[i]);
                if (abs > peak) peak = abs;
              }

              // Accumulate into running peak (committed by tick loop)
              if (peak > runningPeak) runningPeak = peak;

              // Also play through analyser for consistency
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(analyser);
              source.start();

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

    function draw() {
      const c = canvasRef.current;
      const buf = bufferRef.current;
      if (!c || !buf) return;

      const cCtx = c.getContext("2d");
      if (!cCtx) return;

      const w = c.clientWidth;
      const h = c.clientHeight;
      const currentDpr = window.devicePixelRatio || 1;

      if (c.width !== w * currentDpr || c.height !== h * currentDpr) {
        c.width = w * currentDpr;
        c.height = h * currentDpr;
        cCtx.setTransform(1, 0, 0, 1, 0, 0);
        cCtx.scale(currentDpr, currentDpr);
      }

      cCtx.clearRect(0, 0, w, h);

      const barWidth = 2;
      const gap = 1;
      const count = barCountRef.current;
      const centerY = h / 2;
      const color = getBarColor();
      cCtx.fillStyle = color;

      const filled = Math.min(bufferPosRef.current, count);
      const startIdx = bufferPosRef.current > count
        ? bufferPosRef.current - count
        : 0;

      // dB-based scaling: maps -48dB..0dB to 0..1 so quiet audio is visible
      const DB_FLOOR = -48;

      for (let i = 0; i < filled; i++) {
        const val = buf[(startIdx + i) % count];
        // Convert linear amplitude to dB-scaled 0..1
        const dB = val > 0 ? 20 * Math.log10(val) : DB_FLOOR;
        const scaled = Math.max(0, (dB - DB_FLOOR) / -DB_FLOOR);
        const barHeight = Math.max(1, scaled * h * 0.9);
        const x = (count - filled + i) * (barWidth + gap);
        const y = centerY - barHeight / 2;
        cCtx.fillRect(x, y, barWidth, barHeight);
      }
    }

    function tick() {
      if (!fallbackActiveRef.current) {
        // Normal mode: read from analyser
        analyser.getFloatTimeDomainData(dataArray);

        let peak = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const abs = Math.abs(dataArray[i]);
          if (abs > peak) peak = abs;
        }

        // Zero-frame detection for Safari fallback
        if (audio && !audio.paused && audio.readyState >= 2) {
          if (peak < 1e-5) {
            zeroFrameCountRef.current++;
            if (zeroFrameCountRef.current >= 60) {
              startFetchFallback();
            }
          } else {
            zeroFrameCountRef.current = 0;
          }
        }

        // Accumulate running peak across frames
        if (peak > runningPeak) runningPeak = peak;
      }
      // In fallback mode, runningPeak is updated by the fetch loop

      // Commit a bar when enough time has elapsed
      const now = performance.now();
      if (now - lastBarTime >= BAR_INTERVAL_MS) {
        const buf = bufferRef.current;
        if (buf) {
          buf[bufferPosRef.current % buf.length] = runningPeak;
          bufferPosRef.current++;
        }
        runningPeak = 0;
        lastBarTime = now;
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    // ResizeObserver
    const observer = new ResizeObserver(() => {
      const w = canvas.clientWidth;
      const newCount = calcBarCount(w);
      if (newCount !== barCountRef.current && newCount > 0) {
        const oldBuf = bufferRef.current;
        const oldPos = bufferPosRef.current;
        const newBuf = new Float32Array(newCount);

        if (oldBuf) {
          // Copy as many recent values as possible
          const oldCount = barCountRef.current;
          const filled = Math.min(oldPos, oldCount);
          const copyCount = Math.min(filled, newCount);
          const startIdx = oldPos > oldCount ? oldPos - oldCount : 0;
          const srcStart = filled - copyCount;

          for (let i = 0; i < copyCount; i++) {
            newBuf[i] = oldBuf[(startIdx + srcStart + i) % oldCount];
          }
          bufferPosRef.current = copyCount;
        }

        bufferRef.current = newBuf;
        barCountRef.current = newCount;

        // Reset canvas dimensions for redraw
        canvas.width = 0;
        canvas.height = 0;
      }
    });
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      fallbackAbortRef.current?.abort();
      fallbackAbortRef.current = null;
      fallbackActiveRef.current = false;
      zeroFrameCountRef.current = 0;

      audio.pause();
      audio.removeAttribute("src");
      audio.load();

      if (sourceRef.current) {
        try { sourceRef.current.disconnect(); } catch {}
        sourceRef.current = null;
      }
      if (analyserRef.current) {
        try { analyserRef.current.disconnect(); } catch {}
        analyserRef.current = null;
      }
      if (gainRef.current) {
        try { gainRef.current.disconnect(); } catch {}
        gainRef.current = null;
      }
    };
  }, [active, audioContext, streamUrl, calcBarCount, getBarColor]);

  return (
    <div className="relative">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioElRef} crossOrigin="anonymous" style={{ display: "none" }} />
      <span
        ref={colorProbeRef}
        className="bg-destructive"
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      />
      <canvas
        ref={canvasRef}
        className="w-full h-12 rounded"
        aria-label="Live recording waveform"
      />
    </div>
  );
}
