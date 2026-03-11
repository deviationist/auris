"use client";

import { useEffect } from "react";

export function useKeyboardShortcuts({
  statusRecording, recordLoading, listenLoading, liveConnected,
  talkbackActive, clientRecording, clientRecordUploading,
  toggleRecord, setStopRecordDialogOpen,
  startListening, cancelListening, stopListening,
  startTalkback, stopTalkback,
  startClientRecording, stopClientRecording,
}: {
  statusRecording: boolean;
  recordLoading: boolean;
  listenLoading: boolean;
  liveConnected: boolean;
  talkbackActive: boolean;
  clientRecording: boolean;
  clientRecordUploading: boolean;
  toggleRecord: () => void;
  setStopRecordDialogOpen: (open: boolean) => void;
  startListening: () => void;
  cancelListening: () => void;
  stopListening: () => void;
  startTalkback: () => void;
  stopTalkback: () => void;
  startClientRecording: () => void;
  stopClientRecording: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (document.querySelector("[data-radix-popper-content-wrapper]") || document.querySelector("[role=\"dialog\"]")) return;
      const key = e.key.toLowerCase();
      if (key === "r") { e.preventDefault(); if (recordLoading) return; if (statusRecording) setStopRecordDialogOpen(true); else toggleRecord(); }
      else if (key === "l") { e.preventDefault(); if (listenLoading) cancelListening(); else if (liveConnected) stopListening(); else startListening(); }
      else if (key === "k") { e.preventDefault(); if (!talkbackActive) startTalkback(); }
      else if (key === "c") { e.preventDefault(); if (!clientRecordUploading) { if (clientRecording) stopClientRecording(); else startClientRecording(); } }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && talkbackActive) stopTalkback();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => { document.removeEventListener("keydown", handleKeyDown); document.removeEventListener("keyup", handleKeyUp); };
  }, [statusRecording, recordLoading, listenLoading, liveConnected, talkbackActive, clientRecording, clientRecordUploading,
    toggleRecord, setStopRecordDialogOpen, startListening, cancelListening, stopListening, startTalkback, stopTalkback, startClientRecording, stopClientRecording]);
}
