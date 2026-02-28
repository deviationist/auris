"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Loader2 } from "lucide-react";
import { LevelMeter } from "@/components/level-meter";

interface WaveformPlayerProps {
  src: string;
  waveformUrl: string;
  onEnded?: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function WaveformPlayer({ src, waveformUrl, onEnded }: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);
  const peaksRef = useRef<number[] | null>(null);

  const playedProbeRef = useRef<HTMLSpanElement>(null);
  const unplayedProbeRef = useRef<HTMLSpanElement>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Resolve theme colors from hidden probe elements
  const getColors = useCallback(() => {
    const played = playedProbeRef.current
      ? getComputedStyle(playedProbeRef.current).backgroundColor
      : "#3b82f6";
    const unplayed = unplayedProbeRef.current
      ? getComputedStyle(unplayedProbeRef.current).backgroundColor
      : "#4b5563";
    return { played, unplayed };
  }, []);

  // Update time display directly (no React re-render)
  const updateTimeDisplay = useCallback((current: number, total: number) => {
    const el = timeRef.current;
    if (el) el.textContent = `${formatTime(current)} / ${formatTime(total)}`;
  }, []);

  // Resample peaks to exactly match the target number of bars
  const resample = useCallback((data: number[], targetBars: number): number[] => {
    if (data.length === targetBars) return data;
    if (data.length > targetBars) {
      // Downsample: preserve peaks
      const ratio = data.length / targetBars;
      const result: number[] = [];
      for (let i = 0; i < targetBars; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.floor((i + 1) * ratio);
        let peak = 0;
        for (let j = start; j < end; j++) {
          if (data[j] > peak) peak = data[j];
        }
        result.push(peak);
      }
      return result;
    }
    // Upsample: linear interpolation
    const ratio = (data.length - 1) / (targetBars - 1);
    const result: number[] = [];
    for (let i = 0; i < targetBars; i++) {
      const srcIndex = i * ratio;
      const lo = Math.floor(srcIndex);
      const hi = Math.min(lo + 1, data.length - 1);
      const frac = srcIndex - lo;
      result.push(data[lo] * (1 - frac) + data[hi] * frac);
    }
    return result;
  }, []);

  // Draw waveform on canvas
  const draw = useCallback((progress: number) => {
    const canvas = canvasRef.current;
    const data = peaksRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const bars = resample(data, displayWidth);
    const barCount = bars.length;
    const centerY = displayHeight / 2;
    const { played, unplayed } = getColors();

    for (let i = 0; i < barCount; i++) {
      const barHeight = Math.max(2, bars[i] * displayHeight * 0.85);
      const y = centerY - barHeight / 2;

      ctx.fillStyle = i / barCount <= progress ? played : unplayed;
      ctx.fillRect(i, y, 1, barHeight);
    }
  }, [getColors, resample]);

  // Animation loop during playback — no React state updates
  const animate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const progress = audio.duration ? audio.currentTime / audio.duration : 0;
    updateTimeDisplay(audio.currentTime, audio.duration || 0);
    draw(progress);

    rafRef.current = requestAnimationFrame(animate);
  }, [draw, updateTimeDisplay]);

  // Fetch waveform peaks
  useEffect(() => {
    const controller = new AbortController();
    fetch(waveformUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load waveform");
        return res.json();
      })
      .then((data: number[]) => {
        peaksRef.current = data;
        setPeaks(data);
        draw(0);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [waveformUrl, draw]);

  // Set up audio and auto-play
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = src;
    audio.load();
    audio.play().then(() => setIsPlaying(true)).catch(() => {});

    const handleEnded = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
      updateTimeDisplay(audio.duration || 0, audio.duration || 0);
      draw(1);
      onEndedRef.current?.();
    };

    const handleLoadedMetadata = () => {
      updateTimeDisplay(0, audio.duration);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      rafRef.current = requestAnimationFrame(animate);
    };

    const handlePause = () => {
      setIsPlaying(false);
      cancelAnimationFrame(rafRef.current);
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      cancelAnimationFrame(rafRef.current);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.pause();
    };
  }, [src, animate, draw, updateTimeDisplay]);

  // Redraw when peaks load
  useEffect(() => {
    if (peaks) draw(0);
  }, [peaks, draw]);

  // Handle resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      const audio = audioRef.current;
      const progress = audio && audio.duration ? audio.currentTime / audio.duration : 0;
      // Reset canvas dimensions so next draw recalculates
      canvas.width = 0;
      canvas.height = 0;
      draw(progress);
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !audio.duration) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = ratio * audio.duration;
    updateTimeDisplay(audio.currentTime, audio.duration);
    draw(ratio);
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex items-center gap-3">
        <audio ref={audioRef} preload="metadata" />
        {/* Hidden probe elements to resolve theme colors for canvas */}
        <span ref={playedProbeRef} className="bg-primary" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} />
        <span ref={unplayedProbeRef} className="bg-muted-foreground/50" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} />

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={togglePlayPause}
          disabled={!peaks}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>

        <div className="relative flex-1 min-w-0">
          {!peaks ? (
            <div className="flex items-center justify-center h-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="w-full h-16 cursor-pointer"
              style={{ touchAction: "none" }}
              onClick={handleCanvasClick}
            />
          )}
        </div>

        <span
          ref={timeRef}
          className="text-xs font-mono text-muted-foreground shrink-0 tabular-nums w-[5.5rem] text-right"
        >
          0:00 / 0:00
        </span>
      </div>

      <LevelMeter audioElement={audioRef.current} active={isPlaying} />
    </div>
  );
}
