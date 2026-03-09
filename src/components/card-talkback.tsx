"use client";

import React from "react";
import {
  Circle,
  Cog,
  Loader2,
  Radio,
  Square,
  Volume2,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { LiveWaveform } from "@/components/live-waveform";
import { LevelMeter } from "@/components/level-meter";
import { formatDuration } from "@/lib/format";
import { AUTOTUNE_KEYS } from "@/lib/talkback-effects";
import { useDashboard } from "@/contexts/dashboard-context";

export function CardTalkback() {
  const {
    talkbackActive, talkbackRejected,
    talkbackEffects, setTalkbackEffects,
    talkbackAnalyserRef, playbackState,
    selectPlaybackDevice, startTalkback, stopTalkback,
    clientRecording, clientRecordElapsed, clientRecordUploading,
    clientRecordAnalyserRef, startClientRecording, stopClientRecording,
  } = useDashboard();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg" role="heading" aria-level={2}>Talkback</CardTitle>
          <div className="flex items-center gap-1.5">
            {talkbackActive && (
              <Badge variant="default" role="status" aria-live="polite" className="bg-orange-600 hover:bg-orange-600 text-white animate-pulse">
                <Radio className="mr-1 h-3 w-3" aria-hidden="true" /> On Air
              </Badge>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Talkback settings"><Cog className="h-3.5 w-3.5" /></Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 max-h-[80vh] overflow-y-auto" align="end">
                {playbackState && playbackState.devices.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Playback Device</p>
                    <Select value={playbackState.selected} onValueChange={selectPlaybackDevice} disabled={talkbackActive}>
                      <SelectTrigger className="text-xs h-8" aria-label="Playback device">
                        <SelectValue placeholder="Select device...">{playbackState.devices.find((d) => d.alsaId === playbackState.selected)?.cardName ?? playbackState.selected}</SelectValue>
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
                    <Loader2 className="h-4 w-4 animate-spin" /><span>Loading devices...</span>
                  </div>
                )}

                <div className="border-t mt-3 pt-3 space-y-3">
                  <p className="text-sm font-medium">Voice Effects</p>

                  {/* Pitch Shift */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Pitch Shift</Label>
                      <Switch checked={talkbackEffects.pitchShift.enabled} onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, pitchShift: { ...talkbackEffects.pitchShift, enabled: v } })} />
                    </div>
                    {talkbackEffects.pitchShift.enabled && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Semitones</span><span>{talkbackEffects.pitchShift.semitones > 0 ? "+" : ""}{talkbackEffects.pitchShift.semitones}</span></div>
                        <Slider min={-12} max={12} step={1} value={[talkbackEffects.pitchShift.semitones]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, pitchShift: { ...talkbackEffects.pitchShift, semitones: v } })} />
                      </div>
                    )}
                  </div>

                  {/* Echo */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Echo</Label>
                      <Switch checked={talkbackEffects.echo.enabled} onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, echo: { ...talkbackEffects.echo, enabled: v } })} />
                    </div>
                    {talkbackEffects.echo.enabled && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Delay</span><span>{Math.round(talkbackEffects.echo.delay)}ms</span></div>
                        <Slider min={50} max={500} step={10} value={[talkbackEffects.echo.delay]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, echo: { ...talkbackEffects.echo, delay: v } })} />
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Decay</span><span>{talkbackEffects.echo.decay.toFixed(2)}</span></div>
                        <Slider min={0} max={1} step={0.05} value={[talkbackEffects.echo.decay]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, echo: { ...talkbackEffects.echo, decay: v } })} />
                      </div>
                    )}
                  </div>

                  {/* Chorus */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Chorus</Label>
                      <Switch checked={talkbackEffects.chorus.enabled} onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, chorus: { ...talkbackEffects.chorus, enabled: v } })} />
                    </div>
                    {talkbackEffects.chorus.enabled && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Depth</span><span>{talkbackEffects.chorus.depth.toFixed(2)}</span></div>
                        <Slider min={0.1} max={1} step={0.05} value={[talkbackEffects.chorus.depth]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, chorus: { ...talkbackEffects.chorus, depth: v } })} />
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Speed</span><span>{talkbackEffects.chorus.speed.toFixed(1)} Hz</span></div>
                        <Slider min={0.5} max={5} step={0.1} value={[talkbackEffects.chorus.speed]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, chorus: { ...talkbackEffects.chorus, speed: v } })} />
                      </div>
                    )}
                  </div>

                  {/* Flanger */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Flanger</Label>
                      <Switch checked={talkbackEffects.flanger.enabled} onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, flanger: { ...talkbackEffects.flanger, enabled: v } })} />
                    </div>
                    {talkbackEffects.flanger.enabled && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Delay</span><span>{talkbackEffects.flanger.delay}ms</span></div>
                        <Slider min={1} max={20} step={1} value={[talkbackEffects.flanger.delay]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, flanger: { ...talkbackEffects.flanger, delay: v } })} />
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Depth</span><span>{talkbackEffects.flanger.depth}</span></div>
                        <Slider min={1} max={10} step={1} value={[talkbackEffects.flanger.depth]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, flanger: { ...talkbackEffects.flanger, depth: v } })} />
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Speed</span><span>{talkbackEffects.flanger.speed.toFixed(1)} Hz</span></div>
                        <Slider min={0.1} max={5} step={0.1} value={[talkbackEffects.flanger.speed]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, flanger: { ...talkbackEffects.flanger, speed: v } })} />
                      </div>
                    )}
                  </div>

                  {/* Vibrato */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Vibrato</Label>
                      <Switch checked={talkbackEffects.vibrato.enabled} onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, vibrato: { ...talkbackEffects.vibrato, enabled: v } })} />
                    </div>
                    {talkbackEffects.vibrato.enabled && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Frequency</span><span>{talkbackEffects.vibrato.frequency.toFixed(1)} Hz</span></div>
                        <Slider min={1} max={20} step={0.5} value={[talkbackEffects.vibrato.frequency]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, vibrato: { ...talkbackEffects.vibrato, frequency: v } })} />
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Depth</span><span>{talkbackEffects.vibrato.depth.toFixed(2)}</span></div>
                        <Slider min={0.05} max={1} step={0.05} value={[talkbackEffects.vibrato.depth]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, vibrato: { ...talkbackEffects.vibrato, depth: v } })} />
                      </div>
                    )}
                  </div>

                  {/* Tempo */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Tempo</Label>
                      <Switch checked={talkbackEffects.tempo.enabled} onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, tempo: { ...talkbackEffects.tempo, enabled: v } })} />
                    </div>
                    {talkbackEffects.tempo.enabled && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Factor</span><span>{talkbackEffects.tempo.factor.toFixed(2)}x</span></div>
                        <Slider min={0.5} max={2} step={0.05} value={[talkbackEffects.tempo.factor]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, tempo: { ...talkbackEffects.tempo, factor: v } })} />
                      </div>
                    )}
                  </div>

                  {/* Autotune */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Autotune</Label>
                      <Switch checked={talkbackEffects.autotune.enabled} onCheckedChange={(v) => setTalkbackEffects({ ...talkbackEffects, autotune: { ...talkbackEffects.autotune, enabled: v } })} />
                    </div>
                    {talkbackEffects.autotune.enabled && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Key</span></div>
                        <Select value={talkbackEffects.autotune.key} onValueChange={(v) => setTalkbackEffects({ ...talkbackEffects, autotune: { ...talkbackEffects.autotune, key: v } })}>
                          <SelectTrigger className="text-xs h-7"><SelectValue /></SelectTrigger>
                          <SelectContent>{AUTOTUNE_KEYS.map((k) => (<SelectItem key={k} value={k}>{k}</SelectItem>))}</SelectContent>
                        </Select>
                        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Strength</span><span>{talkbackEffects.autotune.strength.toFixed(2)}</span></div>
                        <Slider min={0} max={1} step={0.05} value={[talkbackEffects.autotune.strength]} onValueChange={([v]) => setTalkbackEffects({ ...talkbackEffects, autotune: { ...talkbackEffects.autotune, strength: v } })} />
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
            <span className="flex items-center gap-1 text-xs text-foreground/60"><Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" /></span>
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
            <Button variant="outline" className="flex-1 text-xs" onClick={async () => { stopTalkback(); await fetch("/api/talkback/stop", { method: "POST" }); }}>
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
        {talkbackRejected && <p className="text-xs text-destructive">Talkback is in use by another client.</p>}
        <div>
          <Button
            id="client-record-btn"
            onClick={() => clientRecording ? stopClientRecording() : startClientRecording()}
            disabled={clientRecordUploading}
            variant={clientRecording ? "destructive" : "outline"}
            className="w-full gap-1"
          >
            {clientRecordUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : clientRecording ? <Square className="mr-2 h-4 w-4" /> : <Circle className="mr-2 h-4 w-4 fill-current" />}
            {clientRecordUploading ? "Uploading..." : clientRecording ? `Stop (${formatDuration(clientRecordElapsed)})` : "Record"}
            <kbd className="pointer-events-none ml-auto text-[10px] opacity-50 border rounded hidden [@media(pointer:fine)]:inline-flex items-center justify-center w-5 h-5 leading-[0] pt-px">C</kbd>
          </Button>
          <Label htmlFor="client-record-btn" className="text-xs text-muted-foreground mt-2">Record from browser mic</Label>
          {clientRecording && (
            <>
              <LiveWaveform analyserNode={clientRecordAnalyserRef.current} active={clientRecording} />
              <LevelMeter analyserNode={clientRecordAnalyserRef.current} active={clientRecording} />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
