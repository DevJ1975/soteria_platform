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
