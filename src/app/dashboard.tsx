"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  AudioLines,
  Circle,
  Square,
  Play,
  Download,
  Loader2,
  Volume2,
  AudioWaveform,
  Trash2,
  Sun,
  Moon,
  X,
  Cog,
  ChevronDown,
  LogOut,
  Mic,
  Keyboard,
  Radio,
  Search,
  Speaker,
  Pencil,
  Check,
  Sparkles,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LevelMeter } from "@/components/level-meter";
import { LiveWaveform } from "@/components/live-waveform";
import { WaveformPlayer } from "@/components/waveform-player";
import { CardMixer, type CardMixerState } from "@/components/card-mixer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { DEFAULT_EFFECTS, AUTOTUNE_KEYS, type TalkbackEffects } from "@/lib/talkback-effects";

interface Status {
  streaming: boolean;
  recording: boolean;
  recording_file: string | null;
  recording_started: number | null;
  record_chunk_minutes: number;
  client_record_max_minutes: number;
  server_playback: { filename: string; startedAt: number } | null;
}

interface Recording {
  filename: string;
  name: string | null;
  size: number;
  createdAt: number;
  duration: number | null;
  device: string | null;
  metadata: Record<string, unknown> | null;
  waveformHash: string | null;
}

interface CaptureDevice {
  card: number;
  device: number;
  name: string;
  cardName: string;
  alsaId: string;
}

interface PlaybackDevice {
  card: number;
  device: number;
  name: string;
  cardName: string;
  alsaId: string;
}

interface PlaybackState {
  devices: PlaybackDevice[];
  selected: string;
}

interface DeviceState {
  devices: CaptureDevice[];
  selectedListen: string;
  selectedRecord: string;
  streamBitrate: string;
  recordBitrate: string;
}

