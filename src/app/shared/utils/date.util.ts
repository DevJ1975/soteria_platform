/**
 * Shared date helpers for the forms and list pages that speak the
 * `datetime-local` input dialect (local-clock string, no timezone) and
 * need locale-aware display of ISO timestamps.
 *
 * Why extracted
 * -------------
 * `localNow()` / `toDatetimeLocal()` were duplicated in the two forms
 * that take a datetime (equipment-check-form, incident-report-form), and
 * the `toLocaleString` display helper was duplicated in three places
 * (equipment-checks-panel, incident-reports-list, incident-report-detail).
 * One util, one behavior to update when we add i18n or timezone handling.
 */

/**
 * Current time formatted for an `<input type="datetime-local">`
 * (`YYYY-MM-DDTHH:mm`, local clock, no timezone suffix).
 *
 * Used for both initial values ("default to now") and `max=` attributes
 * ("no future dates please"). The max-attribute use is best-effort — the
 * clock advances while the user fills the form. For a hard server-side
 * check we'd need a CHECK constraint or trigger; for this layer we're
 * preventing only the obviously-wrong case.
 */
export function localNow(): string {
  return toDatetimeLocal(new Date().toISOString());
}

/**
 * Convert an ISO timestamp (UTC) to the string a `datetime-local` input
 * accepts. `datetime-local` is TZ-less, so we format in the user's local
 * clock. Round-trip to the server is lossless: on submit the caller does
 * `new Date(value).toISOString()` which parses the local-clock string
 * against the user's timezone and re-encodes as UTC.
 */
export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/**
 * Format an ISO timestamp as "Apr 16, 2026, 2:30 PM" in the user's locale
 * and timezone. Used wherever we show a recorded timestamp — check
 * history, event date on reports, closed date, etc.
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Relative-time formatter — "2h ago", "in 3d", "just now", etc.
 * Handles both past and future times. Used on surfaces where "how long
 * ago" matters more than the exact timestamp (recent-activity feeds,
 * notifications, chat).
 */
export function formatRelativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(delta);
  const future = delta < 0;

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (abs < 45_000) return 'just now';
  if (abs < hour) return formatUnit(abs / minute, 'm', future);
  if (abs < day) return formatUnit(abs / hour, 'h', future);
  if (abs < week) return formatUnit(abs / day, 'd', future);
  if (abs < 30 * day) return formatUnit(abs / week, 'w', future);
  if (abs < 365 * day) return formatUnit(abs / (30 * day), 'mo', future);
  return formatUnit(abs / (365 * day), 'y', future);
}

/**
 * Hybrid relative/absolute date for recent-activity rows.
 *
 * Uses relative time when the event is within the last 7 days (the most
 * scannable form for "recent") and switches to an absolute short date
 * ("Apr 16") for anything older. Matches the GitHub/Slack pattern.
 */
export function formatActivityDate(iso: string): string {
  const diffDays = Math.abs(Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000);
  if (diffDays < 7) return formatRelativeTime(iso);
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatUnit(value: number, suffix: string, future: boolean): string {
  const n = Math.max(1, Math.floor(value));
  return future ? `in ${n}${suffix}` : `${n}${suffix} ago`;
}
