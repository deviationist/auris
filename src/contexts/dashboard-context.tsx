"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CardMixerState } from "@/components/card-mixer";
import type { TalkbackEffects } from "@/lib/talkback-effects";
import type { Status, Recording, DeviceState, PlaybackState, TranscriptionData, CompressorConfig } from "@/types/dashboard";
import { useDataFetching } from "@/hooks/use-data-fetching";
import { useAudioContext } from "@/hooks/use-audio-context";
import { useListening } from "@/hooks/use-listening";
import { useRecording } from "@/hooks/use-recording";
import { useTalkback } from "@/hooks/use-talkback";
import { useClientRecording } from "@/hooks/use-client-recording";
import { useVox } from "@/hooks/use-vox";
import { useDevices } from "@/hooks/use-devices";
import { useRecordingsList } from "@/hooks/use-recordings-list";
import { useTranscription } from "@/hooks/use-transcription";
import { useCompressor } from "@/hooks/use-compressor";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export interface DashboardContextValue {
  // Core state
  mounted: boolean;
  statusLoaded: boolean;
  status: Status;
  recordings: Recording[] | null;

  // Recording
  recordLoading: boolean;
  stopRecordDialogOpen: boolean;
  setStopRecordDialogOpen: (open: boolean) => void;
  recordElapsed: number;
  toggleRecord: () => void;

  // Playback
  playingFile: string | null;
  serverPlayingFile: string | null;
  playRecording: (filename: string) => void;
  startServerPlayback: (filename: string) => void;
  stopServerPlayback: () => void;

  // Editing
  editingName: string | null;
  setEditingName: (filename: string | null) => void;
  editingNameValue: string;
  setEditingNameValue: (value: string) => void;
  saveRecordingName: (filename: string, name: string) => void;
  deletingFile: string | null;
  deleteRecording: (filename: string) => void;

  // Transcription
  transcriptions: Record<string, TranscriptionData | null>;
  transcribingFiles: Set<string>;
  transcriptionProgress: Record<string, number | null>;
  fetchTranscription: (filename: string) => void;
  triggerTranscription: (filename: string, language?: string) => void;
  cancelTranscriptionFn: (filename: string) => void;

  // Devices & mixer
  deviceState: DeviceState | null;
  deviceLoading: boolean;
  playbackState: PlaybackState | null;
  cardMixers: CardMixerState[] | null;
  mixerLoading: boolean;
  mixerOpen: boolean;
  setMixerOpen: (fn: (prev: boolean) => boolean) => void;
  selectRecordDevice: (alsaId: string) => void;
  selectListenDevice: (alsaId: string) => void;
  selectPlaybackDevice: (alsaId: string) => void;
  setRecordBitrate: (bitrate: string) => void;
  setStreamBitrate: (bitrate: string) => void;
  setChunkMinutes: (value: string) => void;
  updateMixer: (card: number, updates: Partial<{ capture: number; micBoost: number; inputSource: string; playbackVolume: number }>) => Promise<void>;

  // Listening
  liveConnected: boolean;
  listenLoading: boolean;
  listenReconnecting: boolean;
  toneLoading: boolean;
  toneConnected: boolean;
  startListening: () => void;
  cancelListening: () => void;
  stopListening: () => void;
  sendTestTone: () => void;
  cancelTestTone: () => void;

  // Audio refs
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  audioContextReady: boolean;
  ensureAudioContext: () => void;

  // Talkback
  talkbackActive: boolean;
  talkbackRejected: boolean;
  talkbackEffects: TalkbackEffects;
  setTalkbackEffects: (effects: TalkbackEffects) => void;
  talkbackAnalyserRef: React.MutableRefObject<AnalyserNode | null>;
  startTalkback: () => void;
  stopTalkback: () => void;

  // Client recording
  clientRecording: boolean;
  clientRecordElapsed: number;
  clientRecordUploading: boolean;
  clientRecordAnalyserRef: React.MutableRefObject<AnalyserNode | null>;
  startClientRecording: () => void;
  stopClientRecording: () => void;

  // Compressor
  compressorConfig: CompressorConfig;
  compressorConfigOpen: boolean;
  setCompressorConfigOpen: (open: boolean) => void;
  compressorConfigLoaded: boolean;
  setCompressorConfigLoaded: (loaded: boolean) => void;
  setCompressorConfig: (config: CompressorConfig) => void;
  saveCompressorConfig: (partial: Partial<CompressorConfig>) => void;

  // VOX
  voxLoading: boolean;
  voxConfig: { threshold: number; triggerMs: number; preBufferSecs: number; postSilenceSecs: number };
  voxConfigOpen: boolean;
  setVoxConfigOpen: (open: boolean) => void;
  voxConfigLoaded: boolean;
  setVoxConfigLoaded: (loaded: boolean) => void;
  setVoxConfig: (config: { threshold: number; triggerMs: number; preBufferSecs: number; postSilenceSecs: number }) => void;
  toggleVox: () => void;
  saveVoxConfig: (partial: Partial<{ threshold: number; triggerMs: number; preBufferSecs: number; postSilenceSecs: number }>) => void;

  // Recordings list
  recordingsOpen: boolean;
  setRecordingsOpen: (fn: (prev: boolean) => boolean) => void;
  recordingsSearch: string;
  setRecordingsSearch: (value: string) => void;
  recordingsDateFilter: string;
  setRecordingsDateFilter: (value: "all" | "today" | "7d" | "30d") => void;
  recordingsDeviceFilter: string;
  setRecordingsDeviceFilter: (value: string) => void;
  recordingDevices: [string, number][];
  filteredRecordings: Recording[] | null;
  visibleRecordings: Recording[] | null;
  sentinelRef: React.RefObject<HTMLDivElement | null>;

  // Header
  shortcutsDialogOpen: boolean;
  setShortcutsDialogOpen: (open: boolean) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const data = useDataFetching();
  const audio = useAudioContext(data.statusLoaded, data.status.recording);
  const listening = useListening({ audioRef: audio.audioRef, audioContextRef: audio.audioContextRef, ensureAudioContext: audio.ensureAudioContext, fetchStatus: data.fetchStatus, status: data.status });
  const recording = useRecording({ status: data.status, fetchStatus: data.fetchStatus, fetchRecordings: data.fetchRecordings, ensureAudioContext: audio.ensureAudioContext });
  const talkback = useTalkback();
  const clientRec = useClientRecording({ talkbackEffectsRef: talkback.talkbackEffectsRef, fetchRecordings: data.fetchRecordings, clientRecordMaxMinutes: data.status.client_record_max_minutes });
  const vox = useVox({ status: data.status, fetchStatus: data.fetchStatus, fetchRecordings: data.fetchRecordings });
  const devices = useDevices({
    deviceState: data.deviceState, playbackState: data.playbackState,
    fetchDevices: data.fetchDevices, fetchStatus: data.fetchStatus, fetchAllMixers: data.fetchAllMixers, fetchPlaybackDevices: data.fetchPlaybackDevices,
    liveConnected: listening.liveConnected, disconnectLiveAudio: listening.disconnectLiveAudio, listenInitiatedStreamRef: listening.listenInitiatedStreamRef,
  });
  const compressor = useCompressor();
  const recList = useRecordingsList({ recordings: data.recordings, setRecordings: data.setRecordings, fetchRecordings: data.fetchRecordings, fetchStatus: data.fetchStatus, status: data.status });
  const transcription = useTranscription({ recordings: data.recordings, setRecordings: data.setRecordings, fetchRecordings: data.fetchRecordings });

  // Wire up cross-hook refs: data fetching needs to clear serverPlayingFile on status poll
  useEffect(() => {
    data.setServerPlayingFileRef.current = recList.setServerPlayingFile;
  }, [data, recList.setServerPlayingFile]);
  useEffect(() => {
    data.serverPlaybackPendingRef.current = recList.serverPlaybackPendingRef.current;
  });

  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  useKeyboardShortcuts({
    statusRecording: data.status.recording, recordLoading: recording.recordLoading,
    listenLoading: listening.listenLoading, liveConnected: listening.liveConnected, toneLoading: listening.toneLoading,
    talkbackActive: talkback.talkbackActive, clientRecording: clientRec.clientRecording, clientRecordUploading: clientRec.clientRecordUploading,
    toggleRecord: recording.toggleRecord, setStopRecordDialogOpen: recording.setStopRecordDialogOpen,
    startListening: listening.startListening, cancelListening: listening.cancelListening, stopListening: listening.stopListening,
    sendTestTone: listening.sendTestTone, cancelTestTone: listening.cancelTestTone,
    startTalkback: talkback.startTalkback, stopTalkback: talkback.stopTalkback,
    startClientRecording: clientRec.startClientRecording, stopClientRecording: clientRec.stopClientRecording,
  });

  const value = useMemo<DashboardContextValue>(() => ({
    mounted: data.mounted, statusLoaded: data.statusLoaded, status: data.status, recordings: data.recordings,
    ...recording,
    playingFile: recList.playingFile, serverPlayingFile: recList.serverPlayingFile,
    playRecording: recList.playRecording, startServerPlayback: recList.startServerPlayback, stopServerPlayback: recList.stopServerPlayback,
    editingName: recList.editingName, setEditingName: recList.setEditingName,
    editingNameValue: recList.editingNameValue, setEditingNameValue: recList.setEditingNameValue,
    saveRecordingName: recList.saveRecordingName, deletingFile: recList.deletingFile, deleteRecording: recList.deleteRecording,
    ...transcription,
    deviceState: data.deviceState, playbackState: data.playbackState, cardMixers: data.cardMixers,
    ...devices,
    ...listening,
    audioRef: audio.audioRef, audioContextRef: audio.audioContextRef, audioContextReady: audio.audioContextReady, ensureAudioContext: audio.ensureAudioContext,
    talkbackActive: talkback.talkbackActive, talkbackRejected: talkback.talkbackRejected,
    talkbackEffects: talkback.talkbackEffects, setTalkbackEffects: talkback.setTalkbackEffects,
    talkbackAnalyserRef: talkback.talkbackAnalyserRef, startTalkback: talkback.startTalkback, stopTalkback: talkback.stopTalkback,
    ...clientRec,
    ...vox,
    ...compressor,
    recordingsOpen: recList.recordingsOpen, setRecordingsOpen: recList.setRecordingsOpen,
    recordingsSearch: recList.recordingsSearch, setRecordingsSearch: recList.setRecordingsSearch,
    recordingsDateFilter: recList.recordingsDateFilter, setRecordingsDateFilter: recList.setRecordingsDateFilter,
    recordingsDeviceFilter: recList.recordingsDeviceFilter, setRecordingsDeviceFilter: recList.setRecordingsDeviceFilter,
    recordingDevices: recList.recordingDevices, filteredRecordings: recList.filteredRecordings,
    visibleRecordings: recList.visibleRecordings, sentinelRef: recList.sentinelRef,
    shortcutsDialogOpen, setShortcutsDialogOpen,
  }), [
    data.mounted, data.statusLoaded, data.status, data.recordings,
    data.deviceState, data.playbackState, data.cardMixers,
    recording,
    recList, transcription, devices, listening, audio, talkback, clientRec, vox, compressor,
    shortcutsDialogOpen,
  ]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
