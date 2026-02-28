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
  Settings2,
  AudioWaveform,
  Trash2,
  Sun,
  Moon,
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
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { LevelMeter } from "@/components/level-meter";
import { WaveformPlayer } from "@/components/waveform-player";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Status {
  streaming: boolean;
  recording: boolean;
  recording_file: string | null;
}

interface Recording {
  filename: string;
  size: number;
  createdAt: number;
  duration: number | null;
  device: string | null;
  waveformHash: string | null;
}

interface MixerVolume {
  name: string;
  min: number;
  max: number;
  value: number;
  percent: number;
  dB: string;
  enabled: boolean;
}

interface MixerEnum {
  name: string;
  items: string[];
  current: string;
}

interface MixerState {
  capture: MixerVolume | null;
  micBoost: MixerVolume | null;
  inputSource: MixerEnum | null;
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
  selected: string;
}

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
  });
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [mixer, setMixer] = useState<MixerState | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);
  const [mixerLoading, setMixerLoading] = useState(false);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [localCapture, setLocalCapture] = useState<number | null>(null);
  const [localBoost, setLocalBoost] = useState<number | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [listenLoading, setListenLoading] = useState(false);
  const [listenReconnecting, setListenReconnecting] = useState(false);
  const [toneLoading, setToneLoading] = useState(false);
  const [toneConnected, setToneConnected] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
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

  const fetchMixer = useCallback(async () => {
    try {
      const res = await fetch("/api/audio/mixer");
      if (res.ok) setMixer(await res.json());
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
    fetchMixer();
    fetchDevices();
    const statusInterval = setInterval(fetchStatus, 3000);
    const recordingsInterval = setInterval(fetchRecordings, 10000);
    const mixerInterval = setInterval(fetchMixer, 5000);
    return () => {
      clearInterval(statusInterval);
      clearInterval(recordingsInterval);
      clearInterval(mixerInterval);
    };
  }, [fetchStatus, fetchRecordings, fetchMixer, fetchDevices]);

  // Recording elapsed timer — derive start time from the active recording's createdAt
  useEffect(() => {
    if (status.recording && status.recording_file) {
      const activeRec = recordings?.find((r) => r.filename === status.recording_file);
      const startTime = activeRec?.createdAt ?? Date.now();
      setRecordElapsed(Math.floor((Date.now() - startTime) / 1000));
      const interval = setInterval(() => {
        setRecordElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setRecordElapsed(0);
    }
  }, [status.recording, status.recording_file, recordings]);

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

  async function startListening() {
    const controller = new AbortController();
    listenAbortRef.current = controller;
    setListenLoading(true);
    try {
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

      if (!streaming) {
        await fetch("/api/stream/start", { method: "POST", signal: controller.signal });
        listenInitiatedStreamRef.current = true;
        const ready = await waitForStream(5000, controller.signal);
        if (controller.signal.aborted) return;
        if (!ready) {
          toast.error("Stream failed to start");
          setListenLoading(false);
          return;
        }
        await fetchStatus();
      } else {
        listenInitiatedStreamRef.current = false;
      }
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
    const wasListening = liveConnected;
    setRecordLoading(true);
    try {
      const endpoint = status.recording
        ? "/api/record/stop"
        : "/api/record/start";
      await fetch(endpoint, { method: "POST" });
      await new Promise((r) => setTimeout(r, 1000));
      await fetchStatus();
      await fetchRecordings();
      // Service restart kills the Icecast connection — reconnect if we were listening
      if (wasListening) {
        const controller = new AbortController();
        listenAbortRef.current = controller;
        setLiveConnected(false);
        setListenLoading(true);
        setListenReconnecting(true);
        await waitForStream(5000, controller.signal);
        if (!controller.signal.aborted) {
          connectLiveAudio();
        }
      }
    } finally {
      setRecordLoading(false);
    }
  }

  function connectLiveAudio() {
    const audio = audioRef.current;
    if (!audio) return;
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
    updates: Partial<{ capture: number; micBoost: number; inputSource: string }>
  ) {
    setMixerLoading(true);
    try {
      await fetch("/api/audio/mixer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      await fetchMixer();
    } finally {
      setMixerLoading(false);
    }
  }

  async function selectDevice(alsaId: string) {
    if (alsaId === deviceState?.selected) return;
    setDeviceLoading(true);
    try {
      // Stop listening and recording before switching device
      if (liveConnected) {
        disconnectLiveAudio();
      }
      if (status.streaming) {
        await fetch("/api/stream/stop", { method: "POST" });
        listenInitiatedStreamRef.current = false;
      }
      if (status.recording) {
        await fetch("/api/record/stop", { method: "POST" });
      }
      await fetch("/api/audio/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alsaId }),
      });
      await Promise.all([fetchDevices(), fetchStatus(), fetchMixer()]);
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
          <span className="text-sm text-muted-foreground">
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
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {status.recording_file && (
                    <p className="font-mono truncate" role="status">
                      {status.recording_file}
                    </p>
                  )}
                  <span className="font-mono tabular-nums ml-auto" role="timer" aria-live="off">
                    {formatDuration(recordElapsed)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Monitor Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg" role="heading" aria-level={2}>Monitor</CardTitle>
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

              <Tooltip>
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
                {status.recording && (
                  <TooltipContent>
                    <p>Stop recording before sending a test tone</p>
                  </TooltipContent>
                )}
              </Tooltip>

              <audio
                ref={audioRef}
                controls={liveConnected || toneConnected}
                className={`live-audio ${liveConnected || toneConnected ? "w-full h-8" : "hidden"}`}
                aria-label="Live audio stream"
              />
              <div className={liveConnected || toneConnected ? "" : "hidden"}>
                <LevelMeter
                  audioElement={audioRef.current}
                  active={liveConnected || toneConnected}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audio Settings Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg" role="heading" aria-level={2}>Audio Settings</CardTitle>
              <Badge variant="secondary">
                <Settings2 className="mr-1 h-3 w-3" /> Config
              </Badge>
            </div>
            <CardDescription>
              ALSA device selection and mixer levels
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Device Selection */}
            <div className="space-y-2">
              <Label htmlFor="device-select">Capture Device</Label>
              {deviceState === null ? (
                <div className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground" role="status" aria-live="polite">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Loading devices...</span>
                </div>
              ) : deviceState.devices.length > 0 ? (
                <Select
                  value={deviceState.selected}
                  onValueChange={selectDevice}
                  disabled={deviceLoading}
                >
                  <SelectTrigger id="device-select" aria-label="Capture Device">
                    <SelectValue placeholder="Select device..." />
                  </SelectTrigger>
                  <SelectContent>
                    {deviceState.devices.map((d) => (
                      <SelectItem key={d.alsaId} value={d.alsaId}>
                        {d.name} ({d.alsaId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No capture devices found
                </p>
              )}
            </div>

            {/* Capture Volume */}
            {mixer?.capture && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="capture-volume">Capture Volume</Label>
                  <span className="text-sm text-muted-foreground font-mono">
                    {localCapture !== null
                      ? `${Math.round((localCapture / mixer.capture.max) * 100)}%`
                      : `${mixer.capture.percent}% (${mixer.capture.dB})`}
                  </span>
                </div>
                <Slider
                  id="capture-volume"
                  value={[localCapture ?? mixer.capture.value]}
                  min={mixer.capture.min}
                  max={mixer.capture.max}
                  step={1}
                  onValueChange={(v) => setLocalCapture(v[0])}
                  onValueCommit={(v) => {
                    setLocalCapture(null);
                    updateMixer({ capture: v[0] });
                  }}
                  disabled={mixerLoading}
                  aria-label="Capture Volume"
                />
              </div>
            )}

            {/* Input Boost */}
            {mixer?.micBoost && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="input-boost">Input Boost</Label>
                  <span className="text-sm text-muted-foreground font-mono">
                    +{(localBoost ?? mixer.micBoost.value) * 12}dB
                  </span>
                </div>
                <Slider
                  id="input-boost"
                  value={[localBoost ?? mixer.micBoost.value]}
                  min={0}
                  max={3}
                  step={1}
                  onValueChange={(v) => setLocalBoost(v[0])}
                  onValueCommit={(v) => {
                    setLocalBoost(null);
                    updateMixer({ micBoost: v[0] });
                  }}
                  disabled={mixerLoading}
                  aria-label="Input Boost"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0dB</span>
                  <span>+12dB</span>
                  <span>+24dB</span>
                  <span>+36dB</span>
                </div>
              </div>
            )}

            {/* Input Source */}
            {mixer?.inputSource && (
              <div className="space-y-2">
                <Label htmlFor="input-source">Input Source</Label>
                <Select
                  value={mixer.inputSource.current}
                  onValueChange={(v) => updateMixer({ inputSource: v })}
                  disabled={mixerLoading}
                >
                  <SelectTrigger id="input-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mixer.inputSource.items.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
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
                            aria-label={isPlaying ? "Stop playing" : "Play"}
                            title={isPlaying ? "Stop playing" : "Play"}
                          >
                            {isPlaying ? (
                              <Square className="h-4 w-4 text-green-500" aria-hidden="true" />
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
                            onEnded={() => setPlayingFile(null)}
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
