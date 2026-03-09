"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardMixerState } from "@/components/card-mixer";
import type { Status, Recording, DeviceState, PlaybackState } from "@/types/dashboard";

const DEFAULT_STATUS: Status = {
  streaming: false,
  recording: false,
  recording_file: null,
  recording_started: null,
  record_chunk_minutes: 0,
  client_record_max_minutes: 30,
  server_playback: null,
  vox: { active: false, state: "idle", currentLevel: -96, threshold: -30, recordingDuration: 0, recordingFilename: null, silenceRemaining: 0, config: { threshold: -30, triggerMs: 500, preBufferSecs: 5, postSilenceSecs: 10 } },
  compressor: { enabled: false, threshold: -20, ratio: 4, makeup: 6, attack: 20, release: 250 },
};

export function useDataFetching() {
  const [mounted, setMounted] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [status, setStatus] = useState<Status>(DEFAULT_STATUS);
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const [cardMixers, setCardMixers] = useState<CardMixerState[] | null>(null);
  const serverPlaybackPendingRef = useRef(false);
  const setServerPlayingFileRef = useRef<React.Dispatch<React.SetStateAction<string | null>> | null>(null);

  const statusAbortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    statusAbortRef.current?.abort();
    const controller = new AbortController();
    statusAbortRef.current = controller;
    try {
      const res = await fetch("/api/status", { signal: controller.signal });
      if (res.ok && !controller.signal.aborted) {
        const data = await res.json();
        if (!controller.signal.aborted) {
          setStatus(data);
          setStatusLoaded(true);
          if (!serverPlaybackPendingRef.current) {
            setServerPlayingFileRef.current?.((prev) => prev && !data.server_playback ? null : prev);
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }, []);

  const fetchRecordings = useCallback(async () => {
    try {
      const res = await fetch("/api/recordings");
      if (res.ok) {
        const recs: Recording[] = await res.json();
        setRecordings(recs);
        return recs;
      }
    } catch {}
    return null;
  }, []);

  const fetchAllMixers = useCallback(async () => {
    try {
      const res = await fetch("/api/audio/mixer/all");
      if (res.ok) setCardMixers(await res.json());
    } catch {}
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/audio/devices");
      if (res.ok) setDeviceState(await res.json());
    } catch {}
  }, []);

  const fetchPlaybackDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/audio/playback");
      if (res.ok) setPlaybackState(await res.json());
    } catch {}
  }, []);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    fetchStatus();
    fetchRecordings();
    fetchAllMixers();
    fetchDevices();
    fetchPlaybackDevices();
    const statusInterval = setInterval(fetchStatus, 3000);
    const recordingsInterval = setInterval(fetchRecordings, 10000);
    const mixerInterval = setInterval(fetchAllMixers, 5000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(recordingsInterval);
      clearInterval(mixerInterval);
    };
  }, [fetchStatus, fetchRecordings, fetchAllMixers, fetchDevices, fetchPlaybackDevices]);

  return {
    mounted, statusLoaded, status, recordings, setRecordings,
    deviceState, setDeviceState, playbackState, setPlaybackState, cardMixers, setCardMixers,
    serverPlaybackPendingRef, setServerPlayingFileRef,
    fetchStatus, fetchRecordings, fetchAllMixers, fetchDevices, fetchPlaybackDevices,
  };
}
