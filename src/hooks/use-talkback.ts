"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { DEFAULT_EFFECTS, type TalkbackEffects } from "@/lib/talkback-effects";

export function useTalkback() {
  const [talkbackEffects, setTalkbackEffects] = useLocalStorage<TalkbackEffects>("talkback-effects", DEFAULT_EFFECTS);
  const talkbackEffectsRef = useRef(talkbackEffects);
  talkbackEffectsRef.current = talkbackEffects;
  const [talkbackActive, setTalkbackActive] = useState(false);
  const [talkbackRejected, setTalkbackRejected] = useState(false);
  const talkbackWsRef = useRef<WebSocket | null>(null);
  const talkbackStreamRef = useRef<MediaStream | null>(null);
  const talkbackContextRef = useRef<AudioContext | null>(null);
  const talkbackWorkletRef = useRef<AudioWorkletNode | null>(null);
  const talkbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const talkbackAbortRef = useRef(false);

  function stopTalkback() {
    talkbackAbortRef.current = true;
    talkbackWorkletRef.current?.disconnect();
    talkbackWorkletRef.current = null;
    talkbackAnalyserRef.current = null;
    if (talkbackContextRef.current?.state !== "closed") talkbackContextRef.current?.close();
    talkbackContextRef.current = null;
    talkbackStreamRef.current?.getTracks().forEach((t) => t.stop());
    talkbackStreamRef.current = null;
    const ws = talkbackWsRef.current;
    talkbackWsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
    setTalkbackActive(false);
  }

  async function startTalkback() {
    if (talkbackWsRef.current || talkbackStreamRef.current) return;
    setTalkbackRejected(false);
    setTalkbackActive(true);
    talkbackAbortRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 } });
      if (talkbackAbortRef.current) { stream.getTracks().forEach((t) => t.stop()); setTalkbackActive(false); return; }
      talkbackStreamRef.current = stream;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams();
      params.set("effects", JSON.stringify(talkbackEffectsRef.current));
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/talkback?${params}`);
      ws.binaryType = "arraybuffer";
      talkbackWsRef.current = ws;
      ws.onclose = (e) => { if (e.code === 4409) { setTalkbackRejected(true); toast.error("Talkback already in use by another client"); } stopTalkback(); };
      ws.onerror = () => stopTalkback();
      ws.onopen = async () => {
        if (talkbackAbortRef.current) { ws.close(); return; }
        const ctx = new AudioContext({ sampleRate: 48000 });
        talkbackContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        talkbackAnalyserRef.current = analyser;
        await ctx.audioWorklet.addModule("/talkback-processor.js");
        const worklet = new AudioWorkletNode(ctx, "talkback-processor");
        worklet.port.onmessage = (e: MessageEvent) => { if (ws.readyState === WebSocket.OPEN) ws.send(e.data as ArrayBuffer); };
        source.connect(worklet);
        talkbackWorkletRef.current = worklet;
      };
    } catch (err) {
      const msg = err instanceof DOMException
        ? err.name === "NotAllowedError" ? "Microphone permission denied" : err.name === "NotFoundError" ? "No microphone found" : err.message
        : err instanceof Error ? err.message : "Unknown error";
      toast.error(`Talkback failed: ${msg}`);
      stopTalkback();
    }
  }

  return {
    talkbackActive, talkbackRejected, talkbackEffects, setTalkbackEffects,
    talkbackAnalyserRef, talkbackEffectsRef, startTalkback, stopTalkback,
  };
}
