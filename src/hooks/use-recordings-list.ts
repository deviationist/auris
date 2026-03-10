"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { toast } from "sonner";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { Status, Recording } from "@/types/dashboard";

export function useRecordingsList({
  recordings, setRecordings, fetchRecordings, fetchStatus, status,
}: {
  recordings: Recording[] | null;
  setRecordings: React.Dispatch<React.SetStateAction<Recording[] | null>>;
  fetchRecordings: () => Promise<unknown>;
  fetchStatus: () => Promise<void>;
  status: Status;
}) {
  const [recordingsOpen, setRecordingsOpen] = useLocalStorage("auris:recordingsOpen", true);
  const [recordingsSearch, setRecordingsSearch] = useQueryState("q", { defaultValue: "", history: "replace", shallow: true, clearOnDefault: true });
  const [recordingsDateFilter, setRecordingsDateFilter] = useQueryState("date", parseAsStringLiteral(["all", "today", "7d", "30d"] as const).withDefault("all").withOptions({ history: "replace", shallow: true, clearOnDefault: true }));
  const [recordingsDeviceFilter, setRecordingsDeviceFilter] = useQueryState("device", { defaultValue: "all", history: "replace", shallow: true, clearOnDefault: true });
  const [recordingsPageSize, setRecordingsPageSize] = useState(20);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(true);
  const [serverPlayingFile, setServerPlayingFile] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const serverPlaybackPendingRef = useRef(false);

  const recordingDevices = useMemo(() => {
    if (!recordings) return [];
    const counts = new Map<string, number>();
    for (const r of recordings) { const d = r.device || "Unknown"; counts.set(d, (counts.get(d) || 0) + 1); }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [recordings]);

  const filteredRecordings = useMemo(() => {
    if (!recordings) return null;
    let filtered = recordings;
    if (recordingsSearch.trim()) { const q = recordingsSearch.trim().toLowerCase(); filtered = filtered.filter(r => r.filename.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q)); }
    if (recordingsDateFilter !== "all") {
      const now = Date.now();
      const cutoff = { today: now - 24 * 60 * 60 * 1000, "7d": now - 7 * 24 * 60 * 60 * 1000, "30d": now - 30 * 24 * 60 * 60 * 1000 }[recordingsDateFilter];
      filtered = filtered.filter(r => r.createdAt >= cutoff);
    }
    if (recordingsDeviceFilter !== "all") filtered = filtered.filter(r => (r.device || "Unknown") === recordingsDeviceFilter);
    return filtered;
  }, [recordings, recordingsSearch, recordingsDateFilter, recordingsDeviceFilter]);

  const visibleRecordings = useMemo(() => filteredRecordings?.slice(0, recordingsPageSize) ?? null, [filteredRecordings, recordingsPageSize]);

  useEffect(() => { setRecordingsPageSize(20); }, [recordingsSearch, recordingsDateFilter, recordingsDeviceFilter]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) setRecordingsPageSize(prev => prev + 20); }, { threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredRecordings]);

  function playRecording(filename: string, autoPlay = true) {
    setShouldAutoPlay(autoPlay);
    setPlayingFile((prev) => prev === filename ? null : filename);
  }

  async function deleteRecording(filename: string) {
    setDeletingFile(filename);
    try {
      const res = await fetch(`/api/recordings/${encodeURIComponent(filename)}`, { method: "DELETE" });
      if (res.ok) { if (playingFile === filename) setPlayingFile(null); await fetchRecordings(); toast.success("Recording deleted"); }
      else toast.error("Failed to delete recording");
    } catch { toast.error("Failed to delete recording"); }
    finally { setDeletingFile(null); }
  }

  async function saveRecordingName(filename: string, name: string) {
    try {
      const res = await fetch(`/api/recordings/${encodeURIComponent(filename)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (res.ok) setRecordings((prev) => prev?.map((r) => r.filename === filename ? { ...r, name: name.trim() || null } : r) ?? null);
      else toast.error("Failed to rename recording");
    } catch { toast.error("Failed to rename recording"); }
    setEditingName(null);
  }

  async function startServerPlayback(filename: string) {
    serverPlaybackPendingRef.current = true;
    setServerPlayingFile(filename);
    try {
      const res = await fetch("/api/audio/playback/server", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename }) });
      if (!res.ok) { const data = await res.json(); toast.error(data.error || "Failed to start server playback"); setServerPlayingFile(null); return; }
      await fetchStatus();
    } catch { toast.error("Failed to start server playback"); setServerPlayingFile(null); }
    finally { serverPlaybackPendingRef.current = false; }
  }

  async function stopServerPlayback() {
    setServerPlayingFile(null);
    try { await fetch("/api/audio/playback/server", { method: "DELETE" }); await fetchStatus(); } catch { toast.error("Failed to stop server playback"); }
  }

  return {
    recordingsOpen, setRecordingsOpen,
    recordingsSearch, setRecordingsSearch,
    recordingsDateFilter, setRecordingsDateFilter,
    recordingsDeviceFilter, setRecordingsDeviceFilter,
    recordingDevices, filteredRecordings, visibleRecordings, sentinelRef,
    playingFile, shouldAutoPlay, serverPlayingFile, setServerPlayingFile, serverPlaybackPendingRef,
    editingName, setEditingName, editingNameValue, setEditingNameValue,
    deletingFile, deleteRecording, saveRecordingName, playRecording,
    startServerPlayback, stopServerPlayback,
  };
}
