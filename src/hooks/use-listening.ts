"use client";

import { useEffect, useRef, useState } from "react";
import { useMonitorStream } from "@/hooks/use-monitor-stream";

export function useListening({
  audioContextRef, ensureAudioContext,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  ensureAudioContext: () => void;
  fetchStatus: () => Promise<void>;
  status: { recording: boolean };
}) {
  const [liveConnected, setLiveConnected] = useState(false);
  const [listenLoading, setListenLoading] = useState(false);
  const [listenReconnecting, setListenReconnecting] = useState(false);
  const listenAbortRef = useRef<AbortController | null>(null);

  // WebSocket monitor stream
  const monitor = useMonitorStream({ audioContextRef, ensureAudioContext });

  // Sync monitor connection state to liveConnected and listenLoading
  useEffect(() => {
    setLiveConnected(monitor.monitorConnected);
    if (monitor.monitorConnected) {
      setListenLoading(false);
      setListenReconnecting(false);
    }
  }, [monitor.monitorConnected]);

  function disconnectLiveAudio() {
    monitor.disconnectMonitor();
    setLiveConnected(false);
    setListenLoading(false);
    setListenReconnecting(false);
  }

  async function startListening() {
    ensureAudioContext();
    const controller = new AbortController();
    listenAbortRef.current = controller;
    setListenLoading(true);

    if (controller.signal.aborted) return;
    monitor.connectMonitor();
  }

  function cancelListening() {
    listenAbortRef.current?.abort();
    listenAbortRef.current = null;
    disconnectLiveAudio();
  }

  async function stopListening() {
    disconnectLiveAudio();
  }

  return {
    liveConnected, listenLoading, listenReconnecting,
    startListening, cancelListening, stopListening,
    disconnectLiveAudio,
    monitorAnalyserRef: monitor.monitorAnalyserRef,
  };
}
