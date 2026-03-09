"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Status } from "@/types/dashboard";

export type VoxConfig = { threshold: number; triggerMs: number; preBufferSecs: number; postSilenceSecs: number };

export function useVox({
  status, fetchStatus, fetchRecordings,
}: {
  status: Status;
  fetchStatus: () => Promise<void>;
  fetchRecordings: () => Promise<unknown>;
}) {
  const [voxLoading, setVoxLoading] = useState(false);
  const [voxConfigOpen, setVoxConfigOpen] = useState(false);
  const [voxConfig, setVoxConfig] = useState<VoxConfig>({ threshold: -30, triggerMs: 500, preBufferSecs: 5, postSilenceSecs: 10 });
  const [voxConfigLoaded, setVoxConfigLoaded] = useState(false);

  async function toggleVox() {
    setVoxLoading(true);
    try {
      await fetch(status.vox.active ? "/api/vox/stop" : "/api/vox/start", { method: "POST" });
      await fetchStatus();
      await fetchRecordings();
      toast.success(status.vox.active ? "VOX stopped" : "VOX started");
    } finally { setVoxLoading(false); }
  }

  async function saveVoxConfig(updates: Partial<VoxConfig>) {
    let updated!: VoxConfig;
    setVoxConfig((prev) => { updated = { ...prev, ...updates }; return updated; });
    try {
      await fetch("/api/vox/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
    } catch { toast.error("Failed to save VOX config"); }
  }

  return {
    voxLoading, voxConfig, voxConfigOpen, setVoxConfigOpen, voxConfigLoaded, setVoxConfigLoaded, setVoxConfig, toggleVox, saveVoxConfig,
  };
}
