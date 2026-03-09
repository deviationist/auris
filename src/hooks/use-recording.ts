"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Status } from "@/types/dashboard";

export function useRecording({
  status, fetchStatus, fetchRecordings, ensureAudioContext,
}: {
  status: Status;
  fetchStatus: () => Promise<void>;
  fetchRecordings: () => Promise<unknown>;
  ensureAudioContext: () => void;
}) {
  const [recordLoading, setRecordLoading] = useState(false);
  const [stopRecordDialogOpen, setStopRecordDialogOpen] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const recordStartRef = useRef<number>(0);

  useEffect(() => {
    if (status.recording) {
      if (status.recording_started && recordStartRef.current !== status.recording_started) {
        recordStartRef.current = status.recording_started;
      }
      if (!recordStartRef.current) recordStartRef.current = Date.now();
      const startTime = recordStartRef.current;
      setRecordElapsed(Math.floor((Date.now() - startTime) / 1000));
      const interval = setInterval(() => {
        setRecordElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      recordStartRef.current = 0;
      setRecordElapsed(0);
    }
  }, [status.recording, status.recording_started]);

  async function toggleRecord() {
    ensureAudioContext();
    const wasRecording = status.recording;
    setRecordLoading(true);
    try {
      await fetch(wasRecording ? "/api/record/stop" : "/api/record/start", { method: "POST" });
      await fetchStatus();
      await fetchRecordings();
      toast.success(wasRecording ? "Recording stopped" : "Recording started");
    } finally { setRecordLoading(false); }
  }

  return {
    recordLoading, stopRecordDialogOpen, setStopRecordDialogOpen, recordElapsed, toggleRecord,
  };
}
