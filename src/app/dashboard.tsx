"use client";

import React from "react";
import { useTheme } from "next-themes";
import {
  AudioLines,
  ChevronDown,
  Languages,
  Keyboard,
  Loader2,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardMixer } from "@/components/card-mixer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DashboardProvider, useDashboard } from "@/contexts/dashboard-context";
import { CardRecording } from "@/components/card-recording";
import { CardMonitor } from "@/components/card-monitor";
import { CardTalkback } from "@/components/card-talkback";
import { CardRecordingsTable } from "@/components/card-recordings-table";
import { TranscriptionDialog } from "@/components/transcription-dialog";

export default function Dashboard({ authEnabled }: { authEnabled: boolean }) {
  return (
    <DashboardProvider>
      <DashboardContent authEnabled={authEnabled} />
    </DashboardProvider>
  );
}

function DashboardContent({ authEnabled }: { authEnabled: boolean }) {
  const { theme, setTheme } = useTheme();
  const {
    mounted,
    shortcutsDialogOpen,
    setShortcutsDialogOpen,
    cardMixers,
    mixerLoading,
    mixerOpen,
    setMixerOpen,
    updateMixer,
    transcribingFiles,
    status,
  } = useDashboard();
  const [transcriptionDialogOpen, setTranscriptionDialogOpen] = React.useState(false);

  return (
    <main id="main" className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <AudioLines className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Auris</h1>
          <span className="text-sm pt-1 text-muted-foreground">
            Remote Audio Console
          </span>
          <div className="ml-auto flex items-center gap-1">
            {status.whisper_enabled && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={transcribingFiles.size > 0 ? `Transcription (${transcribingFiles.size} active)` : "Transcription"}
                      className="relative"
                      onClick={() => setTranscriptionDialogOpen(true)}
                    >
                      <Languages className="h-5 w-5" />
                      {transcribingFiles.size > 0 && (
                        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Transcription</TooltipContent>
                </Tooltip>
                <TranscriptionDialog open={transcriptionDialogOpen} onOpenChange={setTranscriptionDialogOpen} />
              </>
            )}
            <span className="hidden [@media(pointer:fine)]:contents">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Keyboard shortcuts"
                    onClick={() => setShortcutsDialogOpen(true)}
                  >
                    <Keyboard className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Keyboard shortcuts</TooltipContent>
              </Tooltip>
            </span>
            <Dialog open={shortcutsDialogOpen} onOpenChange={setShortcutsDialogOpen}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Keyboard Shortcuts</DialogTitle>
                  <DialogDescription>
                    Shortcuts are disabled while typing or when a dialog is open.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2 text-sm">
                  {[
                    ["Toggle recording", "R"],
                    ["Toggle listening", "L"],
                    ["Push-to-talk (hold)", "K"],
                    ["Client record", "C"],
                  ].map(([label, key]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span>{label}</span>
                      <kbd className="border rounded text-xs font-mono bg-muted inline-flex items-center justify-center w-6 h-6 leading-none">{key}</kbd>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <Tooltip>
              <TooltipTrigger asChild>
                {mounted ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  >
                    <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" disabled aria-label="Loading theme">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent>{theme === "dark" ? "Light" : "Dark"} mode</TooltipContent>
            </Tooltip>
            {authEnabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => signOut()}
                  >
                    <LogOut className="h-5 w-5" />
                    <span className="sr-only">Sign out</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sign out</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="grid gap-4 md:grid-cols-2">
          <CardRecording />
          <CardMonitor />
        </div>

        <CardTalkback />

        {/* Mixer Card (collapsible) */}
        <Card>
          <button
            type="button"
            className="flex w-full items-center justify-between px-6 text-left"
            onClick={() => setMixerOpen((o) => !o)}
            aria-expanded={mounted && mixerOpen}
            aria-controls="mixer-panel"
          >
            <div className="space-y-2">
              <CardTitle className="text-lg" role="heading" aria-level={2}>Mixer</CardTitle>
              <CardDescription>ALSA mixer levels per card</CardDescription>
            </div>
            <div className="flex items-center justify-center h-7 w-7 shrink-0">
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground ${mounted ? "transition-transform duration-200 opacity-100" : "opacity-0"} ${mounted && mixerOpen ? "rotate-180" : ""}`}
              />
            </div>
          </button>
          {mounted && mixerOpen && (
            <CardContent id="mixer-panel" className="pt-0">
              {cardMixers === null ? (
                <div className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground" role="status" aria-live="polite">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Loading mixer...</span>
                </div>
              ) : cardMixers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No audio cards found
                </p>
              ) : cardMixers.length === 1 ? (
                <CardMixer
                  mixer={cardMixers[0]}
                  onUpdateMixer={updateMixer}
                  loading={mixerLoading}
                />
              ) : (
                <Tabs defaultValue={String(cardMixers[0].card)}>
                  <TabsList className="w-full">
                    {cardMixers.map((m) => (
                      <TabsTrigger key={m.card} value={String(m.card)} className="flex-1">
                        {m.cardName}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {cardMixers.map((m) => (
                    <TabsContent key={m.card} value={String(m.card)} className="pt-4">
                      <CardMixer
                        mixer={m}
                        onUpdateMixer={updateMixer}
                        loading={mixerLoading}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </CardContent>
          )}
        </Card>

        <CardRecordingsTable />
      </div>
    </main>
  );
}
