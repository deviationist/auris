"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AudioWaveform,
  Circle,
  CircleHelp,
  Cog,
  Loader2,
  Mic,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { LiveWaveform } from "@/components/live-waveform";
import { BITRATE_OPTIONS, CHUNK_OPTIONS, formatDuration } from "@/lib/format";
import { useDashboard } from "@/contexts/dashboard-context";

export function CardRecording() {
  const {
    status, statusLoaded, deviceState, deviceLoading,
    recordLoading, toneLoading, recordElapsed,
    audioContextReady, audioContextRef,
    stopRecordDialogOpen, setStopRecordDialogOpen,
    toggleRecord, ensureAudioContext,
    selectRecordDevice, setRecordBitrate, setChunkMinutes,
    voxLoading, voxConfig, voxConfigOpen, setVoxConfigOpen,
    voxConfigLoaded, setVoxConfigLoaded, setVoxConfig,
    toggleVox, saveVoxConfig,
  } = useDashboard();

  // Client-side interpolation for VOX countdown and duration between polls
  const voxSilenceRef = useRef({ serverValue: 0, receivedAt: 0 });
  const voxDurationRef = useRef({ serverValue: 0, receivedAt: 0 });
  const [interpolatedSilence, setInterpolatedSilence] = useState(0);
  const [interpolatedDuration, setInterpolatedDuration] = useState(0);

  // Capture server values when they change
  useEffect(() => {
    const now = Date.now();
    if (status.vox.state === "tail_silence") {
      voxSilenceRef.current = { serverValue: status.vox.silenceRemaining, receivedAt: now };
    }
    if (status.vox.state === "recording" || status.vox.state === "tail_silence") {
      voxDurationRef.current = { serverValue: status.vox.recordingDuration, receivedAt: now };
    }
  }, [status.vox.silenceRemaining, status.vox.recordingDuration, status.vox.state]);

  // Tick interpolation at ~10fps when VOX is recording/counting
  useEffect(() => {
    if (!status.vox.active || (status.vox.state !== "recording" && status.vox.state !== "tail_silence")) {
      setInterpolatedSilence(status.vox.silenceRemaining);
      setInterpolatedDuration(status.vox.recordingDuration);
      return;
    }
    const tick = () => {
      const now = Date.now();
      const silRef = voxSilenceRef.current;
      const durRef = voxDurationRef.current;
      const elapsed = (now - silRef.receivedAt) / 1000;
      setInterpolatedSilence(Math.max(0, silRef.serverValue - elapsed));
      const durElapsed = (now - durRef.receivedAt) / 1000;
      setInterpolatedDuration(durRef.serverValue + durElapsed);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [status.vox.active, status.vox.state, status.vox.silenceRemaining, status.vox.recordingDuration]);

  return (
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
                className={status.recording ? "bg-red-600 hover:bg-red-600 animate-pulse" : ""}
              >
                {status.recording ? (<><Circle className="mr-1 h-3 w-3 fill-current" aria-hidden="true" /> REC</>) : "Stopped"}
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
                    <Select value={deviceState.selectedRecord} onValueChange={selectRecordDevice} disabled={deviceLoading || status.recording}>
                      <SelectTrigger className="text-xs h-8" aria-label="Recording device">
                        <SelectValue placeholder="Select device...">{deviceState.devices.find((d) => d.alsaId === deviceState.selectedRecord)?.cardName ?? deviceState.selectedRecord}</SelectValue>
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
                    <Select value={deviceState.recordBitrate} onValueChange={setRecordBitrate} disabled={deviceLoading || status.recording}>
                      <SelectTrigger className="text-xs h-8" aria-label="Recording bitrate"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BITRATE_OPTIONS.map((b) => (<SelectItem key={b} value={b}>{b}bps{b === "128k" ? " (default)" : ""}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1 pt-2">
                      <p className="text-sm font-medium">Auto-split</p>
                      <Tooltip>
                        <TooltipTrigger aria-label="What is auto-split?" className="inline-flex p-0.5" onPointerDown={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()}>
                          <CircleHelp className="h-3.5 w-3.5 text-muted-foreground/60" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-52" onPointerDownOutside={(e) => e.preventDefault()}>
                          Split into consecutive files at this interval
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select value={String(status.record_chunk_minutes)} onValueChange={setChunkMinutes} disabled={deviceLoading || status.recording}>
                      <SelectTrigger className="text-xs h-8" aria-label="Max recording duration"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CHUNK_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /><span>Loading devices...</span>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <CardDescription className="flex items-center justify-between gap-2">
          <span>Record audio source to disk</span>
          {deviceState === null ? (
            <span className="flex items-center gap-1 text-xs text-foreground/60"><Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" /></span>
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
              <Button disabled={!statusLoaded || recordLoading || toneLoading} variant="destructive" className="w-full">
                {recordLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
                Stop Recording
                <kbd className="pointer-events-none ml-auto text-[10px] opacity-50 border rounded hidden [@media(pointer:fine)]:inline-flex items-center justify-center w-5 h-5 leading-[0] pt-px">R</kbd>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Stop recording?</AlertDialogTitle>
                <AlertDialogDescription>This will stop the current recording and finalize the file.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={toggleRecord}>Stop Recording</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button onClick={toggleRecord} disabled={!statusLoaded || recordLoading || toneLoading || status.vox.active} className="w-full gap-1">
            {recordLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Circle className="mr-2 h-4 w-4 fill-red-500 text-red-500" />}
            Start Recording
            <kbd className="pointer-events-none ml-auto text-[10px] opacity-50 border rounded hidden [@media(pointer:fine)]:inline-flex items-center justify-center w-5 h-5 leading-[0] pt-px">R</kbd>
          </Button>
        )}
        {status.recording && (
          <>
            <div className="relative">
              <LiveWaveform active={status.recording} audioContext={audioContextReady ? audioContextRef.current : null} streamUrl="/stream/mic" />
              {!audioContextReady && (
                <div
                  className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground cursor-pointer bg-background/80 hover:bg-background/60 transition-colors"
                  role="button" tabIndex={0} aria-label="Connect live waveform"
                  onClick={ensureAudioContext}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") ensureAudioContext(); }}
                >
                  <AudioWaveform className="h-4 w-4" aria-hidden="true" /><span>Tap to connect waveform</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {status.recording_file ? (
                <p className="font-mono truncate" role="status">{status.recording_file}</p>
              ) : (
                <p className="flex items-center gap-1.5" role="status"><Loader2 className="h-3 w-3 animate-spin" /><span>Loading filename...</span></p>
              )}
              <span className="font-mono tabular-nums ml-auto" role="timer" aria-live="off">{formatDuration(recordElapsed)}</span>
            </div>
          </>
        )}

        {/* VOX */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="vox-toggle" className="text-sm font-medium cursor-pointer">VOX</Label>
                <Tooltip>
                  <TooltipTrigger aria-label="What is VOX?" className="inline-flex p-0.5" onPointerDown={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()}>
                    <CircleHelp className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-52" onPointerDownOutside={(e) => e.preventDefault()}>
                    Voice-operated switch — automatically starts and stops recording when sound is detected
                  </TooltipContent>
                </Tooltip>
              </div>
              {status.vox.active && (
                <Badge
                  variant={status.vox.state === "recording" || status.vox.state === "tail_silence" ? "default" : "secondary"}
                  className={`text-[10px] ${status.vox.state === "recording" ? "bg-red-600 hover:bg-red-600 text-white animate-pulse" : status.vox.state === "tail_silence" ? "bg-amber-600 hover:bg-amber-600 text-white" : ""}`}
                >
                  {status.vox.state === "monitoring" ? "Monitoring" : status.vox.state === "recording" ? "Recording" : status.vox.state === "tail_silence" ? `Silence ${formatDuration(interpolatedSilence)}` : status.vox.state === "finalizing" ? "Saving..." : ""}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Popover open={voxConfigOpen} onOpenChange={async (open) => {
                setVoxConfigOpen(open);
                if (open) {
                  setVoxConfigLoaded(false);
                  try { const res = await fetch("/api/vox/config"); if (res.ok) setVoxConfig(await res.json()); } catch {}
                  setVoxConfigLoaded(true);
                }
              }}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="VOX settings"><Cog className="h-3.5 w-3.5" /></Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 space-y-3" align="end">
                  <p className="text-sm font-medium">VOX Settings</p>
                  {!voxConfigLoaded ? (
                    <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs"><span>Threshold</span><span className="font-mono text-muted-foreground">{voxConfig.threshold} dB</span></div>
                        <p className="text-[10px] text-muted-foreground -mt-1">Minimum sound level to start recording</p>
                        <Slider value={[voxConfig.threshold]} min={-60} max={-10} step={1} onValueChange={([v]) => saveVoxConfig({ threshold: v })} />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1">
                            <span>Trigger duration</span>
                            <Tooltip>
                              <TooltipTrigger aria-label="What is trigger duration?" className="inline-flex p-0.5" onPointerDown={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()}>
                                <CircleHelp className="h-3 w-3 text-muted-foreground/60" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-52" onPointerDownOutside={(e) => e.preventDefault()}>
                                Sound must stay above threshold for this long to avoid false triggers from brief noises
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <span className="font-mono text-muted-foreground">{voxConfig.triggerMs} ms</span>
                        </div>
                        <Slider value={[voxConfig.triggerMs]} min={100} max={5000} step={100} onValueChange={([v]) => saveVoxConfig({ triggerMs: v })} />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs"><span>Pre-buffer</span><span className="font-mono text-muted-foreground">{voxConfig.preBufferSecs}s</span></div>
                        <p className="text-[10px] text-muted-foreground -mt-1">Audio kept from before the trigger</p>
                        <Slider value={[voxConfig.preBufferSecs]} min={1} max={30} step={1} onValueChange={([v]) => saveVoxConfig({ preBufferSecs: v })} />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs"><span>Post-silence</span><span className="font-mono text-muted-foreground">{voxConfig.postSilenceSecs}s</span></div>
                        <p className="text-[10px] text-muted-foreground -mt-1">Silence duration before saving</p>
                        <Slider value={[voxConfig.postSilenceSecs]} min={3} max={60} step={1} onValueChange={([v]) => saveVoxConfig({ postSilenceSecs: v })} />
                      </div>
                    </>
                  )}
                </PopoverContent>
              </Popover>
              <Switch id="vox-toggle" checked={status.vox.active} disabled={voxLoading || status.recording} onCheckedChange={toggleVox} />
            </div>
          </div>
          {status.vox.active && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-150 rounded-full ${status.vox.state === "recording" || status.vox.state === "tail_silence" ? "bg-red-500" : "bg-green-500"}`}
                    style={{ width: `${Math.max(0, Math.min(100, ((status.vox.currentLevel + 60) / 50) * 100))}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-12 text-right tabular-nums">
                  {status.vox.currentLevel > -90 ? `${status.vox.currentLevel} dB` : "-∞ dB"}
                </span>
              </div>
              <div className="relative h-0.5">
                <div className="absolute top-0 w-px h-2 bg-foreground/40 -translate-y-3" style={{ left: `${Math.max(0, Math.min(100, ((voxConfig.threshold + 60) / 50) * 100))}%` }} title={`Threshold: ${voxConfig.threshold} dB`} />
              </div>
              {(status.vox.state === "recording" || status.vox.state === "tail_silence") && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {status.vox.recordingFilename && <span className="font-mono truncate">{status.vox.recordingFilename}</span>}
                  <span className="font-mono tabular-nums ml-auto">{formatDuration(interpolatedDuration)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
