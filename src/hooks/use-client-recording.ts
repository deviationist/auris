"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import type { TalkbackEffects } from "@/lib/talkback-effects";

export function useClientRecording({
  talkbackEffectsRef, fetchRecordings, clientRecordMaxMinutes,
}: {
  talkbackEffectsRef: React.MutableRefObject<TalkbackEffects>;
  fetchRecordings: () => Promise<unknown>;
  clientRecordMaxMinutes: number;
}) {
  const [clientRecording, setClientRecording] = useState(false);
  const [clientRecordElapsed, setClientRecordElapsed] = useState(0);
  const [clientRecordUploading, setClientRecordUploading] = useState(false);
  const clientRecorderRef = useRef<MediaRecorder | null>(null);
  const clientStreamRef = useRef<MediaStream | null>(null);
  const clientChunksRef = useRef<Blob[]>([]);
  const clientRecordStartRef = useRef<number>(0);
  const clientRecordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clientRecordContextRef = useRef<AudioContext | null>(null);
  const clientRecordAnalyserRef = useRef<AnalyserNode | null>(null);

  function stopClientRecording() {
    if (clientRecordTimerRef.current) { clearInterval(clientRecordTimerRef.current); clientRecordTimerRef.current = null; }
    if (clientRecorderRef.current?.state === "recording") clientRecorderRef.current.stop();
    clientRecorderRef.current = null;
    clientRecordAnalyserRef.current = null;
    if (clientRecordContextRef.current?.state !== "closed") clientRecordContextRef.current?.close();
    clientRecordContextRef.current = null;
    setClientRecording(false);
    setClientRecordElapsed(0);
  }

  async function startClientRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      clientStreamRef.current = stream;
      clientChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      clientRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) clientChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        clientStreamRef.current?.getTracks().forEach((t) => t.stop());
        clientStreamRef.current = null;
        const blob = new Blob(clientChunksRef.current, { type: mimeType });
        clientChunksRef.current = [];
        if (blob.size === 0) return;
        setClientRecordUploading(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "recording.webm");
          const currentEffects = talkbackEffectsRef.current;
          const hasActiveEffects = Object.values(currentEffects).some((effect) => typeof effect === "object" && "enabled" in effect && effect.enabled);
          if (hasActiveEffects) form.append("effects", JSON.stringify(currentEffects));
          const res = await fetch("/api/recordings/upload", { method: "POST", body: form });
          if (res.ok) { toast.success("Client recording uploaded"); await fetchRecordings(); }
          else { const data = await res.json().catch(() => ({})); toast.error(data.error || "Upload failed"); }
        } catch { toast.error("Upload failed"); }
        finally { setClientRecordUploading(false); }
      };
      const ctx = new AudioContext();
      clientRecordContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      clientRecordAnalyserRef.current = analyser;
      recorder.start(1000);
      clientRecordStartRef.current = Date.now();
      setClientRecordElapsed(0);
      setClientRecording(true);
      clientRecordTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - clientRecordStartRef.current) / 1000);
        setClientRecordElapsed(elapsed);
        const maxSeconds = clientRecordMaxMinutes * 60;
        if (maxSeconds > 0 && elapsed >= maxSeconds) stopClientRecording();
      }, 1000);
    } catch (err) {
      toast.error(err instanceof DOMException && err.name === "NotAllowedError" ? "Microphone access denied" : "Failed to start recording");
    }
  }

  return {
    clientRecording, clientRecordElapsed, clientRecordUploading,
    clientRecordAnalyserRef, startClientRecording, stopClientRecording,
  };
}
