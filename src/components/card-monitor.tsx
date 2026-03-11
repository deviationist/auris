"use client";

import React from "react";
import {
  CircleHelp,
  Cog,
  Loader2,
  Mic,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { LevelMeter } from "@/components/level-meter";
import { useDashboard } from "@/contexts/dashboard-context";

export function CardMonitor() {
  const {
    deviceState, deviceLoading,
    liveConnected, listenLoading, listenReconnecting,
    startListening, cancelListening, stopListening,
    selectListenDevice,
    compressorConfig, compressorConfigOpen, setCompressorConfigOpen,
    compressorConfigLoaded, setCompressorConfigLoaded, setCompressorConfig,
    saveCompressorConfig,
    monitorAnalyserRef,
  } = useDashboard();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg" role="heading" aria-level={2}>Monitor</CardTitle>
          <div className="flex items-center gap-1.5">
            {liveConnected ? (
              <Badge variant="default" role="status" aria-live="polite" className="bg-green-600 hover:bg-green-600 text-white animate-pulse">
                <Volume2 className="mr-1 h-3 w-3" aria-hidden="true" /> Listening
              </Badge>
            ) : listenLoading ? (
              <Badge variant="secondary" role="status" aria-live="polite">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" /> {listenReconnecting ? "Reconnecting" : "Connecting"}
              </Badge>
            ) : null}
            <Popover open={compressorConfigOpen} onOpenChange={async (open) => {
              setCompressorConfigOpen(open);
              if (open) {
                setCompressorConfigLoaded(false);
                try { const res = await fetch("/api/audio/compressor"); if (res.ok) setCompressorConfig(await res.json()); } catch {}
                setCompressorConfigLoaded(true);
              }
            }}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Monitor settings"><Cog className="h-3.5 w-3.5" /></Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                {deviceState && deviceState.devices.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Listening Device</p>
                    <Select value={deviceState.selectedListen} onValueChange={selectListenDevice} disabled={deviceLoading || liveConnected}>
                      <SelectTrigger className="text-xs h-8" aria-label="Listening device">
                        <SelectValue placeholder="Select device...">{deviceState.devices.find((d) => d.alsaId === deviceState.selectedListen)?.cardName ?? deviceState.selectedListen}</SelectValue>
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
                    <div className="border-t pt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Label htmlFor="compressor-toggle" className="text-sm font-medium cursor-pointer">Compressor</Label>
                          <Tooltip>
                            <TooltipTrigger aria-label="What is a compressor?" className="inline-flex p-0.5" onPointerDown={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()}>
                              <CircleHelp className="h-3.5 w-3.5 text-muted-foreground/60" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-52" onPointerDownOutside={(e) => e.preventDefault()}>
                              Dynamic range compression — boosts quiet sounds and tames loud ones for recordings
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Switch id="compressor-toggle" checked={compressorConfig.enabled} onCheckedChange={(v) => saveCompressorConfig({ enabled: v })} />
                      </div>
                      {compressorConfig.enabled && (
                        <div className="space-y-2">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs"><span>Threshold</span><span className="font-mono text-muted-foreground">{compressorConfig.threshold} dB</span></div>
                            <Slider value={[compressorConfig.threshold]} min={-50} max={0} step={1} onValueChange={([v]) => saveCompressorConfig({ threshold: v })} />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs"><span>Ratio</span><span className="font-mono text-muted-foreground">{compressorConfig.ratio}:1</span></div>
                            <Slider value={[compressorConfig.ratio]} min={1} max={20} step={0.5} onValueChange={([v]) => saveCompressorConfig({ ratio: v })} />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs"><span>Makeup</span><span className="font-mono text-muted-foreground">+{compressorConfig.makeup} dB</span></div>
                            <Slider value={[compressorConfig.makeup]} min={0} max={30} step={1} onValueChange={([v]) => saveCompressorConfig({ makeup: v })} />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs"><span>Attack</span><span className="font-mono text-muted-foreground">{compressorConfig.attack} ms</span></div>
                            <Slider value={[compressorConfig.attack]} min={1} max={200} step={1} onValueChange={([v]) => saveCompressorConfig({ attack: v })} />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs"><span>Release</span><span className="font-mono text-muted-foreground">{compressorConfig.release} ms</span></div>
                            <Slider value={[compressorConfig.release]} min={50} max={2000} step={50} onValueChange={([v]) => saveCompressorConfig({ release: v })} />
                          </div>
                        </div>
                      )}
                    </div>
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
          <span>Listen to live audio input</span>
          {deviceState === null ? (
            <span className="flex items-center gap-1 text-xs text-foreground/60"><Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" /></span>
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
          variant={liveConnected ? "destructive" : "outline"}
          className="w-full gap-1"
        >
          {listenLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Volume2 className="mr-2 h-4 w-4" />}
          {listenLoading ? "Cancel" : liveConnected ? "Stop Listening" : "Listen"}
          <kbd className="pointer-events-none ml-auto text-[10px] opacity-50 border rounded hidden [@media(pointer:fine)]:inline-flex items-center justify-center w-5 h-5 leading-[0] pt-px">L</kbd>
        </Button>

        <div className={liveConnected ? "" : "hidden"}>
          <LevelMeter analyserNode={monitorAnalyserRef.current} active={liveConnected} />
        </div>
      </CardContent>
    </Card>
  );
}
