"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  isSoundEnabled,
  setSoundEnabled,
  getSoundVolume,
  setSoundVolume,
  playTestSound,
  unlockAudio,
} from "@/lib/notification-sound";

export function SoundToggle() {
  const [enabled, setEnabledState] = useState(true);
  const [volume, setVolumeState] = useState(60);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setEnabledState(isSoundEnabled());
    setVolumeState(Math.round(getSoundVolume() * 100));
    setMounted(true);
  }, []);

  function toggle() {
    unlockAudio();
    const next = !enabled;
    setEnabledState(next);
    setSoundEnabled(next);
    if (next) playTestSound();
  }

  function changeVolume(v: number) {
    unlockAudio();
    setVolumeState(v);
    setSoundVolume(v);
  }

  if (!mounted) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center justify-center h-8 w-8 rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
        aria-label={enabled ? "Sons activés" : "Sons coupés"}
        title={enabled ? "Sons activés" : "Sons coupés"}
      >
        {enabled ? (
          <Volume2 className="h-4 w-4" />
        ) : (
          <VolumeX className="h-4 w-4 text-ink-3" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-3">
        <div className="space-y-3">
          <button
            onClick={toggle}
            className={`w-full text-left text-sm font-bold flex items-center gap-2 px-2 py-1.5 rounded-md ${
              enabled ? "bg-success-light text-success" : "bg-surface-2 text-ink-3"
            }`}
          >
            {enabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
            {enabled ? "Sons activés" : "Sons coupés"}
          </button>
          <div className="px-2">
            <label className="text-[11px] uppercase tracking-wider font-bold text-ink-3 mb-1 block">
              Volume — {volume}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volume}
              onChange={(e) => changeVolume(parseInt(e.target.value, 10))}
              disabled={!enabled}
              className="w-full"
            />
          </div>
          <button
            onClick={() => {
              unlockAudio();
              playTestSound();
            }}
            disabled={!enabled}
            className="w-full text-xs px-2 py-1.5 rounded-md border border-line hover:bg-surface-2 disabled:opacity-50"
          >
            Tester le son
          </button>
          <p className="text-[10px] text-ink-3 px-2 leading-snug">
            Sons : nouveau message (ding doux), mention @ (double ding),
            demande URGENTE / anomalie critique (alarme).
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
