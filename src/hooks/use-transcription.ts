"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Recording, TranscriptionData } from "@/types/dashboard";

function displayName(recordings: Recording[] | null, filename: string): string {
  const rec = recordings?.find((r) => r.filename === filename);
  return rec?.name || filename;
}

export function useTranscription({
  recordings, setRecordings, fetchRecordings,
}: {
  recordings: Recording[] | null;
  setRecordings: React.Dispatch<React.SetStateAction<Recording[] | null>>;
  fetchRecordings: () => Promise<unknown>;
}) {
  const [transcriptions, setTranscriptions] = useState<Record<string, TranscriptionData | null>>({});
  const [transcribingFiles, setTranscribingFiles] = useState<Set<string>>(new Set());
  const [transcriptionProgress, setTranscriptionProgress] = useState<Record<string, number | null>>({});

  // Sync transcribingFiles with recordings data — add in-progress, remove completed
  useEffect(() => {
    if (!recordings) return;
    const inProgressSet = new Set(
      recordings
        .filter((r) => r.transcriptionStatus === "pending" || r.transcriptionStatus === "processing")
        .map((r) => r.filename)
    );
    setTranscribingFiles((prev) => {
      const next = new Set(prev);
      // Add any in-progress files not yet tracked
      for (const f of inProgressSet) next.add(f);
      // Remove files that are no longer in-progress according to recordings data
      for (const f of prev) {
        if (!inProgressSet.has(f)) {
          const rec = recordings.find((r) => r.filename === f);
          if (rec && rec.transcriptionStatus !== "pending" && rec.transcriptionStatus !== "processing") {
            next.delete(f);
          }
        }
      }
      if (next.size === prev.size && [...next].every((f) => prev.has(f))) return prev;
      return next;
    });
  }, [recordings]);

  // Poll transcription progress
  const pollingRef = useRef(false);
  useEffect(() => {
    if (transcribingFiles.size === 0) return;
    const interval = setInterval(async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        for (const filename of transcribingFiles) {
          try {
            const res = await fetch(`/api/recordings/${encodeURIComponent(filename)}/transcription`);
            if (!res.ok) continue;
            const data = await res.json();
            if (data.status === "done") {
              setTranscriptions((prev) => ({ ...prev, [filename]: { text: data.transcription || "", segments: data.segments ?? null, language: data.language } }));
              setTranscribingFiles((prev) => { const s = new Set(prev); s.delete(filename); return s; });
              setTranscriptionProgress((prev) => { const next = { ...prev }; delete next[filename]; return next; });
              setRecordings((prev) => prev?.map((r) => r.filename === filename ? { ...r, transcriptionStatus: "done" as const } : r) ?? null);
              toast.success(`Transcription complete: ${displayName(recordings, filename)}`);
            } else if (data.status === "error" || !data.status) {
              setTranscribingFiles((prev) => { const s = new Set(prev); s.delete(filename); return s; });
              setTranscriptionProgress((prev) => { const next = { ...prev }; delete next[filename]; return next; });
              if (data.status === "error") {
                setRecordings((prev) => prev?.map((r) => r.filename === filename ? { ...r, transcriptionStatus: "error" as const } : r) ?? null);
                toast.error(`Transcription failed: ${displayName(recordings, filename)}`);
              }
            } else if (data.progress != null) {
              setTranscriptionProgress((prev) => ({ ...prev, [filename]: data.progress }));
            }
          } catch {}
        }
      } finally {
        pollingRef.current = false;
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [transcribingFiles, setRecordings]);

  async function fetchTranscription(filename: string) {
    try {
      const res = await fetch(`/api/recordings/${encodeURIComponent(filename)}/transcription`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "done" && data.transcription) setTranscriptions((prev) => ({ ...prev, [filename]: { text: data.transcription, segments: data.segments ?? null, language: data.language } }));
    } catch {}
  }

  async function triggerTranscription(filename: string, options?: { language?: string; translate?: boolean }) {
    setTranscribingFiles((prev) => new Set(prev).add(filename));
    const hasBody = options?.language || options?.translate !== undefined;
    try {
      const res = await fetch(`/api/recordings/${encodeURIComponent(filename)}/transcription`, {
        method: "POST",
        ...(hasBody ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: options?.language, translate: options?.translate }) } : {}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to start transcription");
        setTranscribingFiles((prev) => { const s = new Set(prev); s.delete(filename); return s; });
        return;
      }
      toast.info(`Transcription started: ${displayName(recordings, filename)}`);
      setTimeout(() => fetchTranscription(filename), 3000);
    } catch {
      toast.error("Failed to start transcription");
      setTranscribingFiles((prev) => { const s = new Set(prev); s.delete(filename); return s; });
    }
  }

  async function cancelTranscriptionFn(filename: string) {
    try { await fetch(`/api/recordings/${encodeURIComponent(filename)}/transcription?cancel=1`, { method: "DELETE" }); } catch {}
    setTranscribingFiles((prev) => { const s = new Set(prev); s.delete(filename); return s; });
    setTranscriptionProgress((prev) => { const next = { ...prev }; delete next[filename]; return next; });
    toast.info(`Transcription cancelled: ${displayName(recordings, filename)}`);
    fetchRecordings();
  }

  return {
    transcriptions, transcribingFiles, transcriptionProgress,
    fetchTranscription, triggerTranscription, cancelTranscriptionFn,
  };
}
