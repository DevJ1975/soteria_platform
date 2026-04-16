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

/**
 * Sanitizes a search term for safe interpolation into a PostgREST `.or()`
 * filter. `.or()` uses commas as filter separators and double quotes as
 * value delimiters, so any of those characters in user input would break
 * the parse. We strip them — losing those two characters in free-text
 * search is a negligible UX cost for guaranteed correctness.
 *
 * Callers are still expected to run the result through
 * {@link escapeIlikePattern} before using it as an ilike value.
 */
export function sanitizeOrFilterTerm(input: string): string {
  return input.replace(/[",]/g, '');
}

/**
 * Detects PostgreSQL unique-constraint violations (error code 23505).
 * Pass a constraint name to narrow to a specific one — useful for mapping
 * DB errors to friendly, context-aware messages in UI code.
 *
 * Example:
 *   if (isUniqueViolation(err, 'equipment_tenant_asset_tag_uq')) {
 *     errorMessage.set('An asset with this tag already exists.');
 *   }
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code !== '23505') return false;
  if (!constraint) return true;

  const details = (err as { details?: unknown }).details;
  const message = (err as { message?: unknown }).message;
  const haystack =
    (typeof details === 'string' ? details : '') +
    ' ' +
    (typeof message === 'string' ? message : '');
  return haystack.includes(constraint);
}
