/**
 * Turn any caught value into a user-facing string. Supabase throws
 * `PostgrestError` objects whose `message` property is already
 * human-readable in most cases, so surfacing it directly is fine for now.
 * When we add i18n or a richer error taxonomy, this function becomes the
 * single place to map to translated copy.
 */
export function extractErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return fallback;
}

/**
 * Escapes PostgreSQL `ilike` wildcards so user input matches literally.
 * `%` and `_` are the wildcard characters; `\` is the default escape.
 */
export function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}
