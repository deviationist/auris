"use client";

import React from "react";
import {
  Ban,
  Check,
  Circle,
  Download,
  EllipsisVertical,
  FileText,
  Languages,
  Loader2,
  Pencil,
  Play,
  Speaker,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RecordingExpanded } from "@/components/recording-expanded";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { useDashboard } from "@/contexts/dashboard-context";
import { LanguageSearchList } from "@/components/language-picker";
import type { Recording } from "@/types/dashboard";

export function RecordingRow({
  rec, isActive, isPlaying, isServerPlaying,
}: {
  rec: Recording;
  isActive: boolean;
  isPlaying: boolean;
  isServerPlaying: boolean;
}) {
  const {
    editingName, setEditingName, editingNameValue, setEditingNameValue,
    deletingFile, transcriptions, transcribingFiles, transcriptionProgress,
    playRecording, startServerPlayback, stopServerPlayback,
    saveRecordingName, deleteRecording,
    fetchTranscription, triggerTranscription, cancelTranscriptionFn,
    playingFile,
  } = useDashboard();

  return (
    <React.Fragment>
      <TableRow className={`group/row ${isActive ? "bg-red-500/10" : ""} ${isServerPlaying ? "bg-primary/5" : ""} ${isPlaying ? "border-b-0 bg-muted/50" : ""}`}>
        <TableCell className="text-sm">
          <div className="flex items-center gap-2 min-w-0">
            {editingName === rec.filename ? (
              <form
                className="flex items-center gap-1 flex-1 min-w-0"
                onSubmit={(e) => { e.preventDefault(); saveRecordingName(rec.filename, editingNameValue); }}
              >
                <Input
                  autoFocus
                  value={editingNameValue}
                  onChange={(e) => setEditingNameValue(e.target.value)}
                  onBlur={() => saveRecordingName(rec.filename, editingNameValue)}
                  onKeyDown={(e) => { if (e.key === "Escape") setEditingName(null); }}
                  className="h-7 text-sm flex-1 min-w-0"
                  placeholder={rec.filename}
                  aria-label="Recording name"
                />
                <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Save name">
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </form>
            ) : (
              <>
                <span className="min-w-0">
                  {rec.name ? (
                    <span className="flex flex-col">
                      <span className="truncate">{rec.name}</span>
                      <span className="text-muted-foreground font-mono text-xs truncate">{rec.filename}</span>
                    </span>
                  ) : (
                    <span className="font-mono truncate">{rec.filename}</span>
                  )}
                </span>
                {(rec.transcriptionStatus === "pending" || rec.transcriptionStatus === "processing" || transcribingFiles.has(rec.filename)) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 shrink-0 text-muted-foreground" aria-label="Transcribing">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {transcriptionProgress[rec.filename] != null && (
                          <span className="text-[10px] font-mono tabular-nums">{transcriptionProgress[rec.filename]}%</span>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">Transcribing{transcriptionProgress[rec.filename] != null ? ` (${transcriptionProgress[rec.filename]}%)` : "..."}</TooltipContent>
                  </Tooltip>
                )}
                {rec.transcriptionStatus === "done" && !transcribingFiles.has(rec.filename) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex shrink-0" aria-label="Transcription available">
                        <FileText className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-xs">Transcription available</TooltipContent>
                  </Tooltip>
                )}
                {rec.metadata?.effects && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex shrink-0" aria-label="Voice effects applied">
                        <Sparkles className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-medium mb-1">Effects</p>
                      {Object.entries(rec.metadata.effects as Record<string, Record<string, unknown>>).map(([name, cfg]) => (
                        <p key={name}>
                          {name === "pitchShift" ? `Pitch ${(cfg.semitones as number) > 0 ? "+" : ""}${cfg.semitones} st`
                            : name === "echo" ? `Echo ${cfg.delay}ms`
                            : name === "chorus" ? "Chorus"
                            : name === "flanger" ? "Flanger"
                            : name === "vibrato" ? `Vibrato ${(cfg.frequency as number).toFixed?.(1) ?? cfg.frequency} Hz`
                            : name === "tempo" ? `Tempo ${cfg.factor}x`
                            : name === "autotune" ? `Autotune (${cfg.key})`
                            : name}
                        </p>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition-opacity"
                  onClick={() => { setEditingName(rec.filename); setEditingNameValue(rec.name || ""); }}
                  aria-label="Rename"
                  title="Rename"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                {rec.metadata?.source === "vox" && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    VOX
                  </Badge>
                )}
                {isActive && (
                  <Badge variant="secondary" className="bg-red-600 hover:bg-red-600 text-white text-xs animate-pulse shrink-0">
                    <Circle className="mr-1 h-2 w-2 fill-current" aria-hidden="true" /> REC
                  </Badge>
                )}
              </>
            )}
          </div>
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
              className={`h-9 w-9 ${isServerPlaying ? "text-primary" : ""}`}
              onClick={() => isServerPlaying ? stopServerPlayback() : startServerPlayback(rec.filename)}
              disabled={isActive}
              aria-label={isServerPlaying ? "Stop server playback" : "Play on server"}
              title={isServerPlaying ? "Stop server playback" : "Play on server"}
            >
              {isServerPlaying ? <Square className="h-4 w-4" aria-hidden="true" /> : <Speaker className="h-4 w-4" aria-hidden="true" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => playRecording(rec.filename)}
              disabled={isActive}
              aria-label={isPlaying ? "Close player" : "Play"}
              title={isPlaying ? "Close player" : "Play"}
            >
              {isPlaying ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
            <AlertDialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label="More actions"
                >
                  <EllipsisVertical className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(transcribingFiles.has(rec.filename) || ((rec.transcriptionStatus === "pending" || rec.transcriptionStatus === "processing") && !transcribingFiles.has(rec.filename))) ? (
                  <DropdownMenuItem onClick={() => cancelTranscriptionFn(rec.filename)}>
                    <Ban className="h-4 w-4" aria-hidden="true" />
                    Cancel transcription
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem
                      disabled={isActive}
                      onClick={() => {
                        if (rec.transcriptionStatus === "done") {
                          if (playingFile !== rec.filename) playRecording(rec.filename);
                          if (!transcriptions[rec.filename]) fetchTranscription(rec.filename);
                        } else {
                          triggerTranscription(rec.filename);
                        }
                      }}
                    >
                      <Languages className="h-4 w-4" aria-hidden="true" />
                      {rec.transcriptionStatus === "done" ? "Show transcription" : "Transcribe"}
                    </DropdownMenuItem>
                    {rec.transcriptionStatus !== "done" && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <DropdownMenuItem disabled={isActive} onSelect={(e) => e.preventDefault()}>
                            <Languages className="h-4 w-4" aria-hidden="true" />
                            Transcribe as...
                          </DropdownMenuItem>
                        </PopoverTrigger>
                        <PopoverContent className="w-[220px] p-0" side="left" align="start">
                          <LanguageSearchList onSelect={(code) => triggerTranscription(rec.filename, code)} />
                        </PopoverContent>
                      </Popover>
                    )}
                  </>
                )}
                {isActive ? (
                  <DropdownMenuItem disabled>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem asChild>
                    <a href={`/api/recordings/${encodeURIComponent(rec.filename)}`} download>
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Download
                    </a>
                  </DropdownMenuItem>
                )}
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    disabled={isActive || deletingFile === rec.filename}
                    className="text-destructive focus:text-destructive dark:text-red-400 dark:focus:text-red-400"
                  >
                    {deletingFile === rec.filename ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
              </DropdownMenuContent>
            </DropdownMenu>
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
                    disabled={deletingFile === rec.filename}
                    onClick={() => deleteRecording(rec.filename)}
                  >
                    {deletingFile === rec.filename && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
          <TableCell colSpan={6} className="p-3 space-y-3 whitespace-normal">
            <RecordingExpanded
              rec={rec}
              transcription={transcriptions[rec.filename] ?? null}
              onLoadTranscription={() => { if (!transcriptions[rec.filename]) fetchTranscription(rec.filename); }}
              onRetranscribe={(lang) => triggerTranscription(rec.filename, lang)}
              transcribing={transcribingFiles.has(rec.filename)}
            />
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
}
