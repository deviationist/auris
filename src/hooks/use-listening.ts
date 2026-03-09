"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Status } from "@/types/dashboard";

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

async function waitForStream(timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) return false;
    try {
      const res = await fetch("/api/status", { signal });
      if (res.ok) { const s = await res.json(); if (s.streaming) return true; }
    } catch { if (signal?.aborted) return false; }
    await abortableSleep(300, signal);
  }
  return false;
}

export function useListening({
  audioRef, audioContextRef, ensureAudioContext, fetchStatus, status,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  ensureAudioContext: () => void;
  fetchStatus: () => Promise<void>;
  status: Status;
}) {
  const [liveConnected, setLiveConnected] = useState(false);
  const [listenLoading, setListenLoading] = useState(false);
  const [listenReconnecting, setListenReconnecting] = useState(false);
  const [toneLoading, setToneLoading] = useState(false);
  const [toneConnected, setToneConnected] = useState(false);
  const listenInitiatedStreamRef = useRef(false);
  const listenAbortRef = useRef<AbortController | null>(null);
  const toneAbortRef = useRef<AbortController | null>(null);
  const toneCleanupRef = useRef<(() => void) | null>(null);
  const toneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStopRef = useRef<Promise<void> | null>(null);

  function connectLiveAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioContextRef.current?.state === "suspended") audioContextRef.current.resume();
    const streamUrl = process.env.NEXT_PUBLIC_STREAM_URL || "/stream/mic";
    audio.src = `${streamUrl}?t=${Date.now()}`;
    audio.load();
    audio.play().catch(() => setListenLoading(false));
    audio.onplaying = () => {
      setListenLoading(false);
      setListenReconnecting(false);
      setLiveConnected(true);
      audio.onplaying = null;
    };
  }

  function disconnectLiveAudio() {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); audio.onplaying = null; }
    setLiveConnected(false);
    setListenLoading(false);
    setListenReconnecting(false);
  }

  useEffect(() => {
    const handleUnload = () => {
      if (listenInitiatedStreamRef.current && !status.recording) {
        navigator.sendBeacon("/api/stream/stop");
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [status.recording]);

  async function startListening() {
    ensureAudioContext();
    const controller = new AbortController();
    listenAbortRef.current = controller;
    setListenLoading(true);
    try {
      if (pendingStopRef.current) { await pendingStopRef.current; if (controller.signal.aborted) return; }
      await fetch("/api/stream/start", { method: "POST", signal: controller.signal });
      if (controller.signal.aborted) return;
      let streaming = false;
      try { const res = await fetch("/api/status", { signal: controller.signal }); if (res.ok) streaming = (await res.json()).streaming; } catch { if (controller.signal.aborted) return; }
      if (!streaming) {
        listenInitiatedStreamRef.current = true;
        const ready = await waitForStream(5000, controller.signal);
        if (controller.signal.aborted) return;
        if (!ready) { toast.error("Stream failed to start"); setListenLoading(false); return; }
      } else {
        listenInitiatedStreamRef.current = !status.recording;
      }
      await fetchStatus();
      if (controller.signal.aborted) return;
      connectLiveAudio();
    } catch {
      if (!controller.signal.aborted) { toast.error("Failed to start listening"); setListenLoading(false); }
    }
  }

  function cancelListening() {
    listenAbortRef.current?.abort();
    listenAbortRef.current = null;
    disconnectLiveAudio();
    if (listenInitiatedStreamRef.current) {
      pendingStopRef.current = fetch("/api/stream/stop", { method: "POST" }).then(() => {}).catch(() => {}).finally(() => { pendingStopRef.current = null; });
      listenInitiatedStreamRef.current = false;
    }
  }

  async function stopListening() {
    disconnectLiveAudio();
    try { await fetch("/api/stream/stop", { method: "POST" }); await fetchStatus(); } catch {}
    listenInitiatedStreamRef.current = false;
  }

  async function sendTestTone() {
    ensureAudioContext();
    const controller = new AbortController();
    toneAbortRef.current = controller;
    setToneLoading(true);
    if (pendingStopRef.current) { await pendingStopRef.current; if (controller.signal.aborted) return; }
    let streaming = status.streaming;
    try { const res = await fetch("/api/status", { signal: controller.signal }); if (res.ok) streaming = (await res.json()).streaming; } catch { if (controller.signal.aborted) return; }
    if (liveConnected || streaming) {
      await stopListening();
      const start = Date.now();
      while (Date.now() - start < 3000) {
        if (controller.signal.aborted) return;
        const res = await fetch("/api/status", { signal: controller.signal });
        if (res.ok) { const s = await res.json(); if (!s.streaming) break; }
        await abortableSleep(300, controller.signal);
      }
    }
    if (controller.signal.aborted) return;
    try {
      const res = await fetch("/api/stream/test-tone", { method: "POST", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!res.ok) { setToneLoading(false); return; }
      const audio = audioRef.current;
      if (audio) {
        const streamUrl = process.env.NEXT_PUBLIC_STREAM_URL || "/stream/mic";
        audio.src = `${streamUrl}?t=${Date.now()}`;
        audio.load();
        audio.play().catch(() => {});
        audio.onplaying = () => { setToneConnected(true); audio.onplaying = null; };
        const cleanup = () => {
          toneCleanupRef.current = null;
          audio.removeEventListener("ended", cleanup);
          audio.removeEventListener("error", cleanup);
          toneTimeoutRef.current = setTimeout(() => {
            toneTimeoutRef.current = null;
            setToneLoading(false);
            setToneConnected(false);
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
          }, 500);
        };
        toneCleanupRef.current = cleanup;
        audio.addEventListener("ended", cleanup);
        audio.addEventListener("error", cleanup);
      }
    } catch { if (!controller.signal.aborted) setToneLoading(false); }
  }

  function cancelTestTone() {
    toneAbortRef.current?.abort();
    toneAbortRef.current = null;
    if (toneTimeoutRef.current) { clearTimeout(toneTimeoutRef.current); toneTimeoutRef.current = null; }
    const audio = audioRef.current;
    if (audio) {
      const cleanup = toneCleanupRef.current;
      if (cleanup) { audio.removeEventListener("ended", cleanup); audio.removeEventListener("error", cleanup); toneCleanupRef.current = null; }
      audio.onplaying = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setToneLoading(false);
    setToneConnected(false);
    pendingStopRef.current = fetch("/api/stream/test-tone", { method: "DELETE" }).then(() => {}).catch(() => {}).finally(() => { pendingStopRef.current = null; });
  }

  return {
    liveConnected, listenLoading, listenReconnecting, toneLoading, toneConnected,
    startListening, cancelListening, stopListening, sendTestTone, cancelTestTone,
    disconnectLiveAudio, listenInitiatedStreamRef,
  };
}
