"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlignLeft, Copy, FileText, Languages, List, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LanguageSearchList } from "@/components/language-picker";
import type { TranscriptionData } from "@/types/dashboard";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptionPanel({
  filename,
  transcription,
  onLoad,
  onRetranscribe,
  transcribing,
  timeRef,
  onSeek,
}: {
  filename: string;
  transcription: TranscriptionData | null;
  onLoad: () => void;
  onRetranscribe: (language?: string) => void;
  transcribing: boolean;
  timeRef?: React.MutableRefObject<number>;
  onSeek?: (time: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(-1);
  const rafRef = useRef(0);
  const [view, setView] = useState<"prose" | "timeline">("prose");
  const [retranscribeOpen, setRetranscribeOpen] = useState(false);

  useEffect(() => { onLoad(); }, [filename]); // eslint-disable-line react-hooks/exhaustive-deps

  // rAF loop to highlight active segment without React re-renders
  useEffect(() => {
    const segments = transcription?.segments;
    if (!segments || !timeRef) return;

    const loop = () => {
      const time = timeRef.current;
      let newIndex = -1;
      for (let i = 0; i < segments.length; i++) {
        if (time >= segments[i].start && time < segments[i].end) {
          newIndex = i;
          break;
        }
      }
      if (newIndex !== activeIndexRef.current) {
        const container = containerRef.current;
        if (container) {
          const prev = container.querySelector("[data-seg-active]");
          if (prev) {
            prev.removeAttribute("data-seg-active");
            (prev as HTMLElement).classList.remove("bg-primary/20", "text-foreground");
          }
          if (newIndex >= 0) {
            const el = container.querySelector(`[data-seg="${newIndex}"]`);
            if (el) {
              el.setAttribute("data-seg-active", "");
              (el as HTMLElement).classList.add("bg-primary/20", "text-foreground");
              el.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
          }
        }
        activeIndexRef.current = newIndex;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [transcription?.segments, timeRef]);

  if (!transcription) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading transcription...
      </div>
    );
  }

  const hasSegments = transcription.segments && transcription.segments.length > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        <span>Transcription</span>
        {transcription.language && transcription.language !== "auto" && (
          <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] uppercase">{transcription.language}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {hasSegments && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setView(view === "prose" ? "timeline" : "prose")}
                  aria-label={view === "prose" ? "Switch to timeline view" : "Switch to prose view"}
                >
                  {view === "prose" ? <List className="h-3 w-3" /> : <AlignLeft className="h-3 w-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{view === "prose" ? "Timeline view" : "Prose view"}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  const text = view === "timeline" && transcription.segments?.length
                    ? transcription.segments.map((seg) => `${formatTimestamp(seg.start)} ${seg.text}`).join("\n")
                    : transcription.text;
                  navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard"));
                }}
                aria-label="Copy transcription"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy</TooltipContent>
          </Tooltip>
          <Popover open={retranscribeOpen} onOpenChange={setRetranscribeOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={transcribing}
                    aria-label="Re-transcribe"
                  >
                    {transcribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Re-transcribe</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-[220px] p-0" align="end">
              <div className="p-2 border-b">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => { setRetranscribeOpen(false); onRetranscribe(); }}
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
                  Re-transcribe
                </Button>
              </div>
              <div className="px-2 pt-3 pb-1.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-2 mb-1">
                  <Languages className="h-3 w-3" aria-hidden="true" />
                  Re-transcribe as...
                </p>
              </div>
              <LanguageSearchList onSelect={(code) => { setRetranscribeOpen(false); onRetranscribe(code); }} />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div ref={containerRef} className="text-sm leading-relaxed bg-muted/50 rounded p-2 max-h-40 overflow-y-auto overflow-x-hidden">
        {hasSegments ? (
          view === "prose" ? (
            transcription.segments!.map((seg, i) => (
              <span
                key={i}
                data-seg={i}
                className="rounded px-0.5 py-px transition-colors duration-150 cursor-pointer hover:bg-primary/10"
                onClick={() => onSeek?.(seg.start)}
              >
                {seg.text}{" "}
              </span>
            ))
          ) : (
            <div className="space-y-0.5">
              {transcription.segments!.map((seg, i) => (
                <div
                  key={i}
                  data-seg={i}
                  className="flex gap-2 rounded px-1 py-0.5 transition-colors duration-150 cursor-pointer hover:bg-primary/10"
                  onClick={() => onSeek?.(seg.start)}
                >
                  <span className="font-mono text-[11px] text-muted-foreground shrink-0 w-12 pt-px tabular-nums">
                    {formatTimestamp(seg.start)}
                  </span>
                  <span>{seg.text}</span>
                </div>
              ))}
            </div>
          )
        ) : (
          <p className="whitespace-pre-wrap">{transcription.text || <span className="text-muted-foreground italic">No speech detected</span>}</p>
        )}
      </div>
    </div>
  );
}
