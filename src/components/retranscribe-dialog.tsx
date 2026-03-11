"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { LanguageCombobox } from "@/components/language-picker";

export function RetranscribeDialog({
  open,
  onOpenChange,
  onConfirm,
  transcribing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (options: { language?: string; translate?: boolean }) => void;
  transcribing?: boolean;
}) {
  const [language, setLanguage] = useState<string | null>(null);
  const [translate, setTranslate] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch global settings when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/transcription")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.language) setLanguage(data.language);
        if (data?.translate !== undefined) setTranslate(data.translate);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const handleConfirm = () => {
    onConfirm({
      language: language && language !== "auto" ? language : undefined,
      translate,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Re-transcribe</DialogTitle>
          <DialogDescription>
            Override language and translation settings for this transcription.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-6" role="status" aria-label="Loading settings">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label id="retranscribe-lang-label" className="text-sm text-muted-foreground shrink-0">Language</label>
              {language !== null && (
                <LanguageCombobox value={language} onValueChange={(v) => { setLanguage(v); if (v === "en") setTranslate(false); }} />
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <label id="retranscribe-translate-label" className="text-sm text-muted-foreground">Translate to English</label>
                <p className="text-xs text-muted-foreground/70">
                  Translates non-English speech to English text
                </p>
              </div>
              <Switch checked={translate} onCheckedChange={setTranslate} disabled={language === "en"} aria-labelledby="retranscribe-translate-label" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading || transcribing}>
            {transcribing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Transcribe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
