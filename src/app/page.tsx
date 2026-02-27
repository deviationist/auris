"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Mic,
  MicOff,
  Circle,
  Square,
  Play,
  Radio,
  Download,
  Loader2,
  Volume2,
  Settings2,
  AudioWaveform,
  Trash2,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [status, setStatus] = useState<Status>({
    streaming: false,
    recording: false,
    recording_file: null,
  });
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [recordLoading, setRecordLoading] = useState(false);
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [mixer, setMixer] = useState<MixerState | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);
  const [mixerLoading, setMixerLoading] = useState(false);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [localCapture, setLocalCapture] = useState<number | null>(null);
  const [localBoost, setLocalBoost] = useState<number | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [toneLoading, setToneLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackRef = useRef<HTMLAudioElement>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) setStatus(await res.json());
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

  async function toggleStream() {
    setStreamLoading(true);
    try {
      const endpoint = status.streaming
        ? "/api/stream/stop"
        : "/api/stream/start";
      await fetch(endpoint, { method: "POST" });
      await new Promise((r) => setTimeout(r, 1000));
      await fetchStatus();
    } finally {
      setStreamLoading(false);
    }
  }

  async function toggleRecord() {
    setRecordLoading(true);
    try {
      const endpoint = status.recording
        ? "/api/record/stop"
        : "/api/record/start";
      await fetch(endpoint, { method: "POST" });
      await new Promise((r) => setTimeout(r, 1000));
      await fetchStatus();
      await fetchRecordings();
    } finally {
      setRecordLoading(false);
    }
  }

  function connectLiveAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    setConnectLoading(true);
    const streamUrl = process.env.NEXT_PUBLIC_STREAM_URL || "/stream/mic";
    audio.src = `${streamUrl}?t=${Date.now()}`;
    audio.load();
    audio.play().catch(() => setConnectLoading(false));
    audio.onplaying = () => {
      setConnectLoading(false);
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
    setConnectLoading(false);
  }

  async function sendTestTone() {
    setToneLoading(true);
    try {
      const res = await fetch("/api/stream/test-tone", { method: "POST" });
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
      }
      setLiveConnected(true);
      // Tone lasts ~3s, give extra buffer then clean up
      setTimeout(() => {
        setToneLoading(false);
        disconnectLiveAudio();
      }, 5000);
    } catch {
      setToneLoading(false);
    }
  }

  async function deleteRecording(filename: string) {
    try {
      const res = await fetch(
        `/api/recordings/${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        if (playingFile === filename) {
          playbackRef.current?.pause();
          setPlayingFile(null);
        }
        await fetchRecordings();
      }
    } catch {
      // ignore
    }
  }

  function playRecording(filename: string) {
    const audio = playbackRef.current;
    if (!audio) return;
    if (playingFile === filename) {
      audio.pause();
      setPlayingFile(null);
      return;
    }
    audio.src = `/api/recordings/${encodeURIComponent(filename)}`;
    audio.load();
    audio.play().catch(() => {});
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
    setDeviceLoading(true);
    try {
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
          <Mic className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Auris</h1>
          <span className="text-sm text-muted-foreground">
            Audio Streamer
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
          {/* Stream Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg" role="heading" aria-level={2}>Live Stream</CardTitle>
                <Badge
                  variant={status.streaming ? "default" : "secondary"}
                  role="status"
                  aria-live="polite"
                  className={
                    status.streaming
                      ? "bg-green-600 hover:bg-green-600 text-white animate-pulse"
                      : ""
                  }
                >
                  {status.streaming ? (
                    <>
                      <Radio className="mr-1 h-3 w-3" aria-hidden="true" /> Live
                    </>
                  ) : (
                    "Offline"
                  )}
                </Badge>
              </div>
              <CardDescription>
                Stream audio from an audio source to Icecast
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={toggleStream}
                disabled={streamLoading}
                variant={status.streaming ? "destructive" : "default"}
                className="w-full"
              >
                {streamLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : status.streaming ? (
                  <MicOff className="mr-2 h-4 w-4" />
                ) : (
                  <Mic className="mr-2 h-4 w-4" />
                )}
                {status.streaming ? "Disable Stream" : "Enable Stream"}
              </Button>

              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex-1">
                      <Button
                        variant={liveConnected ? "destructive" : "outline"}
                        size="sm"
                        onClick={liveConnected ? disconnectLiveAudio : connectLiveAudio}
                        disabled={connectLoading || (!liveConnected && !status.streaming)}
                        className="w-full"
                      >
                        {connectLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Volume2 className="mr-2 h-4 w-4" />
                        )}
                        {connectLoading ? "Connecting..." : liveConnected ? "Stop Listening" : "Listen"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!status.streaming && !liveConnected && (
                    <TooltipContent>
                      <p>Start the stream first to listen</p>
                    </TooltipContent>
                  )}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={sendTestTone}
                        disabled={status.streaming || toneLoading}
                        className="w-full"
                      >
                        {toneLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <AudioWaveform className="mr-2 h-4 w-4" />
                        )}
                        {toneLoading ? "Playing..." : "Test Tone"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {status.streaming && (
                    <TooltipContent>
                      <p>Stop the stream first to send a test tone</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>
              <audio
                ref={audioRef}
                controls={liveConnected}
                className={liveConnected ? "w-full h-8" : "hidden"}
                aria-label="Live audio stream"
              />
              {liveConnected && (
                <LevelMeter
                  audioElement={audioRef.current}
                  active={status.streaming || toneLoading}
                />
              )}
            </CardContent>
          </Card>

          {/* Recording Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg" role="heading" aria-level={2}>Recording</CardTitle>
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
              </div>
              <CardDescription>
                Record audio source to disk
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={toggleRecord}
                disabled={recordLoading}
                variant={status.recording ? "destructive" : "default"}
                className="w-full"
              >
                {recordLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : status.recording ? (
                  <Square className="mr-2 h-4 w-4" />
                ) : (
                  <Circle className="mr-2 h-4 w-4 fill-red-500 text-red-500" />
                )}
                {status.recording ? "Stop Recording" : "Start Recording"}
              </Button>
              {status.recording && status.recording_file && (
                <p className="text-xs text-muted-foreground font-mono truncate" role="status">
                  Recording to: {status.recording_file}
                </p>
              )}
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
                  <SelectTrigger id="device-select">
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

            {/* Mic Boost */}
            {mixer?.micBoost && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mic-boost">Mic Boost</Label>
                  <span className="text-sm text-muted-foreground font-mono">
                    +{(localBoost ?? mixer.micBoost.value) * 12}dB
                  </span>
                </div>
                <Slider
                  id="mic-boost"
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
                  aria-label="Mic Boost"
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
                    return (
                    <TableRow key={rec.filename} className={isActive ? "bg-red-500/10" : ""}>
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
                            aria-label={playingFile === rec.filename ? "Stop playing" : "Play"}
                          >
                            <Play
                              className={`h-4 w-4 ${
                                playingFile === rec.filename
                                  ? "text-green-500"
                                  : ""
                              }`}
                              aria-hidden="true"
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            disabled={isActive}
                            aria-label="Download"
                            asChild
                          >
                            <a
                              href={`/api/recordings/${encodeURIComponent(
                                rec.filename
                              )}`}
                              download
                              tabIndex={isActive ? -1 : undefined}
                            >
                              <Download className="h-4 w-4" aria-hidden="true" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => deleteRecording(rec.filename)}
                            disabled={isActive}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Hidden playback audio element */}
        <audio
          ref={playbackRef}
          onEnded={() => setPlayingFile(null)}
          className="hidden"
          aria-label="Recording playback"
          tabIndex={-1}
        />
      </div>
    </main>
  );
}
