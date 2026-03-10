"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, X, FileAudio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WHISPER_LANGUAGES } from "@/lib/whisper-languages";

interface QueueStatus {
  active: { filename: string; progress: number | null } | null;
  pending: string[];
  names: Record<string, string>;
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

export function TranscriptionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const [language, setLanguage] = useState<string | null>(null);

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

  // Fetch global language setting once on open
  useEffect(() => {
    if (!open) return;
    fetch("/api/transcription").then((res) => res.ok ? res.json() : null).then((data) => {
      if (data?.language) setLanguage(data.language);
    }).catch(() => {});
  }, [open]);

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

  const updateLanguage = async (lang: string) => {
    setLanguage(lang);
    try {
      const res = await fetch("/api/transcription", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang }),
      });
      if (!res.ok) toast.error("Failed to update language");
    } catch {
      toast.error("Failed to update language");
    }
  };

  const hasJobs = queue && (queue.active || queue.pending.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transcription</DialogTitle>
          <DialogDescription>
            Language settings and transcription queue
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {language !== null && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground shrink-0">Language</label>
              <Select value={language} onValueChange={updateLanguage}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WHISPER_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
                        {queue.names[queue.active.filename] || queue.active.filename}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0" aria-hidden="true">
                        {queue.active.progress ?? 0}%
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => cancelTranscription(queue.active!.filename)}
                        aria-label={`Cancel transcription of ${queue.names[queue.active!.filename] || queue.active!.filename}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <ProgressBar value={queue.active.progress} label={`Transcription progress for ${queue.names[queue.active.filename] || queue.active.filename}`} />
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
                          {queue.names[filename] || filename}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => cancelTranscription(filename)}
                          aria-label={`Cancel pending transcription of ${queue.names[filename] || filename}`}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
