"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Status {
  streaming: boolean;
  recording: boolean;
  recording_file: string | null;
  recording_started: number | null;
}

interface Recording {
  filename: string;
  size: number;
  createdAt: number;
  duration: number | null;
  device: string | null;
  waveformHash: string | null;
}

interface CaptureDevice {
  card: number;
  device: number;
  name: string;
  cardName: string;
  alsaId: string;
}

interface DeviceState {
  devices: CaptureDevice[];
  selectedListen: string;
  selectedRecord: string;
  streamBitrate: string;
  recordBitrate: string;
}

const BITRATE_OPTIONS = ["64k", "96k", "128k", "192k", "256k", "320k"];

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


export default function Home() {
  const { theme, setTheme } = useTheme();
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({
    streaming: false,
    recording: false,
    recording_file: null,
    recording_started: null,
  });
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [cardMixers, setCardMixers] = useState<CardMixerState[] | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);
  const [mixerLoading, setMixerLoading] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [listenLoading, setListenLoading] = useState(false);
  const [listenReconnecting, setListenReconnecting] = useState(false);
  const [toneLoading, setToneLoading] = useState(false);
  const [toneConnected, setToneConnected] = useState(false);
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

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        setStatus(await res.json());
        setStatusLoaded(true);
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

  useEffect(() => {
    fetchStatus();
    fetchRecordings();
    fetchAllMixers();
    fetchDevices();
    const statusInterval = setInterval(fetchStatus, 3000);
    const recordingsInterval = setInterval(fetchRecordings, 10000);
    const mixerInterval = setInterval(fetchAllMixers, 5000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(recordingsInterval);
      clearInterval(mixerInterval);
    };
  }, [fetchStatus, fetchRecordings, fetchAllMixers, fetchDevices]);

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
    setRecordLoading(true);
    try {
      const endpoint = status.recording
        ? "/api/record/stop"
        : "/api/record/start";
      await fetch(endpoint, { method: "POST" });
      await fetchStatus();
      await fetchRecordings();
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

  async function deleteRecording(filename: string) {
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
    }
  }

  function playRecording(filename: string) {
    if (playingFile === filename) {
      setPlayingFile(null);
      return;
    }
    setPlayingFile(filename);
  }

  async function updateMixer(
    card: number,
    updates: Partial<{ capture: number; micBoost: number; inputSource: string }>
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

  return (
    <main id="main" className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <AudioLines className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Auris</h1>
          <span className="text-sm pt-1 text-muted-foreground">
            Audio Monitor
          </span>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
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
              <CardDescription>
                Record audio source to disk
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {status.recording ? (
                <AlertDialog>
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
                  className="w-full"
                >
                  {recordLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Circle className="mr-2 h-4 w-4 fill-red-500 text-red-500" />
                  )}
                  Start Recording
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
                        onClick={ensureAudioContext}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") ensureAudioContext(); }}
                      >
                        <AudioWaveform className="h-4 w-4" />
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
              <CardDescription>
                Listen to live audio input
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={listenLoading ? cancelListening : liveConnected ? stopListening : startListening}
                disabled={toneLoading}
                variant={liveConnected ? "destructive" : "outline"}
                className="w-full"
              >
                {listenLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Volume2 className="mr-2 h-4 w-4" />
                )}
                {listenLoading ? "Cancel" : liveConnected ? "Stop Listening" : "Listen"}
              </Button>

              <Tooltip open={status.recording ? undefined : false}>
                <TooltipTrigger asChild>
                  <span className="block">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toneLoading ? cancelTestTone : sendTestTone}
                      disabled={status.recording || listenLoading}
                      className="w-full"
                    >
                      {toneLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <AudioWaveform className="mr-2 h-4 w-4" />
                      )}
                      {toneLoading ? "Cancel" : "Test Tone"}
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

        {/* Mixer Card (collapsible) */}
        <Card>
          <button
            type="button"
            className="flex w-full items-center justify-between px-6 text-left cursor-pointer"
            onClick={() => setMixerOpen((o) => !o)}
            aria-expanded={mixerOpen}
          >
            <div>
              <CardTitle className="text-lg" role="heading" aria-level={2}>Mixer</CardTitle>
              <CardDescription>ALSA mixer levels per card</CardDescription>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${mixerOpen ? "rotate-180" : ""}`}
            />
          </button>
          {mixerOpen && (
            <CardContent className="pt-0">
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

        {/* Recordings List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg" role="heading" aria-level={2}>Recordings</CardTitle>
            <CardDescription>
              {recordings === null
                ? "Loading recordings..."
                : `${recordings.length} recording${recordings.length !== 1 ? "s" : ""} available`}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
              <Table>
                <TableCaption className="sr-only">List of recorded audio files</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filename</TableHead>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-20">Duration</TableHead>
                    <TableHead className="w-20">Size</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordings.map((rec) => {
                    const isActive = status.recording && rec.filename === status.recording_file;
                    const isPlaying = playingFile === rec.filename;
                    return (
                    <React.Fragment key={rec.filename}>
                    <TableRow className={`${isActive ? "bg-red-500/10" : ""} ${isPlaying ? "border-b-0 bg-muted/50" : ""}`}>
                      <TableCell className="font-mono text-sm">
                        <span className="flex items-center gap-2">
                          <span>{rec.filename}</span>
                          {isActive && (
                            <Badge variant="secondary" className="bg-red-600 hover:bg-red-600 text-white text-xs animate-pulse">
                              <Circle className="mr-1 h-2 w-2 fill-current" aria-hidden="true" /> REC
                            </Badge>
                          )}
                        </span>
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
                                disabled={isActive}
                                aria-label="Delete"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
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
                                  onClick={() => deleteRecording(rec.filename)}
                                >
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
            )}
          </CardContent>
        </Card>

      </div>
    </main>
  );
}
