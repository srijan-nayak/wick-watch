/**
 * alertNotify.ts
 * Two-channel alert system for pattern detections:
 *   1. Browser Notification API  — OS-level popup, visible on other tabs / minimized windows
 *   2. Web Audio API chime       — synthesized two-tone ping, no audio file required
 */

// ─── Browser Notifications ────────────────────────────────────────────────────

/**
 * Request notification permission.
 * Must be called from a user-gesture handler (click) or the browser will block it.
 * Returns true if permission was granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Fire an OS-level browser notification for a pattern match.
 * Silently skips if permission is not granted.
 */
export function sendPatternNotification(pattern: string, symbol: string, candleTime: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const n = new Notification(`${pattern} — ${symbol}`, {
    body: `Pattern matched at candle ${candleTime}`,
    icon: '/favicon.ico',
    tag: `wickwatch-${pattern}-${symbol}`,   // collapse rapid duplicates
    requireInteraction: false,
    silent: true,                             // we handle sound ourselves
  });

  // Auto-close after 6 seconds
  setTimeout(() => n.close(), 6_000);
}

// ─── Web Audio chime ──────────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext();
  }
  return _audioCtx;
}

/**
 * Play a two-tone chime: a short high note followed by a slightly lower one.
 * Uses a triangle wave for a soft, non-jarring sound.
 * Total duration ≈ 0.45 s.
 */
export function playAlertChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume in case it was suspended (browsers auto-suspend on inactivity)
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => _scheduleChime(ctx)).catch(() => undefined);
  } else {
    _scheduleChime(ctx);
  }
}

function _scheduleChime(ctx: AudioContext): void {
  const now = ctx.currentTime;

  // Note 1: higher pitch
  _playTone(ctx, 1047, now,        0.18);  // C6
  // Note 2: lower pitch after a short gap
  _playTone(ctx, 784,  now + 0.20, 0.22);  // G5
}

function _playTone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
): void {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type            = 'triangle';
  osc.frequency.value = frequency;

  // Fade in quickly, hold, then fade out
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.25, startAt + 0.02);
  gain.gain.setValueAtTime(0.25,          startAt + duration * 0.6);
  gain.gain.linearRampToValueAtTime(0,    startAt + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + duration);
}

// ─── Combined fire-both helper ────────────────────────────────────────────────

export function fireAlert(pattern: string, symbol: string, candleTime: string): void {
  playAlertChime();
  sendPatternNotification(pattern, symbol, candleTime);
}
