"use client";

import { useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { DeviceState, PlaybackState } from "@/types/dashboard";
import type { CardMixerState } from "@/components/card-mixer";

export function useDevices({
  deviceState, playbackState,
  fetchDevices, fetchStatus, fetchAllMixers, fetchPlaybackDevices,
  liveConnected, disconnectLiveAudio, listenInitiatedStreamRef,
}: {
  deviceState: DeviceState | null;
  playbackState: PlaybackState | null;
  fetchDevices: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  fetchAllMixers: () => Promise<void>;
  fetchPlaybackDevices: () => Promise<void>;
  liveConnected: boolean;
  disconnectLiveAudio: () => void;
  listenInitiatedStreamRef: React.MutableRefObject<boolean>;
}) {
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [mixerLoading, setMixerLoading] = useState(false);
  const [mixerOpen, setMixerOpen] = useLocalStorage("auris:mixerOpen", false);

  async function selectRecordDevice(alsaId: string) {
    if (alsaId === deviceState?.selectedRecord) return;
    setDeviceLoading(true);
    try {
      await fetch("/api/audio/device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alsaId, role: "record" }) });
      await Promise.all([fetchDevices(), fetchStatus()]);
    } finally { setDeviceLoading(false); }
  }

  async function selectListenDevice(alsaId: string) {
    if (alsaId === deviceState?.selectedListen) return;
    setDeviceLoading(true);
    try {
      if (liveConnected) disconnectLiveAudio();
      listenInitiatedStreamRef.current = false;
      await fetch("/api/audio/device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alsaId, role: "listen" }) });
      await Promise.all([fetchDevices(), fetchStatus(), fetchAllMixers()]);
    } finally { setDeviceLoading(false); }
  }

  async function selectPlaybackDevice(alsaId: string) {
    if (alsaId === playbackState?.selected) return;
    try { await fetch("/api/audio/playback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alsaId }) }); await fetchPlaybackDevices(); } catch {}
  }

  async function setStreamBitrate(bitrate: string) {
    if (bitrate === deviceState?.streamBitrate) return;
    setDeviceLoading(true);
    try {
      if (liveConnected) disconnectLiveAudio();
      listenInitiatedStreamRef.current = false;
      await fetch("/api/audio/bitrate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bitrate, role: "listen" }) });
      await Promise.all([fetchDevices(), fetchStatus()]);
    } finally { setDeviceLoading(false); }
  }

  async function setRecordBitrate(bitrate: string) {
    if (bitrate === deviceState?.recordBitrate) return;
    setDeviceLoading(true);
    try {
      await fetch("/api/audio/bitrate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bitrate, role: "record" }) });
      await fetchDevices();
    } finally { setDeviceLoading(false); }
  }

  async function setChunkMinutes(value: string) {
    const minutes = parseInt(value, 10);
    try { await fetch("/api/audio/chunk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minutes }) }); await fetchStatus(); } catch {}
  }

  async function updateMixer(card: number, updates: Partial<{ capture: number; micBoost: number; inputSource: string; playbackVolume: number }>) {
    setMixerLoading(true);
    try { await fetch("/api/audio/mixer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...updates, card }) }); await fetchAllMixers(); }
    finally { setMixerLoading(false); }
  }

  return {
    deviceLoading, mixerLoading, mixerOpen, setMixerOpen,
    selectRecordDevice, selectListenDevice, selectPlaybackDevice,
    setRecordBitrate, setStreamBitrate, setChunkMinutes, updateMixer,
  };
}
