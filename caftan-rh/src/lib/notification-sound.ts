// Notifications sonores — Web Audio API synthétique (pas de fichier mp3).
// 3 timbres : 'chat' (ding doux), 'important' (double ding), 'urgent' (buzz).
//
// Préférences stockées dans `localStorage` :
//   - notif_sound_enabled : '1' | '0' (default '1')
//   - notif_sound_volume  : '0'..'100' (default '60')

export type SoundKind = "chat" | "important" | "urgent";

const STORAGE_ENABLED = "notif_sound_enabled";
const STORAGE_VOLUME = "notif_sound_volume";

let audioCtx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * À appeler sur le premier click utilisateur pour débloquer l'audio
 * (politique auto-play des navigateurs).
 */
export function unlockAudio(): void {
  if (unlocked) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  unlocked = true;
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(STORAGE_ENABLED);
  return v === null ? true : v === "1";
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_ENABLED, enabled ? "1" : "0");
}

export function getSoundVolume(): number {
  if (typeof window === "undefined") return 0.6;
  const v = window.localStorage.getItem(STORAGE_VOLUME);
  const n = v === null ? 60 : parseInt(v, 10);
  if (!Number.isFinite(n)) return 0.6;
  return Math.max(0, Math.min(1, n / 100));
}

export function setSoundVolume(volume0to100: number): void {
  if (typeof window === "undefined") return;
  const n = Math.max(0, Math.min(100, Math.round(volume0to100)));
  window.localStorage.setItem(STORAGE_VOLUME, String(n));
}

function tone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  durationMs: number,
  volume: number,
  type: OscillatorType = "sine",
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);

  const t0 = ctx.currentTime + startAt;
  const t1 = t0 + durationMs / 1000;
  // Enveloppe ADSR rapide (attack 5ms, decay/release linéaire)
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.005);
  gain.gain.linearRampToValueAtTime(0, t1);

  osc.start(t0);
  osc.stop(t1 + 0.01);
}

export function playSound(kind: SoundKind, override?: { volume?: number }): void {
  if (!isSoundEnabled()) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  const v = override?.volume ?? getSoundVolume();
  if (v <= 0) return;

  if (kind === "chat") {
    tone(ctx, 880, 0, 110, v * 0.4, "sine");
    tone(ctx, 1320, 0.06, 130, v * 0.3, "sine");
    return;
  }
  if (kind === "important") {
    tone(ctx, 1175, 0, 120, v * 0.5, "triangle");
    tone(ctx, 1175, 0.18, 120, v * 0.5, "triangle");
    tone(ctx, 1568, 0.36, 140, v * 0.45, "triangle");
    return;
  }
  if (kind === "urgent") {
    // Buzz alternant 660 / 330 Hz
    tone(ctx, 660, 0, 130, v * 0.6, "square");
    tone(ctx, 330, 0.15, 130, v * 0.55, "square");
    tone(ctx, 660, 0.3, 130, v * 0.6, "square");
    tone(ctx, 330, 0.45, 130, v * 0.55, "square");
    return;
  }
}

/** Petit son de test pour le toggle. */
export function playTestSound(): void {
  playSound("chat");
}
