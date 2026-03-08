"use client";

import { useEffect, useRef, useCallback } from "react";

interface LiveWaveformProps {
  active: boolean;
  audioContext?: AudioContext | null;
  streamUrl?: string;
  analyserNode?: AnalyserNode | null;
}

export function LiveWaveform({ active, audioContext, streamUrl, analyserNode }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorProbeRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);
  const bufferRef = useRef<Float32Array | null>(null);
  const bufferPosRef = useRef(0);
  const barCountRef = useRef(0);
  const runningPeakRef = useRef(0);

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

  // Shared: initialize canvas, ring buffer, drawing loop, resize observer
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const count = calcBarCount(displayWidth);
    barCountRef.current = count;
    bufferRef.current = new Float32Array(count);
    bufferPosRef.current = 0;
    runningPeakRef.current = 0;

    const displayHeight = canvas.clientHeight;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    const canvasCtx = canvas.getContext("2d");
    if (canvasCtx) canvasCtx.scale(dpr, dpr);

    return canvas;
  }, [calcBarCount]);

  const draw = useCallback(() => {
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
    const barCount = barCountRef.current;
    const centerY = h / 2;
    const color = getBarColor();
    cCtx.fillStyle = color;

    const filled = Math.min(bufferPosRef.current, barCount);
    const startIdx = bufferPosRef.current > barCount
      ? bufferPosRef.current - barCount
      : 0;

    const DB_FLOOR = -48;

    for (let i = 0; i < filled; i++) {
      const val = buf[(startIdx + i) % barCount];
      const dB = val > 0 ? 20 * Math.log10(val) : DB_FLOOR;
      const scaled = Math.max(0, (dB - DB_FLOOR) / -DB_FLOOR);
      const barHeight = Math.max(1, scaled * h * 0.9);
      const x = (barCount - filled + i) * (barWidth + gap);
      const y = centerY - barHeight / 2;
      cCtx.fillRect(x, y, barWidth, barHeight);
    }
  }, [getBarColor]);

  const setupResizeObserver = useCallback((canvas: HTMLCanvasElement) => {
    const observer = new ResizeObserver(() => {
      const w = canvas.clientWidth;
      const newCount = calcBarCount(w);
      if (newCount !== barCountRef.current && newCount > 0) {
        const oldBuf = bufferRef.current;
        const oldPos = bufferPosRef.current;
        const newBuf = new Float32Array(newCount);

        if (oldBuf) {
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
        canvas.width = 0;
        canvas.height = 0;
      }
    });
    observer.observe(canvas);
    return observer;
  }, [calcBarCount]);

  // Mode 1: Stream URL (fetch MP3 from Icecast and decode)
  useEffect(() => {
    if (!active || !audioContext || !streamUrl || analyserNode) {
      // Only clear canvas if this is the active mode going inactive
      if (!analyserNode) {
        cancelAnimationFrame(rafRef.current);
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
      }
      return;
    }

    const ctx = audioContext;
    if (ctx.state === "suspended") ctx.resume();

    const canvas = initCanvas();
    if (!canvas) return;

    const BAR_INTERVAL_MS = 75;
    let lastBarTime = performance.now();
    runningPeakRef.current = 0;

    const abortController = new AbortController();

    function findMp3SyncOffset(data: Uint8Array): number {
      for (let i = 0; i < data.length - 1; i++) {
        if (data[i] === 0xFF && (data[i + 1] & 0xE0) === 0xE0) return i;
      }
      return -1;
    }

    (async () => {
      try {
        let res: Response | null = null;
        for (let attempt = 0; attempt < 30; attempt++) {
          if (abortController.signal.aborted) return;
          const r = await fetch(streamUrl, { signal: abortController.signal });
          if (r.ok && r.body) { res = r; break; }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!res || !res.body) return;

        const reader = res.body.getReader();
        let buffer = new Uint8Array(0);
        let pendingBytes = 0;
        const DECODE_THRESHOLD = 4096;
        const MAX_BUFFER = 32768;

        while (true) {
          const { done, value } = await reader.read();
          if (done || abortController.signal.aborted) break;

          const newBuf = new Uint8Array(buffer.length + value.length);
          newBuf.set(buffer);
          newBuf.set(value, buffer.length);
          buffer = newBuf;
          pendingBytes += value.length;

          if (pendingBytes < DECODE_THRESHOLD) continue;

          const syncOffset = findMp3SyncOffset(buffer);
          if (syncOffset < 0) { buffer = buffer.slice(-512); pendingBytes = 0; continue; }

          try {
            const aligned = buffer.slice(syncOffset);
            const arrayBuf = aligned.buffer.slice(aligned.byteOffset, aligned.byteOffset + aligned.byteLength);
            const audioBuffer = await ctx.decodeAudioData(arrayBuf);

            const channelData = audioBuffer.getChannelData(0);
            let peak = 0;
            for (let i = 0; i < channelData.length; i++) {
              const abs = Math.abs(channelData[i]);
              if (abs > peak) peak = abs;
            }
            if (peak > runningPeakRef.current) runningPeakRef.current = peak;

            buffer = new Uint8Array(0);
            pendingBytes = 0;
          } catch (decodeErr) {
            if (process.env.NODE_ENV === "development") {
              console.warn("[LiveWaveform] decode failed:", decodeErr, "bufLen:", buffer.length);
            }
            if (buffer.length > MAX_BUFFER) { buffer = buffer.slice(-512); pendingBytes = 0; }
          }
        }
      } catch {
        // Fetch aborted or network error
      }
    })();

    function tick() {
      const now = performance.now();
      if (now - lastBarTime >= BAR_INTERVAL_MS) {
        const buf = bufferRef.current;
        if (buf) {
          buf[bufferPosRef.current % buf.length] = runningPeakRef.current;
          bufferPosRef.current++;
        }
        runningPeakRef.current = 0;
        lastBarTime = now;
      }
      draw();
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    const observer = setupResizeObserver(canvas);

    return () => {
      abortController.abort();
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [active, audioContext, streamUrl, analyserNode, initCanvas, draw, setupResizeObserver]);

  // Mode 2: AnalyserNode (direct mic input — talkback / client recording)
  useEffect(() => {
    if (!analyserNode || !active) {
      if (analyserNode !== undefined) {
        cancelAnimationFrame(rafRef.current);
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
      }
      return;
    }

    const canvas = initCanvas();
    if (!canvas) return;

    const BAR_INTERVAL_MS = 75;
    let lastBarTime = performance.now();
    runningPeakRef.current = 0;

    const dataArray = new Float32Array(analyserNode.fftSize);

    function tick() {
      analyserNode!.getFloatTimeDomainData(dataArray);

      // Compute peak from current frame
      let peak = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const abs = Math.abs(dataArray[i]);
        if (abs > peak) peak = abs;
      }
      if (peak > runningPeakRef.current) runningPeakRef.current = peak;

      const now = performance.now();
      if (now - lastBarTime >= BAR_INTERVAL_MS) {
        const buf = bufferRef.current;
        if (buf) {
          buf[bufferPosRef.current % buf.length] = runningPeakRef.current;
          bufferPosRef.current++;
        }
        runningPeakRef.current = 0;
        lastBarTime = now;
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    const observer = setupResizeObserver(canvas);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [analyserNode, active, initCanvas, draw, setupResizeObserver]);

  return (
    <div className="relative">
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
