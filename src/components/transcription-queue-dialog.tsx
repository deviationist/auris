"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, X, FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface QueueStatus {
  active: { filename: string; progress: number | null } | null;
  pending: string[];
}

function formatFilename(filename: string): string {
  return filename.replace(/\.\w+$/, "").replace(/[_-]/g, " ");
}

function ProgressBar({ value, label }: { value: number | null; label: string }) {
  const pct = value ?? 0;
  return (
    <div
      className="h-2 w-full rounded-full bg-muted overflow-hidden"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function TranscriptionQueueDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [queue, setQueue] = useState<QueueStatus | null>(null);

  const fetchingRef = useRef(false);
  const fetchQueue = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch("/api/transcription/queue");
      if (res.ok) setQueue(await res.json());
    } catch {} finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchQueue();
    const interval = setInterval(fetchQueue, 1000);
    return () => clearInterval(interval);
  }, [open, fetchQueue]);

  const cancelTranscription = async (filename: string) => {
    try {
      await fetch(`/api/recordings/${encodeURIComponent(filename)}/transcription?cancel=1`, { method: "DELETE" });
      fetchQueue();
    } catch {}
  };

  const hasJobs = queue && (queue.active || queue.pending.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transcription Queue</DialogTitle>
          <DialogDescription>
            Active and pending transcription jobs
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-80 overflow-y-auto" role="status" aria-live="polite">
          {!queue ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center" role="status" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading...
            </div>
          ) : !hasJobs ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No active transcriptions
            </p>
          ) : (
            <>
              {queue.active && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" aria-hidden="true" />
                    <span className="text-sm font-medium truncate flex-1">
                      {formatFilename(queue.active.filename)}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0" aria-hidden="true">
                      {queue.active.progress ?? 0}%
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => cancelTranscription(queue.active!.filename)}
                      aria-label={`Cancel transcription of ${formatFilename(queue.active!.filename)}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <ProgressBar value={queue.active.progress} label={`Transcription progress for ${formatFilename(queue.active.filename)}`} />
                </div>
              )}
              {queue.pending.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                    Pending ({queue.pending.length})
                  </h3>
                  {queue.pending.map((filename) => (
                    <div
                      key={filename}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2"
                    >
                      <FileAudio className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                      <span className="text-sm truncate flex-1">
                        {formatFilename(filename)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => cancelTranscription(filename)}
                        aria-label={`Cancel pending transcription of ${formatFilename(filename)}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
