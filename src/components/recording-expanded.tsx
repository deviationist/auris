"use client";

import React, { useCallback, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WaveformPlayer } from "@/components/waveform-player";
import { TranscriptionPanel } from "@/components/transcription-panel";
import type { Recording, TranscriptionData } from "@/types/dashboard";

export function RecordingExpanded({
  rec,
  autoPlay = true,
  transcription,
  onLoadTranscription,
  onRetranscribe,
  transcribing,
}: {
  rec: Recording;
  autoPlay?: boolean;
  transcription: TranscriptionData | null;
  onLoadTranscription: () => void;
  onRetranscribe: (options?: { language?: string; translate?: boolean }) => void;
  transcribing: boolean;
}) {
  const playbackTimeRef = useRef(0);
  const seekRef = useRef<((time: number) => void) | null>(null);

  const handleTimeUpdate = useCallback((time: number) => {
    playbackTimeRef.current = time;
  }, []);

  const handleSeek = useCallback((time: number) => {
    seekRef.current?.(time);
  }, []);

  return (
    <>
      <WaveformPlayer
        src={`/api/recordings/${encodeURIComponent(rec.filename)}`}
        waveformUrl={`/api/recordings/${encodeURIComponent(rec.filename)}/waveform${rec.waveformHash ? `?v=${rec.waveformHash}` : ""}`}
        autoPlay={autoPlay}
        onTimeUpdate={handleTimeUpdate}
        seekRef={seekRef}
      />
      {rec.transcriptionStatus === "done" && (
        <TranscriptionPanel
          filename={rec.filename}
          transcription={transcription}
          onLoad={onLoadTranscription}
          onRetranscribe={onRetranscribe}
          transcribing={transcribing}
          timeRef={playbackTimeRef}
          onSeek={handleSeek}
        />
      )}
      {rec.transcriptionStatus === "error" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Transcription failed</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onRetranscribe()}>
            <RotateCcw className="h-3 w-3 mr-1" /> Retry
          </Button>
        </div>
      )}
    </>
  );
}
