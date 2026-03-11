"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";

interface MonitorConfig {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  chunkSamples: number;
}

export function useMonitorStream({
  audioContextRef,
  ensureAudioContext,
}: {
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  ensureAudioContext: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const configRef = useRef<MonitorConfig | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const intentionalCloseRef = useRef(false);

  const connect = useCallback(() => {
    if (wsRef.current) return;
    ensureAudioContext();
    setLoading(true);
    intentionalCloseRef.current = false;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/monitor`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[monitor-ws] connected");
    };

    ws.onmessage = (event) => {
      // Config message (JSON string)
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "config") {
            configRef.current = msg;
            setupAudioGraph(msg);
            setLoading(false);
            setConnected(true);
          }
        } catch {
          console.warn("[monitor-ws] failed to parse config message");
        }
        return;
      }

      // PCM data (ArrayBuffer)
      const ctx = audioContextRef.current;
      if (!ctx || !analyserRef.current) return;

      const data = new Int16Array(event.data);
      const config = configRef.current;
      if (!config) return;

      // Convert Int16 PCM to Float32
      const float32 = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) {
        float32[i] = data[i] / 32768;
      }

      // Create AudioBuffer and schedule playback
      const audioBuffer = ctx.createBuffer(config.channels, float32.length, config.sampleRate);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyserRef.current);

      // Schedule with minimal jitter buffer
      const now = ctx.currentTime;
      if (nextStartTimeRef.current < now) {
        // Fallen behind or first chunk — schedule 50ms ahead for buffer
        nextStartTimeRef.current = now + 0.05;
      }
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
    };

    ws.onclose = (event) => {
      console.log(`[monitor-ws] closed: ${event.code} ${event.reason}`);
      cleanup();
      if (!intentionalCloseRef.current && event.code !== 1000) {
        toast.error("Monitor stream disconnected");
      }
    };

    ws.onerror = () => {
      console.error("[monitor-ws] error");
      cleanup();
      setLoading(false);
      toast.error("Failed to connect to monitor stream");
    };
  }, [audioContextRef, ensureAudioContext]);

  function setupAudioGraph(config: MonitorConfig) {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    // Create analyser for level meter
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
    }

    // Create gain node for volume control
    if (!gainRef.current) {
      gainRef.current = ctx.createGain();
      gainRef.current.gain.value = 1;
    }

    // Wire: source → analyser → gain → destination
    analyserRef.current.connect(gainRef.current);
    gainRef.current.connect(ctx.destination);

    nextStartTimeRef.current = 0;
    console.log(`[monitor-ws] audio graph ready: ${config.sampleRate}Hz, ${config.channels}ch`);
  }

  function cleanup() {
    wsRef.current = null;
    configRef.current = null;
    nextStartTimeRef.current = 0;
    setConnected(false);
    setLoading(false);

    // Disconnect audio graph
    try { analyserRef.current?.disconnect(); } catch { /* ignore */ }
    try { gainRef.current?.disconnect(); } catch { /* ignore */ }
    analyserRef.current = null;
    gainRef.current = null;
  }

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    const ws = wsRef.current;
    if (ws) {
      ws.close(1000, "User stopped");
    }
    cleanup();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      wsRef.current?.close(1000, "Unmount");
      cleanup();
    };
  }, []);

  return {
    monitorConnected: connected,
    monitorLoading: loading,
    monitorAnalyserRef: analyserRef,
    connectMonitor: connect,
    disconnectMonitor: disconnect,
  };
}
