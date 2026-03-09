"use client";

import React from "react";
import {
  ChevronDown,
  Cog,
  Loader2,
  Search,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RecordingRow } from "@/components/recording-row";
import { useDashboard } from "@/contexts/dashboard-context";

export function CardRecordingsTable() {
  const {
    mounted, status, recordings, filteredRecordings, visibleRecordings,
    recordingDevices, playingFile, serverPlayingFile,
    playbackState, recordingsOpen, setRecordingsOpen,
    recordingsSearch, setRecordingsSearch,
    recordingsDateFilter, setRecordingsDateFilter,
    recordingsDeviceFilter, setRecordingsDeviceFilter,
    sentinelRef, selectPlaybackDevice,
  } = useDashboard();

  return (
    <Card>
      <div className="flex w-full items-start justify-between gap-2 px-6">
        <button
          type="button"
          className="flex flex-1 items-center justify-between text-left min-w-0"
          onClick={() => setRecordingsOpen((o) => !o)}
          aria-expanded={mounted && recordingsOpen}
          aria-controls="recordings-panel"
        >
          <div className="min-w-0 space-y-2">
            <CardTitle className="text-lg" role="heading" aria-level={2}>Recordings</CardTitle>
            <CardDescription>
              {recordings === null
                ? "Loading recordings..."
                : `${recordings.length} recording${recordings.length !== 1 ? "s" : ""} available`}
            </CardDescription>
          </div>
        </button>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Server playback settings">
                  <Cog className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                {playbackState && playbackState.devices.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Playback Device</p>
                    <Select
                      value={playbackState.selected}
                      onValueChange={selectPlaybackDevice}
                      disabled={status?.server_playback !== null}
                    >
                      <SelectTrigger className="text-xs h-8" aria-label="Playback device">
                        <SelectValue placeholder="Select device...">
                          {playbackState.devices.find((d) => d.alsaId === playbackState.selected)?.cardName ?? playbackState.selected}
                        </SelectValue>
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
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading devices...</span>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <button
              type="button"
              className="flex items-center justify-center h-7 w-7"
              onClick={() => setRecordingsOpen((o) => !o)}
              aria-expanded={mounted && recordingsOpen}
              aria-controls="recordings-panel"
              aria-label={mounted && recordingsOpen ? "Collapse recordings" : "Expand recordings"}
            >
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground ${mounted ? "transition-transform duration-200 opacity-100" : "opacity-0"} ${mounted && recordingsOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          {playbackState === null ? (
            <span className="flex items-center gap-1 text-xs text-foreground/60 pr-1">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" />
            </span>
          ) : playbackState.devices.find((d) => d.alsaId === playbackState.selected)?.cardName ? (
            <span className="flex items-center gap-1 text-xs font-medium text-foreground/60 pr-1">
              <Volume2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              {playbackState.devices.find((d) => d.alsaId === playbackState.selected)!.cardName}
            </span>
          ) : null}
        </div>
      </div>
      {mounted && recordingsOpen && (
      <CardContent id="recordings-panel">
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
          <>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search recordings..."
                value={recordingsSearch}
                onChange={(e) => setRecordingsSearch(e.target.value)}
                className="pl-9 pr-8 h-9"
              />
              {recordingsSearch && (
                <button
                  type="button"
                  onClick={() => setRecordingsSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {(["all", "today", "7d", "30d"] as const).map((preset) => (
                <Button
                  key={preset}
                  variant={recordingsDateFilter === preset ? "secondary" : "outline"}
                  size="sm"
                  className="h-9 px-3 text-xs"
                  onClick={() => setRecordingsDateFilter(preset)}
                >
                  {preset === "all" ? "All" : preset === "today" ? "Today" : preset}
                </Button>
              ))}
            </div>
            {recordingDevices.length > 1 && (
              <Select value={recordingsDeviceFilter} onValueChange={setRecordingsDeviceFilter}>
                <SelectTrigger className="h-9 w-auto min-w-[120px] text-xs" aria-label="Filter by device">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All devices</SelectItem>
                  {recordingDevices.map(([name, count]) => (
                    <SelectItem key={name} value={name}>{name} ({count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {filteredRecordings && filteredRecordings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No recordings match your filters.
            </p>
          ) : (
          <>
          <Table>
            <TableCaption className="sr-only">List of recorded audio files</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Date</TableHead>
                <TableHead className="w-20">Duration</TableHead>
                <TableHead className="w-20">Size</TableHead>
                <TableHead>Device</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRecordings?.map((rec) => {
                const isActive = status.recording && rec.filename === status.recording_file;
                const isPlaying = playingFile === rec.filename;
                const isServerPlaying = serverPlayingFile === rec.filename || status.server_playback?.filename === rec.filename;
                return (
                  <RecordingRow
                    key={rec.filename}
                    rec={rec}
                    isActive={!!isActive}
                    isPlaying={isPlaying}
                    isServerPlaying={!!isServerPlaying}
                  />
                );
              })}
            </TableBody>
          </Table>
          <div ref={sentinelRef} />
          {filteredRecordings && visibleRecordings && visibleRecordings.length < filteredRecordings.length && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading more...
            </div>
          )}
          {filteredRecordings && visibleRecordings && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              Showing {visibleRecordings.length} of {filteredRecordings.length} recording{filteredRecordings.length !== 1 ? "s" : ""}
              {(recordingsSearch || recordingsDateFilter !== "all" || recordingsDeviceFilter !== "all") && recordings ? ` (${recordings.length} total)` : ""}
            </p>
          )}
          </>
          )}
          </>
        )}
      </CardContent>
      )}
    </Card>
  );
}
