"use client";

import React, { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { AlignLeft, Copy, FileText, List, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RetranscribeDialog } from "@/components/retranscribe-dialog";
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
  whisperEnabled = true,
  timeRef,
  onSeek,
}: {
  filename: string;
  transcription: TranscriptionData | null;
  onLoad: () => void;
  onRetranscribe: (options?: { language?: string; translate?: boolean }) => void;
  transcribing: boolean;
  whisperEnabled?: boolean;
  timeRef?: React.MutableRefObject<number>;
  onSeek?: (time: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(-1);
  const rafRef = useRef(0);
  const [view, setView] = useLocalStorage<"prose" | "timeline">("auris:transcription-view", "prose");
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
          {whisperEnabled && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={transcribing}
                    onClick={() => setRetranscribeOpen(true)}
                    aria-label="Re-transcribe"
                  >
                    {transcribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Re-transcribe</TooltipContent>
              </Tooltip>
              <RetranscribeDialog
                open={retranscribeOpen}
                onOpenChange={setRetranscribeOpen}
                onConfirm={onRetranscribe}
                transcribing={transcribing}
              />
            </>
          )}
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
                  className="flex items-baseline gap-2 rounded px-1 py-0.5 transition-colors duration-150 cursor-pointer hover:bg-primary/10"
                  onClick={() => onSeek?.(seg.start)}
                >
                  <span className="font-mono text-[11px] leading-relaxed text-muted-foreground shrink-0 w-12 tabular-nums">
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
