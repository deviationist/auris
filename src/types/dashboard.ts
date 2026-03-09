import type { TranscriptionSegment } from "@/lib/transcription";

export interface VoxStatus {
  active: boolean;
  state: "idle" | "monitoring" | "recording" | "tail_silence" | "finalizing";
  currentLevel: number;
  threshold: number;
  recordingDuration: number;
  recordingFilename: string | null;
  silenceRemaining: number;
  config: { threshold: number; triggerMs: number; preBufferSecs: number; postSilenceSecs: number };
}

export interface CompressorConfig {
  enabled: boolean;
  threshold: number;
  ratio: number;
  makeup: number;
  attack: number;
  release: number;
}

export interface Status {
  streaming: boolean;
  recording: boolean;
  recording_file: string | null;
  recording_started: number | null;
  record_chunk_minutes: number;
  client_record_max_minutes: number;
  server_playback: { filename: string; startedAt: number } | null;
  vox: VoxStatus;
  compressor: CompressorConfig;
}

export interface Recording {
  filename: string;
  name: string | null;
  size: number;
  createdAt: number;
  duration: number | null;
  device: string | null;
  metadata: Record<string, unknown> | null;
  waveformHash: string | null;
  transcriptionStatus: "pending" | "processing" | "done" | "error" | null;
}

export interface CaptureDevice {
  card: number;
  device: number;
  name: string;
  cardName: string;
  alsaId: string;
}

export interface PlaybackDevice {
  card: number;
  device: number;
  name: string;
  cardName: string;
  alsaId: string;
}

export interface PlaybackState {
  devices: PlaybackDevice[];
  selected: string;
}

export interface DeviceState {
  devices: CaptureDevice[];
  selectedListen: string;
  selectedRecord: string;
  streamBitrate: string;
  recordBitrate: string;
}

export interface TranscriptionData {
  text: string;
  segments: TranscriptionSegment[] | null;
  language: string;
}
