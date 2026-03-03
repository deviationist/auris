"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MixerVolume {
  name: string;
  min: number;
  max: number;
  value: number;
  percent: number;
  dB: string;
  enabled: boolean;
}

interface MixerEnum {
  name: string;
  items: string[];
  current: string;
}

export interface CardMixerState {
  card: number;
  cardName: string;
  capture: MixerVolume | null;
  micBoost: MixerVolume | null;
  inputSource: MixerEnum | null;
}

interface CardMixerProps {
  mixer: CardMixerState;
  onUpdateMixer: (
    card: number,
    updates: Partial<{ capture: number; micBoost: number; inputSource: string }>
  ) => Promise<void>;
  loading: boolean;
}

export function CardMixer({ mixer, onUpdateMixer, loading }: CardMixerProps) {
  const [localCapture, setLocalCapture] = useState<number | null>(null);
  const [localBoost, setLocalBoost] = useState<number | null>(null);

  const hasMixer = mixer.capture || mixer.micBoost || mixer.inputSource;
  if (!hasMixer) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No mixer controls available for this card.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {mixer.capture && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Capture Volume</Label>
            <span className="text-sm text-muted-foreground font-mono">
              {localCapture !== null
                ? `${Math.round((localCapture / mixer.capture.max) * 100)}%`
                : `${mixer.capture.percent}% (${mixer.capture.dB})`}
            </span>
          </div>
          <Slider
            value={[localCapture ?? mixer.capture.value]}
            min={mixer.capture.min}
            max={mixer.capture.max}
            step={1}
            onValueChange={(v) => setLocalCapture(v[0])}
            onValueCommit={(v) => {
              setLocalCapture(null);
              onUpdateMixer(mixer.card, { capture: v[0] });
            }}
            disabled={loading}
          />
        </div>
      )}

      {mixer.micBoost && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Input Boost</Label>
            <span className="text-sm text-muted-foreground font-mono">
              +{(localBoost ?? mixer.micBoost.value) * 12}dB
            </span>
          </div>
          <Slider
            value={[localBoost ?? mixer.micBoost.value]}
            min={0}
            max={3}
            step={1}
            onValueChange={(v) => setLocalBoost(v[0])}
            onValueCommit={(v) => {
              setLocalBoost(null);
              onUpdateMixer(mixer.card, { micBoost: v[0] });
            }}
            disabled={loading}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0dB</span>
            <span>+12dB</span>
            <span>+24dB</span>
            <span>+36dB</span>
          </div>
        </div>
      )}

      {mixer.inputSource && (
        <div className="space-y-2">
          <Label>Input Source</Label>
          <Select
            value={mixer.inputSource.current}
            onValueChange={(v) =>
              onUpdateMixer(mixer.card, { inputSource: v })
            }
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mixer.inputSource.items.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