const BITRATE_OPTIONS = ["64k", "96k", "128k", "192k", "256k", "320k"];
const CHUNK_OPTIONS = [
  { value: "0", label: "Off" },
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "240", label: "4 hours" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


export default function Dashboard({ authEnabled }: { authEnabled: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({
    streaming: false,
    recording: false,
    recording_file: null,
    recording_started: null,
    record_chunk_minutes: 0,
    client_record_max_minutes: 30,
    server_playback: null,
  });
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [stopRecordDialogOpen, setStopRecordDialogOpen] = useState(false);
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [serverPlayingFile, setServerPlayingFile] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const serverPlaybackPending = useRef(false);
  const [cardMixers, setCardMixers] = useState<CardMixerState[] | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);
  const [mixerLoading, setMixerLoading] = useState(false);
  const [mixerOpen, setMixerOpen] = useLocalStorage("auris:mixerOpen", false);
  const [recordingsOpen, setRecordingsOpen] = useLocalStorage("auris:recordingsOpen", true);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [listenLoading, setListenLoading] = useState(false);
  const [listenReconnecting, setListenReconnecting] = useState(false);
  const [toneLoading, setToneLoading] = useState(false);
  const [toneConnected, setToneConnected] = useState(false);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const [recordingsSearch, setRecordingsSearch] = useQueryState("q", { defaultValue: "", history: "replace", shallow: true, clearOnDefault: true });
  const [recordingsDateFilter, setRecordingsDateFilter] = useQueryState("date", parseAsStringLiteral(["all", "today", "7d", "30d"] as const).withDefault("all").withOptions({ history: "replace", shallow: true, clearOnDefault: true }));
  const [recordingsDeviceFilter, setRecordingsDeviceFilter] = useQueryState("device", { defaultValue: "all", history: "replace", shallow: true, clearOnDefault: true });
  const [recordingsPageSize, setRecordingsPageSize] = useState(20);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const recordStartRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [audioContextReady, setAudioContextReady] = useState(false);
  const listenInitiatedStreamRef = useRef(false);
  const listenAbortRef = useRef<AbortController | null>(null);
  const toneAbortRef = useRef<AbortController | null>(null);
  const toneCleanupRef = useRef<(() => void) | null>(null);
  const toneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStopRef = useRef<Promise<void> | null>(null);

  // Talkback state
  const [talkbackEffects, setTalkbackEffects] = useLocalStorage<TalkbackEffects>("talkback-effects", DEFAULT_EFFECTS);
  const talkbackEffectsRef = useRef(talkbackEffects);
  talkbackEffectsRef.current = talkbackEffects;
  const [talkbackActive, setTalkbackActive] = useState(false);

  const [talkbackRejected, setTalkbackRejected] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const talkbackWsRef = useRef<WebSocket | null>(null);
  const talkbackStreamRef = useRef<MediaStream | null>(null);
  const talkbackContextRef = useRef<AudioContext | null>(null);
  const talkbackWorkletRef = useRef<AudioWorkletNode | null>(null);
  const talkbackAnalyserRef = useRef<AnalyserNode | null>(null);

  const talkbackAbortRef = useRef(false);

  // Client recording state
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

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setStatusLoaded(true);
        // Sync optimistic server playback state with actual status
        // Don't clear while a request is in flight (race with status poll)
        if (!serverPlaybackPending.current) {
          setServerPlayingFile((prev) =>
            prev && !data.server_playback ? null : prev
          );
        }
      }
    } catch {
      // ignore transient errors
    }
  }, []);

  const fetchRecordings = useCallback(async () => {
    try {
      const res = await fetch("/api/recordings");
      if (res.ok) setRecordings(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const fetchAllMixers = useCallback(async () => {
    try {
      const res = await fetch("/api/audio/mixer/all");
      if (res.ok) setCardMixers(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/audio/devices");
      if (res.ok) setDeviceState(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const fetchPlaybackDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/audio/playback");
      if (res.ok) setPlaybackState(await res.json());
    } catch {
      // ignore
    }
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

  // Recording elapsed timer — use recording_started from the status API (DB createdAt)
  // so the timer survives page refreshes. Falls back to Date.now() if not yet available.
  useEffect(() => {
    if (status.recording) {
      // Update ref when the API provides recording_started
      if (status.recording_started && recordStartRef.current !== status.recording_started) {
        recordStartRef.current = status.recording_started;
      }
      if (!recordStartRef.current) {
        recordStartRef.current = Date.now();
      }
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

  // Auto-connect live waveform after page reload when recording is active
  useEffect(() => {
    if (statusLoaded && status.recording && !audioContextReady) {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().then(() => {
          setAudioContextReady(true);
        }).catch(() => {
          // Browser requires user gesture — user will need to tap
        });
      } else {
        setAudioContextReady(true);
      }
    }
  }, [statusLoaded, status.recording, audioContextReady]);

  // Clean up stream on page unload if we started it
  useEffect(() => {
    const handleUnload = () => {
      if (listenInitiatedStreamRef.current && !status.recording) {
        navigator.sendBeacon("/api/stream/stop");
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [status.recording]);

  // Keyboard shortcuts: R = toggle recording, L = toggle listening, T = test tone
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return; // Ignore held-down key repeat
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (document.querySelector("[data-radix-popper-content-wrapper]") || document.querySelector("[role=\"dialog\"]")) return;

      const key = e.key.toLowerCase();
      if (key === "r") {
        e.preventDefault();
        if (recordLoading) return;
        if (status.recording) {
          setStopRecordDialogOpen(true);
        } else {
          toggleRecord();
        }
      } else if (key === "l") {
        e.preventDefault();
        if (toneLoading) return;
        if (listenLoading) {
          cancelListening();
        } else if (liveConnected) {
          stopListening();
        } else {
          startListening();
        }
      } else if (key === "t") {
        e.preventDefault();
        if (status.recording || listenLoading) return;
        if (toneLoading) {
          cancelTestTone();
        } else {
          sendTestTone();
        }
      } else if (key === "k") {
        e.preventDefault();
        if (!talkbackActive) {
          startTalkback();
        }
      } else if (key === "c") {
        e.preventDefault();
        if (!clientRecordUploading) {
          if (clientRecording) {
            stopClientRecording();
          } else {
            startClientRecording();
          }
        }
      }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && talkbackActive) {
        stopTalkback();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [status.recording, recordLoading, listenLoading, liveConnected, toneLoading, talkbackActive, clientRecording, clientRecordUploading]);

  function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }

  async function waitForStream(timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (signal?.aborted) return false;
      try {
        const res = await fetch("/api/status", { signal });
        if (res.ok) {
          const s = await res.json();
          if (s.streaming) return true;
        }
      } catch {
        if (signal?.aborted) return false;
      }
      await abortableSleep(300, signal);
    }
    return false;
  }

  // Must be called synchronously from a click/tap handler so iOS
  // allows the AudioContext to leave the "suspended" state.
  function ensureAudioContext() {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    setAudioContextReady(true);
  }

  async function startListening() {
    ensureAudioContext();
    const controller = new AbortController();
    listenAbortRef.current = controller;
    setListenLoading(true);
    try {
      // Wait for any pending stop from a previous cancel
      if (pendingStopRef.current) {
        await pendingStopRef.current;
        if (controller.signal.aborted) return;
      }

      // Always call stream/start to ensure CAPTURE_STREAM=1 flag is set
      // (the stream may already be running if recording started it)
      await fetch("/api/stream/start", { method: "POST", signal: controller.signal });
      if (controller.signal.aborted) return;

      // Check if stream is already up, otherwise wait for it
      let streaming = false;
      try {
        const res = await fetch("/api/status", { signal: controller.signal });
        if (res.ok) streaming = (await res.json()).streaming;
      } catch {
        if (controller.signal.aborted) return;
      }

      if (!streaming) {
        listenInitiatedStreamRef.current = true;
        const ready = await waitForStream(5000, controller.signal);
        if (controller.signal.aborted) return;
        if (!ready) {
          toast.error("Stream failed to start");
          setListenLoading(false);
          return;
        }
      } else {
        listenInitiatedStreamRef.current = !status.recording;
      }
      await fetchStatus();
      if (controller.signal.aborted) return;
      connectLiveAudio();
    } catch {
      if (!controller.signal.aborted) {
        toast.error("Failed to start listening");
        setListenLoading(false);
      }
    }
  }

  function cancelListening() {
    listenAbortRef.current?.abort();
    listenAbortRef.current = null;
    disconnectLiveAudio();
    if (listenInitiatedStreamRef.current) {
      pendingStopRef.current = fetch("/api/stream/stop", { method: "POST" })
        .then(() => {})
        .catch(() => {})
        .finally(() => { pendingStopRef.current = null; });
      listenInitiatedStreamRef.current = false;
    }
  }

  async function stopListening() {
    disconnectLiveAudio();
    try {
      await fetch("/api/stream/stop", { method: "POST" });
      await fetchStatus();
    } catch {
      // best effort
    }
    listenInitiatedStreamRef.current = false;
  }

  async function toggleRecord() {
    ensureAudioContext();
    const wasRecording = status.recording;
    setRecordLoading(true);
    try {
      const endpoint = wasRecording
        ? "/api/record/stop"
        : "/api/record/start";
      await fetch(endpoint, { method: "POST" });
      await fetchStatus();
      await fetchRecordings();
      toast.success(wasRecording ? "Recording stopped" : "Recording started");
    } finally {
      setRecordLoading(false);
    }
  }

  function connectLiveAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    // Re-resume AudioContext — iOS may have suspended it during the
    // async gap between the user gesture and the stream becoming ready.
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume();
    }
    const streamUrl = process.env.NEXT_PUBLIC_STREAM_URL || "/stream/mic";
    audio.src = `${streamUrl}?t=${Date.now()}`;
    audio.load();
    audio.play().catch(() => setListenLoading(false));
    audio.onplaying = () => {
      setListenLoading(false);
      setListenReconnecting(false);
      setLiveConnected(true);
      audio.onplaying = null;
    };
  }

  function disconnectLiveAudio() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.onplaying = null;
    }
    setLiveConnected(false);
    setListenLoading(false);
    setListenReconnecting(false);
  }

  async function sendTestTone() {
    ensureAudioContext();
    const controller = new AbortController();
    toneAbortRef.current = controller;
    setToneLoading(true);

    // Wait for any pending stop from a previous cancel
    if (pendingStopRef.current) {
      await pendingStopRef.current;
      if (controller.signal.aborted) return;
    }

    // Fetch fresh status — React state may be stale after cancel
    let streaming = status.streaming;
    try {
      const res = await fetch("/api/status", { signal: controller.signal });
      if (res.ok) streaming = (await res.json()).streaming;
    } catch {
      if (controller.signal.aborted) return;
    }

    if (liveConnected || streaming) {
      await stopListening();
      // Wait for the capture service to fully stop
      const start = Date.now();
      while (Date.now() - start < 3000) {
        if (controller.signal.aborted) return;
        const res = await fetch("/api/status", { signal: controller.signal });
        if (res.ok) {
          const s = await res.json();
          if (!s.streaming) break;
        }
        await abortableSleep(300, controller.signal);
      }
    }
    if (controller.signal.aborted) return;
    try {
      const res = await fetch("/api/stream/test-tone", { method: "POST", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setToneLoading(false);
        return;
      }
      // Connect audio immediately (within user gesture context)
      const audio = audioRef.current;
      if (audio) {
        const streamUrl = process.env.NEXT_PUBLIC_STREAM_URL || "/stream/mic";
        audio.src = `${streamUrl}?t=${Date.now()}`;
        audio.load();
        audio.play().catch(() => {});
        audio.onplaying = () => {
          setToneConnected(true);
          audio.onplaying = null;
        };

        const cleanup = () => {
          toneCleanupRef.current = null;
          audio.removeEventListener("ended", cleanup);
          audio.removeEventListener("error", cleanup);
          toneTimeoutRef.current = setTimeout(() => {
            toneTimeoutRef.current = null;
            setToneLoading(false);
            setToneConnected(false);
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
          }, 500);
        };
        toneCleanupRef.current = cleanup;
        audio.addEventListener("ended", cleanup);
        audio.addEventListener("error", cleanup);
      }
    } catch {
      if (!controller.signal.aborted) {
        setToneLoading(false);
      }
    }
  }

  function cancelTestTone() {
    toneAbortRef.current?.abort();
    toneAbortRef.current = null;
    if (toneTimeoutRef.current) {
      clearTimeout(toneTimeoutRef.current);
      toneTimeoutRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      // Remove listeners before clearing audio to prevent stale cleanup firing
      const cleanup = toneCleanupRef.current;
      if (cleanup) {
        audio.removeEventListener("ended", cleanup);
        audio.removeEventListener("error", cleanup);
        toneCleanupRef.current = null;
      }
      audio.onplaying = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setToneLoading(false);
    setToneConnected(false);
    // Kill the test tone process on the server
    pendingStopRef.current = fetch("/api/stream/test-tone", { method: "DELETE" })
      .then(() => {})
      .catch(() => {})
      .finally(() => { pendingStopRef.current = null; });
  }

  async function startTalkback() {
    // Guard against repeated calls (key repeat fires before talkbackActive is set)
    if (talkbackWsRef.current || talkbackStreamRef.current) return;

    setTalkbackRejected(false);
    setTalkbackActive(true); // Set immediately to block repeated keydown calls
    talkbackAbortRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
      });

      // Check if stop was requested while awaiting getUserMedia
      if (talkbackAbortRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        setTalkbackActive(false);
        return;
      }
      talkbackStreamRef.current = stream;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams();
      params.set("effects", JSON.stringify(talkbackEffectsRef.current));
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/talkback?${params}`);
      ws.binaryType = "arraybuffer";
      talkbackWsRef.current = ws;

      ws.onclose = (e) => {
        if (e.code === 4409) {
          setTalkbackRejected(true);
          toast.error("Talkback already in use by another client");
        }
        stopTalkback();
      };
      ws.onerror = () => stopTalkback();

      ws.onopen = async () => {
        // Check if stop was requested while WebSocket was connecting
        if (talkbackAbortRef.current) {
          ws.close();
          return;
        }

        const ctx = new AudioContext({ sampleRate: 48000 });
        talkbackContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);

        // Analyser for level meter (rendered by LevelMeter component)
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        talkbackAnalyserRef.current = analyser;

        // AudioWorklet for PCM capture
        await ctx.audioWorklet.addModule("/talkback-processor.js");
        const worklet = new AudioWorkletNode(ctx, "talkback-processor");
        worklet.port.onmessage = (e: MessageEvent) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(e.data as ArrayBuffer);
          }
        };
        source.connect(worklet);
        talkbackWorkletRef.current = worklet;
      };
    } catch (err) {
      const msg = err instanceof DOMException
        ? err.name === "NotAllowedError"
          ? "Microphone permission denied"
          : err.name === "NotFoundError"
            ? "No microphone found"
            : err.message
        : err instanceof Error ? err.message : "Unknown error";
      toast.error(`Talkback failed: ${msg}`);
      stopTalkback();
    }
  }

  function stopTalkback() {
    talkbackAbortRef.current = true; // Signal any in-flight startTalkback to bail out
    talkbackWorkletRef.current?.disconnect();
    talkbackWorkletRef.current = null;

    talkbackAnalyserRef.current = null;

    if (talkbackContextRef.current?.state !== "closed") {
      talkbackContextRef.current?.close();
    }
    talkbackContextRef.current = null;

    talkbackStreamRef.current?.getTracks().forEach((t) => t.stop());
    talkbackStreamRef.current = null;

    const ws = talkbackWsRef.current;
    talkbackWsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }

    setTalkbackActive(false);
  }

  async function startClientRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      clientStreamRef.current = stream;
      clientChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      clientRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) clientChunksRef.current.push(e.data);
      };

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
          // Include voice effects so the server applies them during transcode
          const currentEffects = talkbackEffectsRef.current;
          const hasActiveEffects = Object.values(currentEffects).some(
            (effect) => typeof effect === "object" && "enabled" in effect && effect.enabled
          );
          if (hasActiveEffects) {
            form.append("effects", JSON.stringify(currentEffects));
          }
          const res = await fetch("/api/recordings/upload", { method: "POST", body: form });
          if (res.ok) {
            toast.success("Client recording uploaded");
            await fetchRecordings();
          } else {
            const data = await res.json().catch(() => ({}));
            toast.error(data.error || "Upload failed");
          }
        } catch {
          toast.error("Upload failed");
        } finally {
          setClientRecordUploading(false);
        }
      };

      // Analyser for level meter
      const ctx = new AudioContext();
      clientRecordContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      clientRecordAnalyserRef.current = analyser;

      recorder.start(1000); // collect data every second
      clientRecordStartRef.current = Date.now();
      setClientRecordElapsed(0);
      setClientRecording(true);

      // Elapsed timer
      clientRecordTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - clientRecordStartRef.current) / 1000);
        setClientRecordElapsed(elapsed);

        // Auto-stop at max duration
        const maxSeconds = status.client_record_max_minutes * 60;
        if (maxSeconds > 0 && elapsed >= maxSeconds) {
          stopClientRecording();
        }
      }, 1000);
    } catch (err) {
      const msg = err instanceof DOMException && err.name === "NotAllowedError"
        ? "Microphone access denied"
        : "Failed to start recording";
      toast.error(msg);
    }
  }

  function stopClientRecording() {
    if (clientRecordTimerRef.current) {
      clearInterval(clientRecordTimerRef.current);
      clientRecordTimerRef.current = null;
    }
    if (clientRecorderRef.current?.state === "recording") {
      clientRecorderRef.current.stop();
    }
    clientRecorderRef.current = null;
    clientRecordAnalyserRef.current = null;
    if (clientRecordContextRef.current?.state !== "closed") {
      clientRecordContextRef.current?.close();
    }
    clientRecordContextRef.current = null;
    setClientRecording(false);
    setClientRecordElapsed(0);
  }

  async function selectPlaybackDevice(alsaId: string) {
    if (alsaId === playbackState?.selected) return;
    try {
      await fetch("/api/audio/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alsaId }),
      });
      await fetchPlaybackDevices();
    } catch {
      // ignore
    }
  }

  async function deleteRecording(filename: string) {
    setDeletingFile(filename);
    try {
      const res = await fetch(
        `/api/recordings/${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        if (playingFile === filename) {
          setPlayingFile(null);
        }
        await fetchRecordings();
        toast.success("Recording deleted");
      } else {
        toast.error("Failed to delete recording");
      }
    } catch {
      toast.error("Failed to delete recording");
    } finally {
      setDeletingFile(null);
    }
  }

  async function saveRecordingName(filename: string, name: string) {
    try {
      const res = await fetch(
        `/api/recordings/${encodeURIComponent(filename)}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }
      );
      if (res.ok) {
        setRecordings((prev) =>
          prev?.map((r) => r.filename === filename ? { ...r, name: name.trim() || null } : r) ?? null
        );
      } else {
        toast.error("Failed to rename recording");
      }
    } catch {
      toast.error("Failed to rename recording");
    }
    setEditingName(null);
  }

  function playRecording(filename: string) {
    if (playingFile === filename) {
      setPlayingFile(null);
      return;
    }
    setPlayingFile(filename);
  }

  async function startServerPlayback(filename: string) {
    serverPlaybackPending.current = true;
    setServerPlayingFile(filename);
    try {
      const res = await fetch("/api/audio/playback/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to start server playback");
        setServerPlayingFile(null);
        return;
      }
      await fetchStatus();
    } catch {
      toast.error("Failed to start server playback");
      setServerPlayingFile(null);
    } finally {
      serverPlaybackPending.current = false;
    }
  }

  async function stopServerPlayback() {
    setServerPlayingFile(null);
    try {
      await fetch("/api/audio/playback/server", { method: "DELETE" });
      await fetchStatus();
    } catch {
      toast.error("Failed to stop server playback");
    }
  }

  async function updateMixer(
    card: number,
    updates: Partial<{ capture: number; micBoost: number; inputSource: string; playbackVolume: number }>
  ) {
    setMixerLoading(true);
    try {
      await fetch("/api/audio/mixer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updates, card }),
      });
      await fetchAllMixers();
    } finally {
      setMixerLoading(false);
    }
  }

  async function selectListenDevice(alsaId: string) {
    if (alsaId === deviceState?.selectedListen) return;
    setDeviceLoading(true);
    try {
      if (liveConnected) {
        disconnectLiveAudio();
      }
      listenInitiatedStreamRef.current = false;
      await fetch("/api/audio/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alsaId, role: "listen" }),
      });
      await Promise.all([fetchDevices(), fetchStatus(), fetchAllMixers()]);
    } finally {
      setDeviceLoading(false);
    }
  }

  async function selectRecordDevice(alsaId: string) {
    if (alsaId === deviceState?.selectedRecord) return;
    setDeviceLoading(true);
    try {
      await fetch("/api/audio/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alsaId, role: "record" }),
      });
      await Promise.all([fetchDevices(), fetchStatus()]);
    } finally {
      setDeviceLoading(false);
    }
  }

  async function setStreamBitrate(bitrate: string) {
    if (bitrate === deviceState?.streamBitrate) return;
    setDeviceLoading(true);
    try {
      if (liveConnected) {
        disconnectLiveAudio();
      }
      listenInitiatedStreamRef.current = false;
      await fetch("/api/audio/bitrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bitrate, role: "listen" }),
      });
      await Promise.all([fetchDevices(), fetchStatus()]);
    } finally {
      setDeviceLoading(false);
    }
  }

  async function setRecordBitrate(bitrate: string) {
    if (bitrate === deviceState?.recordBitrate) return;
    setDeviceLoading(true);
    try {
      await fetch("/api/audio/bitrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bitrate, role: "record" }),
      });
      await fetchDevices();
    } finally {
      setDeviceLoading(false);
    }
  }

  async function setChunkMinutes(value: string) {
    const minutes = parseInt(value, 10);
    if (minutes === status.record_chunk_minutes) return;
    try {
      await fetch("/api/audio/chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });
      await fetchStatus();
    } catch {
      // ignore
    }
  }

  const recordingDevices = useMemo(() => {
    if (!recordings) return [];
    const counts = new Map<string, number>();
    for (const r of recordings) {
      const d = r.device || "Unknown";
      counts.set(d, (counts.get(d) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [recordings]);

  const filteredRecordings = useMemo(() => {
    if (!recordings) return null;
    let filtered = recordings;

    if (recordingsSearch.trim()) {
      const q = recordingsSearch.trim().toLowerCase();
      filtered = filtered.filter(r => r.filename.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q));
    }

    if (recordingsDateFilter !== "all") {
      const now = Date.now();
      const cutoff = {
        today: now - 24 * 60 * 60 * 1000,
        "7d": now - 7 * 24 * 60 * 60 * 1000,
        "30d": now - 30 * 24 * 60 * 60 * 1000,
      }[recordingsDateFilter];
      filtered = filtered.filter(r => r.createdAt >= cutoff);
    }

    if (recordingsDeviceFilter !== "all") {
      filtered = filtered.filter(r => (r.device || "Unknown") === recordingsDeviceFilter);
    }

    return filtered;
  }, [recordings, recordingsSearch, recordingsDateFilter, recordingsDeviceFilter]);

  const visibleRecordings = useMemo(
    () => filteredRecordings?.slice(0, recordingsPageSize) ?? null,
    [filteredRecordings, recordingsPageSize]
  );

  // Reset page size when filters change
  useEffect(() => {
    setRecordingsPageSize(20);
  }, [recordingsSearch, recordingsDateFilter, recordingsDeviceFilter]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setRecordingsPageSize(prev => prev + 20);
        }
      },
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredRecordings]);

  return (
    <main id="main" className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <AudioLines className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Auris</h1>
          <span className="text-sm pt-1 text-muted-foreground">
            Remote Audio Console
          </span>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden [@media(pointer:fine)]:contents">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Keyboard shortcuts"
                    onClick={() => setShortcutsDialogOpen(true)}
                  >
                    <Keyboard className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Keyboard shortcuts</TooltipContent>
              </Tooltip>
            </span>
            <Dialog open={shortcutsDialogOpen} onOpenChange={setShortcutsDialogOpen}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Keyboard Shortcuts</DialogTitle>
                  <DialogDescription>
                    Shortcuts are disabled while typing or when a dialog is open.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Toggle recording</span>
                    <kbd className="border rounded text-xs font-mono bg-muted inline-flex items-center justify-center w-6 h-6 leading-none">R</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Toggle listening</span>
                    <kbd className="border rounded text-xs font-mono bg-muted inline-flex items-center justify-center w-6 h-6 leading-none">L</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Send test tone</span>
                    <kbd className="border rounded text-xs font-mono bg-muted inline-flex items-center justify-center w-6 h-6 leading-none">T</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Push-to-talk (hold)</span>
                    <kbd className="border rounded text-xs font-mono bg-muted inline-flex items-center justify-center w-6 h-6 leading-none">K</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Client record</span>
                    <kbd className="border rounded text-xs font-mono bg-muted inline-flex items-center justify-center w-6 h-6 leading-none">C</kbd>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Tooltip>
              <TooltipTrigger asChild>
                {mounted ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" disabled aria-label="Loading theme">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent>{theme === "dark" ? "Light" : "Dark"} mode</TooltipContent>
            </Tooltip>
            {authEnabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => signOut()}
                  >
                    <LogOut className="h-5 w-5" />
                    <span className="sr-only">Sign out</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sign out</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Recording Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg" role="heading" aria-level={2}>Recording</CardTitle>
                <div className="flex items-center gap-1.5">
                  {!statusLoaded ? (
                    <Badge variant="secondary" role="status" aria-live="polite">
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" /> Loading
                    </Badge>
                  ) : (
                    <Badge
                      variant={status.recording ? "default" : "secondary"}
                      role="status"
                      aria-live="polite"
                      className={
                        status.recording
                          ? "bg-red-600 hover:bg-red-600 animate-pulse"
                          : ""
                      }
                    >
                      {status.recording ? (
                        <>
                          <Circle className="mr-1 h-3 w-3 fill-current" aria-hidden="true" /> REC
                        </>
                      ) : (
                        "Stopped"
                      )}
                    </Badge>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Recording device settings">
                        <Cog className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64" align="end">
                      {deviceState && deviceState.devices.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Recording Device</p>
                          <Select
                            value={deviceState.selectedRecord}
                            onValueChange={selectRecordDevice}
                            disabled={deviceLoading || status.recording}
                          >
                            <SelectTrigger className="text-xs h-8" aria-label="Recording device">
                              <SelectValue placeholder="Select device...">
                                {deviceState.devices.find((d) => d.alsaId === deviceState.selectedRecord)?.cardName ?? deviceState.selectedRecord}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {deviceState.devices.map((d) => (
                                <SelectItem key={d.alsaId} value={d.alsaId} textValue={d.cardName}>
                                  <span>{d.cardName}</span>
                                  <span className="text-muted-foreground text-xs">{d.alsaId}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-sm font-medium pt-2">Quality</p>
                          <Select
                            value={deviceState.recordBitrate}
                            onValueChange={setRecordBitrate}
                            disabled={deviceLoading || status.recording}
                          >
                            <SelectTrigger className="text-xs h-8" aria-label="Recording bitrate">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BITRATE_OPTIONS.map((b) => (
                                <SelectItem key={b} value={b}>
                                  {b}bps{b === "128k" ? " (default)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-sm font-medium pt-2">Auto-split</p>
                          <p className="text-xs text-muted-foreground">Split into consecutive files at this interval</p>
                          <Select
                            value={String(status.record_chunk_minutes)}
                            onValueChange={setChunkMinutes}
                            disabled={deviceLoading || status.recording}
                          >
                            <SelectTrigger className="text-xs h-8" aria-label="Max recording duration">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CHUNK_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading devices...</span>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <CardDescription className="flex items-center justify-between gap-2">
                <span>Record audio source to disk</span>
                {deviceState === null ? (
                  <span className="flex items-center gap-1 text-xs text-foreground/60">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" />
                  </span>
                ) : deviceState.devices.find((d) => d.alsaId === deviceState.selectedRecord)?.cardName ? (
                  <span className="flex items-center gap-1 truncate text-xs font-medium text-foreground/60">
                    <Mic className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {deviceState.devices.find((d) => d.alsaId === deviceState.selectedRecord)!.cardName}
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {status.recording ? (
                <AlertDialog open={stopRecordDialogOpen} onOpenChange={setStopRecordDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={!statusLoaded || recordLoading || toneLoading}
                      variant="destructive"
                      className="w-full"
                    >
                      {recordLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="mr-2 h-4 w-4" />
                      )}
                      Stop Recording
                      <kbd className="pointer-events-none ml-auto text-[10px] opacity-50 border rounded hidden [@media(pointer:fine)]:inline-flex items-center justify-center w-5 h-5 leading-[0] pt-px">R</kbd>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Stop recording?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will stop the current recording and finalize the file.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={toggleRecord}
                      >
                        Stop Recording
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  onClick={toggleRecord}
                  disabled={!statusLoaded || recordLoading || toneLoading}
                  className="w-full gap-1"
                >
                  {recordLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Circle className="mr-2 h-4 w-4 fill-red-500 text-red-500" />
                  )}
                  Start Recording
                  <kbd className="pointer-events-none ml-auto text-[10px] opacity-50 border rounded hidden [@media(pointer:fine)]:inline-flex items-center justify-center w-5 h-5 leading-[0] pt-px">R</kbd>
                </Button>
              )}
              {status.recording && (
                <>
                  <div className="relative">
                    <LiveWaveform
                      active={status.recording}
                      audioContext={audioContextReady ? audioContextRef.current : null}
                      streamUrl="/stream/mic"
                    />
                    {!audioContextReady && (
                      <div
                        className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground cursor-pointer bg-background/80 hover:bg-background/60 transition-colors"
                        role="button"
                        tabIndex={0}
                        aria-label="Connect live waveform"
                        onClick={ensureAudioContext}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") ensureAudioContext(); }}
                      >
                        <AudioWaveform className="h-4 w-4" aria-hidden="true" />
                        <span>Tap to connect waveform</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    {status.recording_file ? (
                      <p className="font-mono truncate" role="status">
                        {status.recording_file}
                      </p>
                    ) : (
                      <p className="flex items-center gap-1.5" role="status">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Loading filename...</span>
                      </p>
                    )}
                    <span className="font-mono tabular-nums ml-auto" role="timer" aria-live="off">
                      {formatDuration(recordElapsed)}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Monitor Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg" role="heading" aria-level={2}>Monitor</CardTitle>
                <div className="flex items-center gap-1.5">
                  {liveConnected ? (
                    <Badge
                      variant="default"
                      role="status"
                      aria-live="polite"
                      className="bg-green-600 hover:bg-green-600 text-white animate-pulse"
                    >
                      <Volume2 className="mr-1 h-3 w-3" aria-hidden="true" /> Listening
                    </Badge>
                  ) : listenLoading ? (
                    <Badge
                      variant="secondary"
                      role="status"
                      aria-live="polite"
                    >
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" /> {listenReconnecting ? "Reconnecting" : "Connecting"}
                    </Badge>
                  ) : toneLoading ? (
                    <Badge
                      variant="secondary"
                      role="status"
                      aria-live="polite"
                    >
                      <AudioWaveform className="mr-1 h-3 w-3" aria-hidden="true" /> Test Tone
                    </Badge>
                  ) : null}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Listening device settings">
                        <Cog className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64" align="end">
                      {deviceState && deviceState.devices.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Listening Device</p>
                          <Select
                            value={deviceState.selectedListen}
                            onValueChange={selectListenDevice}
                            disabled={deviceLoading || liveConnected}
                          >
                            <SelectTrigger className="text-xs h-8" aria-label="Listening device">
                              <SelectValue placeholder="Select device...">
                                {deviceState.devices.find((d) => d.alsaId === deviceState.selectedListen)?.cardName ?? deviceState.selectedListen}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {deviceState.devices.map((d) => (
                                <SelectItem key={d.alsaId} value={d.alsaId} textValue={d.cardName}>
                                  <span>{d.cardName}</span>
                                  <span className="text-muted-foreground text-xs">{d.alsaId}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-sm font-medium pt-2">Quality</p>
                          <Select
                            value={deviceState.streamBitrate}
                            onValueChange={setStreamBitrate}
                            disabled={deviceLoading || liveConnected}
                          >
                            <SelectTrigger className="text-xs h-8" aria-label="Stream bitrate">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BITRATE_OPTIONS.map((b) => (
                                <SelectItem key={b} value={b}>
                                  {b}bps{b === "128k" ? " (default)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading devices...</span>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <CardDescription className="flex items-center justify-between gap-2">
                <span>Listen to live audio input</span>
                {deviceState === null ? (
                  <span className="flex items-center gap-1 text-xs text-foreground/60">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" />
                  </span>
                ) : deviceState.devices.find((d) => d.alsaId === deviceState.selectedListen)?.cardName ? (
                  <span className="flex items-center gap-1 truncate text-xs font-medium text-foreground/60">
                    <Mic className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {deviceState.devices.find((d) => d.alsaId === deviceState.selectedListen)!.cardName}
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={listenLoading ? cancelListening : liveConnected ? stopListening : startListening}
                disabled={toneLoading}
                variant={liveConnected ? "destructive" : "outline"}
                className="w-full gap-1"
              >
                {listenLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Volume2 className="mr-2 h-4 w-4" />
                )}
                {listenLoading ? "Cancel" : liveConnected ? "Stop Listening" : "Listen"}
                <kbd className="pointer-events-none ml-auto text-[10px] opacity-50 border rounded hidden [@media(pointer:fine)]:inline-flex items-center justify-center w-5 h-5 leading-[0] pt-px">L</kbd>
              </Button>

              <Tooltip open={status.recording ? undefined : false}>
                <TooltipTrigger asChild>
                  <span className="block">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toneLoading ? cancelTestTone : sendTestTone}
                      disabled={status.recording || listenLoading}
                      className="w-full gap-1 px-3 has-[>svg]:px-3"
                    >
                      {toneLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <AudioWaveform className="mr-2 h-4 w-4" />
                      )}
                      {toneLoading ? "Cancel" : "Test Tone"}
                      <kbd className="pointer-events-none ml-auto text-[10px] opacity-50 border rounded hidden [@media(pointer:fine)]:inline-flex items-center justify-center w-5 h-5 leading-[0] pt-px">T</kbd>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Stop recording before sending a test tone</p>
                </TooltipContent>
              </Tooltip>

              <audio
                ref={audioRef}
                crossOrigin="anonymous"
                controls={liveConnected || toneConnected}
                className={`live-audio ${liveConnected || toneConnected ? "w-full h-8" : "hidden"}`}
                aria-label="Live audio stream"
              />
              <div className={liveConnected || toneConnected ? "" : "hidden"}>
                <LevelMeter
                  audioElement={audioRef.current}
                  audioContext={audioContextReady ? audioContextRef.current : null}
                  active={liveConnected || toneConnected}
                  streamUrl="/stream/mic"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Talkback Card */}
        <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg" role="heading" aria-level={2}>Talkback</CardTitle>
                <div className="flex items-center gap-1.5">
                  {talkbackActive && (
                    <Badge
                      variant="default"
                      role="status"
                      aria-live="polite"
                      className="bg-orange-600 hover:bg-orange-600 text-white animate-pulse"
                    >
                      <Radio className="mr-1 h-3 w-3" aria-hidden="true" /> On Air
                    </Badge>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Talkback settings">
                        <Cog className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 max-h-[80vh] overflow-y-auto" align="end">
                      {playbackState && playbackState.devices.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Playback Device</p>
                          <Select
                            value={playbackState.selected}
                            onValueChange={selectPlaybackDevice}
                            disabled={talkbackActive}
                          >
                            <SelectTrigger className="text-xs h-8" aria-label="Playback device">
                              <SelectValue placeholder="Select device...">
                                {playbackState.devices.find((d) => d.alsaId === playbackState.selected)?.cardName ?? playbackState.selected}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {playbackState.devices.map((d) => (
                                <SelectItem key={d.alsaId} value={d.alsaId} textValue={d.cardName}>
                                  <span>{d.cardName}</span>
                                  <span className="text-muted-foreground text-xs">{d.alsaId}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading devices...</span>
                        </div>
                      )}

                      <div className="border-t mt-3 pt-3 space-y-3">
                        <p className="text-sm font-medium">Voice Effects</p>

                        {/* Pitch Shift */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Pitch Shift</Label>
                            <Switch
                              checked={talkbackEffects.pitchShift.enabled}
                              onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, pitchShift: { ...talkbackEffects.pitchShift, enabled: v } })}
                            />
                          </div>
                          {talkbackEffects.pitchShift.enabled && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Semitones</span>
                                <span>{talkbackEffects.pitchShift.semitones > 0 ? "+" : ""}{talkbackEffects.pitchShift.semitones}</span>
                              </div>
                              <Slider
                                min={-12} max={12} step={1}
                                value={[talkbackEffects.pitchShift.semitones]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, pitchShift: { ...talkbackEffects.pitchShift, semitones: v } })}
                              />
                            </div>
                          )}
                        </div>

                        {/* Echo */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Echo</Label>
                            <Switch
                              checked={talkbackEffects.echo.enabled}
                              onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, echo: { ...talkbackEffects.echo, enabled: v } })}
                            />
                          </div>
                          {talkbackEffects.echo.enabled && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Delay</span>
                                <span>{Math.round(talkbackEffects.echo.delay)}ms</span>
                              </div>
                              <Slider
                                min={50} max={500} step={10}
                                value={[talkbackEffects.echo.delay]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, echo: { ...talkbackEffects.echo, delay: v } })}
                              />
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Decay</span>
                                <span>{talkbackEffects.echo.decay.toFixed(2)}</span>
                              </div>
                              <Slider
                                min={0} max={1} step={0.05}
                                value={[talkbackEffects.echo.decay]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, echo: { ...talkbackEffects.echo, decay: v } })}
                              />
                            </div>
                          )}
                        </div>

                        {/* Chorus */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Chorus</Label>
                            <Switch
                              checked={talkbackEffects.chorus.enabled}
                              onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, chorus: { ...talkbackEffects.chorus, enabled: v } })}
                            />
                          </div>
                          {talkbackEffects.chorus.enabled && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Depth</span>
                                <span>{talkbackEffects.chorus.depth.toFixed(2)}</span>
                              </div>
                              <Slider
                                min={0.1} max={1} step={0.05}
                                value={[talkbackEffects.chorus.depth]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, chorus: { ...talkbackEffects.chorus, depth: v } })}
                              />
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Speed</span>
                                <span>{talkbackEffects.chorus.speed.toFixed(1)} Hz</span>
                              </div>
                              <Slider
                                min={0.5} max={5} step={0.1}
                                value={[talkbackEffects.chorus.speed]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, chorus: { ...talkbackEffects.chorus, speed: v } })}
                              />
                            </div>
                          )}
                        </div>

                        {/* Flanger */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Flanger</Label>
                            <Switch
                              checked={talkbackEffects.flanger.enabled}
                              onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, flanger: { ...talkbackEffects.flanger, enabled: v } })}
                            />
                          </div>
                          {talkbackEffects.flanger.enabled && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Delay</span>
                                <span>{talkbackEffects.flanger.delay}ms</span>
                              </div>
                              <Slider
                                min={1} max={20} step={1}
                                value={[talkbackEffects.flanger.delay]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, flanger: { ...talkbackEffects.flanger, delay: v } })}
                              />
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Depth</span>
                                <span>{talkbackEffects.flanger.depth}</span>
                              </div>
                              <Slider
                                min={1} max={10} step={1}
                                value={[talkbackEffects.flanger.depth]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, flanger: { ...talkbackEffects.flanger, depth: v } })}
                              />
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Speed</span>
                                <span>{talkbackEffects.flanger.speed.toFixed(1)} Hz</span>
                              </div>
                              <Slider
                                min={0.1} max={5} step={0.1}
                                value={[talkbackEffects.flanger.speed]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, flanger: { ...talkbackEffects.flanger, speed: v } })}
                              />
                            </div>
                          )}
                        </div>

                        {/* Vibrato */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Vibrato</Label>
                            <Switch
                              checked={talkbackEffects.vibrato.enabled}
                              onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, vibrato: { ...talkbackEffects.vibrato, enabled: v } })}
                            />
                          </div>
                          {talkbackEffects.vibrato.enabled && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Frequency</span>
                                <span>{talkbackEffects.vibrato.frequency.toFixed(1)} Hz</span>
                              </div>
                              <Slider
                                min={1} max={20} step={0.5}
                                value={[talkbackEffects.vibrato.frequency]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, vibrato: { ...talkbackEffects.vibrato, frequency: v } })}
                              />
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Depth</span>
                                <span>{talkbackEffects.vibrato.depth.toFixed(2)}</span>
                              </div>
                              <Slider
                                min={0.05} max={1} step={0.05}
                                value={[talkbackEffects.vibrato.depth]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, vibrato: { ...talkbackEffects.vibrato, depth: v } })}
                              />
                            </div>
                          )}
                        </div>

                        {/* Tempo */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Tempo</Label>
                            <Switch
                              checked={talkbackEffects.tempo.enabled}
                              onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, tempo: { ...talkbackEffects.tempo, enabled: v } })}
                            />
                          </div>
                          {talkbackEffects.tempo.enabled && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Factor</span>
                                <span>{talkbackEffects.tempo.factor.toFixed(2)}x</span>
                              </div>
                              <Slider
                                min={0.5} max={2} step={0.05}
                                value={[talkbackEffects.tempo.factor]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, tempo: { ...talkbackEffects.tempo, factor: v } })}
                              />
                            </div>
                          )}
                        </div>

                        {/* Autotune */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Autotune</Label>
                            <Switch
                              checked={talkbackEffects.autotune.enabled}
                              onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, autotune: { ...talkbackEffects.autotune, enabled: v } })}
                            />
                          </div>
                          {talkbackEffects.autotune.enabled && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Key</span>
                              </div>
                              <Select
                                value={talkbackEffects.autotune.key}
                                onValueChange={(v) => setTalkbackEffects({ ...talkbackEffects, autotune: { ...talkbackEffects.autotune, key: v } })}
                              >
                                <SelectTrigger className="text-xs h-7">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {AUTOTUNE_KEYS.map((k) => (
                                    <SelectItem key={k} value={k}>{k}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Strength</span>
                                <span>{talkbackEffects.autotune.strength.toFixed(2)}</span>
                              </div>
                              <Slider
                                min={0} max={1} step={0.05}
                                value={[talkbackEffects.autotune.strength]}
                                onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, autotune: { ...talkbackEffects.autotune, strength: v } })}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <CardDescription className="flex items-center justify-between gap-2">
                <span>Speak through the server speaker</span>
                {playbackState === null ? (
                  <span className="flex items-center gap-1 text-xs text-foreground/60">
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" />
                  </span>
                ) : playbackState.devices.find((d) => d.alsaId === playbackState.selected)?.cardName ? (
                  <span className="flex items-center gap-1 truncate text-xs font-medium text-foreground/60">
                    <Volume2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {playbackState.devices.find((d) => d.alsaId === playbackState.selected)!.cardName}
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button
                  onMouseDown={() => !talkbackActive && startTalkback()}
                  onMouseUp={() => talkbackActive && stopTalkback()}
                  onMouseLeave={() => talkbackActive && stopTalkback()}
                  onTouchStart={(e) => { e.preventDefault(); if (!talkbackActive) startTalkback(); }}
                  onTouchEnd={() => talkbackActive && stopTalkback()}
                  variant={talkbackActive ? "destructive" : "outline"}
                  className={`gap-1 select-none ${process.env.NODE_ENV === "development" ? "flex-1" : "w-full"}`}
                >
                  <Radio className="mr-2 h-4 w-4" />
                  {talkbackActive ? "Release to Stop" : "Hold to Talk"}
                  <kbd className="pointer-events-none ml-auto text-[10px] opacity-50 border rounded hidden [@media(pointer:fine)]:inline-flex items-center justify-center w-5 h-5 leading-[0] pt-px">K</kbd>
                </Button>
                {process.env.NODE_ENV === "development" && (
                  <Button
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={async () => {
                      stopTalkback();
                      await fetch("/api/talkback/stop", { method: "POST" });
                    }}
                  >
                    Force Stop
                  </Button>
                )}
              </div>
              {talkbackActive && (
                <>
                  <LiveWaveform analyserNode={talkbackAnalyserRef.current} active={talkbackActive} />
                  <LevelMeter analyserNode={talkbackAnalyserRef.current} active={talkbackActive} />
                </>
              )}
              {talkbackRejected && (
                <p className="text-xs text-destructive">Talkback is in use by another client.</p>
              )}
              <div>
                <Button
                  id="client-record-btn"
                  onClick={() => clientRecording ? stopClientRecording() : startClientRecording()}
                  disabled={clientRecordUploading}
                  variant={clientRecording ? "destructive" : "outline"}
                  className="w-full gap-1"
                >
                  {clientRecordUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : clientRecording ? (
                    <Square className="mr-2 h-4 w-4" />
                  ) : (
                    <Circle className="mr-2 h-4 w-4 fill-current" />
                  )}
                  {clientRecordUploading
                    ? "Uploading..."
                    : clientRecording
                      ? `Stop (${formatDuration(clientRecordElapsed)})`
                      : "Record"}
                  <kbd className="pointer-events-none ml-auto text-[10px] opacity-50 border rounded hidden [@media(pointer:fine)]:inline-flex items-center justify-center w-5 h-5 leading-[0] pt-px">C</kbd>
                </Button>
                <Label htmlFor="client-record-btn" className="text-xs text-muted-foreground mt-2">
                  Record from browser mic
                </Label>
                {clientRecording && (
                  <>
                    <LiveWaveform analyserNode={clientRecordAnalyserRef.current} active={clientRecording} />
                    <LevelMeter analyserNode={clientRecordAnalyserRef.current} active={clientRecording} />
                  </>
                )}
              </div>
            </CardContent>
          </Card>

        {/* Mixer Card (collapsible) */}
        <Card>
          <button
            type="button"
            className="flex w-full items-center justify-between px-6 text-left"
            onClick={() => setMixerOpen((o) => !o)}
            aria-expanded={mounted && mixerOpen}
            aria-controls="mixer-panel"
          >
            <div className="space-y-2">
              <CardTitle className="text-lg" role="heading" aria-level={2}>Mixer</CardTitle>
              <CardDescription>ALSA mixer levels per card</CardDescription>
            </div>
            <div className="flex items-center justify-center h-7 w-7 shrink-0">
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground ${mounted ? "transition-transform duration-200 opacity-100" : "opacity-0"} ${mounted && mixerOpen ? "rotate-180" : ""}`}
              />
            </div>
          </button>
          {mounted && mixerOpen && (
            <CardContent id="mixer-panel" className="pt-0">
              {cardMixers === null ? (
                <div className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground" role="status" aria-live="polite">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Loading mixer...</span>
                </div>
              ) : cardMixers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No audio cards found
                </p>
              ) : cardMixers.length === 1 ? (
                <CardMixer
                  mixer={cardMixers[0]}
                  onUpdateMixer={updateMixer}
                  loading={mixerLoading}
                />
              ) : (
                <Tabs defaultValue={String(cardMixers[0].card)}>
                  <TabsList className="w-full">
                    {cardMixers.map((m) => (
                      <TabsTrigger key={m.card} value={String(m.card)} className="flex-1">
                        {m.cardName}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {cardMixers.map((m) => (
                    <TabsContent key={m.card} value={String(m.card)} className="pt-4">
                      <CardMixer
                        mixer={m}
                        onUpdateMixer={updateMixer}
                        loading={mixerLoading}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </CardContent>
          )}
        </Card>

        {/* Recordings List (collapsible) */}
        <Card>
          <div className="flex w-full items-start justify-between gap-2 px-6">
            <button
              type="button"
              className="flex flex-1 items-center justify-between text-left min-w-0"
              onClick={() => setRecordingsOpen((o) => !o)}
              aria-expanded={mounted && recordingsOpen}
              aria-controls="recordings-panel"
            >
              <div className="min-w-0 space-y-2">
                <CardTitle className="text-lg" role="heading" aria-level={2}>Recordings</CardTitle>
                <CardDescription>
                  {recordings === null
                    ? "Loading recordings..."
                    : `${recordings.length} recording${recordings.length !== 1 ? "s" : ""} available`}
                </CardDescription>
              </div>
            </button>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Server playback settings">
                      <Cog className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64" align="end">
                    {playbackState && playbackState.devices.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Playback Device</p>
                        <Select
                          value={playbackState.selected}
                          onValueChange={selectPlaybackDevice}
                          disabled={status?.server_playback !== null}
                        >
                          <SelectTrigger className="text-xs h-8" aria-label="Playback device">
                            <SelectValue placeholder="Select device...">
                              {playbackState.devices.find((d) => d.alsaId === playbackState.selected)?.cardName ?? playbackState.selected}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {playbackState.devices.map((d) => (
                              <SelectItem key={d.alsaId} value={d.alsaId} textValue={d.cardName}>
                                <span>{d.cardName}</span>
                                <span className="text-muted-foreground text-xs">{d.alsaId}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading devices...</span>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                <button
                  type="button"
                  className="flex items-center justify-center h-7 w-7"
                  onClick={() => setRecordingsOpen((o) => !o)}
                  aria-expanded={mounted && recordingsOpen}
                  aria-controls="recordings-panel"
                  aria-label={mounted && recordingsOpen ? "Collapse recordings" : "Expand recordings"}
                >
                  <ChevronDown
                    className={`h-5 w-5 text-muted-foreground ${mounted ? "transition-transform duration-200 opacity-100" : "opacity-0"} ${mounted && recordingsOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
              {playbackState === null ? (
                <span className="flex items-center gap-1 text-xs text-foreground/60 pr-1">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" />
                </span>
              ) : playbackState.devices.find((d) => d.alsaId === playbackState.selected)?.cardName ? (
                <span className="flex items-center gap-1 text-xs font-medium text-foreground/60 pr-1">
                  <Volume2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {playbackState.devices.find((d) => d.alsaId === playbackState.selected)!.cardName}
                </span>
              ) : null}
            </div>
          </div>
          {mounted && recordingsOpen && (
          <CardContent id="recordings-panel">
            {recordings === null ? (
              <div className="flex justify-center py-4" role="status" aria-live="polite">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Loading recordings...</span>
              </div>
            ) : recordings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No recordings yet.
              </p>
            ) : (
              <>
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search recordings..."
                    value={recordingsSearch}
                    onChange={(e) => setRecordingsSearch(e.target.value)}
                    className="pl-9 pr-8 h-9"
                  />
                  {recordingsSearch && (
                    <button
                      type="button"
                      onClick={() => setRecordingsSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex gap-1">
                  {(["all", "today", "7d", "30d"] as const).map((preset) => (
                    <Button
                      key={preset}
                      variant={recordingsDateFilter === preset ? "secondary" : "outline"}
                      size="sm"
                      className="h-9 px-3 text-xs"
                      onClick={() => setRecordingsDateFilter(preset)}
                    >
                      {preset === "all" ? "All" : preset === "today" ? "Today" : preset}
                    </Button>
                  ))}
                </div>
                {recordingDevices.length > 1 && (
                  <Select value={recordingsDeviceFilter} onValueChange={setRecordingsDeviceFilter}>
                    <SelectTrigger className="h-9 w-auto min-w-[120px] text-xs" aria-label="Filter by device">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All devices</SelectItem>
                      {recordingDevices.map(([name, count]) => (
                        <SelectItem key={name} value={name}>{name} ({count})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {filteredRecordings && filteredRecordings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No recordings match your filters.
                </p>
              ) : (
              <>
              <Table>
                <TableCaption className="sr-only">List of recorded audio files</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-20">Duration</TableHead>
                    <TableHead className="w-20">Size</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead className="w-40 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRecordings?.map((rec) => {
                    const isActive = status.recording && rec.filename === status.recording_file;
                    const isPlaying = playingFile === rec.filename;
                    const isServerPlaying = serverPlayingFile === rec.filename || status.server_playback?.filename === rec.filename;
                    return (
                    <React.Fragment key={rec.filename}>
                    <TableRow className={`group/row ${isActive ? "bg-red-500/10" : ""} ${isServerPlaying ? "bg-primary/5" : ""} ${isPlaying ? "border-b-0 bg-muted/50" : ""}`}>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          {editingName === rec.filename ? (
                            <form
                              className="flex items-center gap-1 flex-1 min-w-0"
                              onSubmit={(e) => { e.preventDefault(); saveRecordingName(rec.filename, editingNameValue); }}
                            >
                              <Input
                                autoFocus
                                value={editingNameValue}
                                onChange={(e) => setEditingNameValue(e.target.value)}
                                onBlur={() => saveRecordingName(rec.filename, editingNameValue)}
                                onKeyDown={(e) => { if (e.key === "Escape") setEditingName(null); }}
                                className="h-7 text-sm flex-1 min-w-0"
                                placeholder={rec.filename}
                                aria-label="Recording name"
                              />
                              <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Save name">
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </form>
                          ) : (
                            <>
                              <span className="min-w-0">
                                {rec.name ? (
                                  <span className="flex flex-col">
                                    <span className="truncate">{rec.name}</span>
                                    <span className="text-muted-foreground font-mono text-xs truncate">{rec.filename}</span>
                                  </span>
                                ) : (
                                  <span className="font-mono truncate">{rec.filename}</span>
                                )}
                              </span>
                              {rec.metadata?.effects && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex shrink-0" aria-label="Voice effects applied">
                                      <Sparkles className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    <p className="font-medium mb-1">Effects</p>
                                    {Object.entries(rec.metadata.effects as Record<string, Record<string, unknown>>).map(([name, cfg]) => (
                                      <p key={name}>
                                        {name === "pitchShift" ? `Pitch ${(cfg.semitones as number) > 0 ? "+" : ""}${cfg.semitones} st`
                                          : name === "echo" ? `Echo ${cfg.delay}ms`
                                          : name === "chorus" ? "Chorus"
                                          : name === "flanger" ? "Flanger"
                                          : name === "vibrato" ? `Vibrato ${(cfg.frequency as number).toFixed?.(1) ?? cfg.frequency} Hz`
                                          : name === "tempo" ? `Tempo ${cfg.factor}x`
                                          : name === "autotune" ? `Autotune (${cfg.key})`
                                          : name}
                                      </p>
                                    ))}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition-opacity"
                                onClick={() => { setEditingName(rec.filename); setEditingNameValue(rec.name || ""); }}
                                aria-label="Rename"
                                title="Rename"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {isActive && (
                                <Badge variant="secondary" className="bg-red-600 hover:bg-red-600 text-white text-xs animate-pulse shrink-0">
                                  <Circle className="mr-1 h-2 w-2 fill-current" aria-hidden="true" /> REC
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(rec.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">
                        {formatDuration(rec.duration)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {isActive ? "-" : formatBytes(rec.size)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {rec.device || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-9 w-9 ${isServerPlaying ? "text-primary" : ""}`}
                            onClick={() => isServerPlaying ? stopServerPlayback() : startServerPlayback(rec.filename)}
                            disabled={isActive}
                            aria-label={isServerPlaying ? "Stop server playback" : "Play on server"}
                            title={isServerPlaying ? "Stop server playback" : "Play on server"}
                          >
                            {isServerPlaying ? <Square className="h-4 w-4" aria-hidden="true" /> : <Speaker className="h-4 w-4" aria-hidden="true" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => playRecording(rec.filename)}
                            disabled={isActive}
                            aria-label={isPlaying ? "Close player" : "Play"}
                            title={isPlaying ? "Close player" : "Play"}
                          >
                            {isPlaying ? (
                              <X className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <Play className="h-4 w-4" aria-hidden="true" />
                            )}
                          </Button>
                          {isActive ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              disabled
                              aria-label="Download"
                              title="Download"
                            >
                              <Download className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              aria-label="Download"
                              title="Download"
                              asChild
                            >
                              <a
                                href={`/api/recordings/${encodeURIComponent(
                                  rec.filename
                                )}`}
                                download
                              >
                                <Download className="h-4 w-4" aria-hidden="true" />
                              </a>
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                disabled={isActive || deletingFile === rec.filename}
                                aria-label="Delete"
                                title="Delete"
                              >
                                {deletingFile === rec.filename ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete recording?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete <span className="font-mono font-medium">{rec.filename}</span>. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  disabled={deletingFile === rec.filename}
                                  onClick={() => deleteRecording(rec.filename)}
                                >
                                  {deletingFile === rec.filename && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isPlaying && (
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={6} className="p-3">
                          <WaveformPlayer
                            src={`/api/recordings/${encodeURIComponent(rec.filename)}`}
                            waveformUrl={`/api/recordings/${encodeURIComponent(rec.filename)}/waveform${rec.waveformHash ? `?v=${rec.waveformHash}` : ""}`}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <div ref={sentinelRef} />
              {filteredRecordings && visibleRecordings && visibleRecordings.length < filteredRecordings.length && (
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading more...
                </div>
              )}
              {filteredRecordings && visibleRecordings && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Showing {visibleRecordings.length} of {filteredRecordings.length} recording{filteredRecordings.length !== 1 ? "s" : ""}
                  {(recordingsSearch || recordingsDateFilter !== "all" || recordingsDeviceFilter !== "all") && recordings ? ` (${recordings.length} total)` : ""}
                </p>
              )}
              </>
              )}
              </>
            )}
          </CardContent>
          )}
        </Card>

      </div>
    </main>
  );
}
