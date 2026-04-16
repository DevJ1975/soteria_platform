/**
 * Helpers for PostgREST / Supabase result shapes.
 *
 * PostgREST returns embedded relationships as either a single object or
 * an array, depending on how the relationship metadata is resolved —
 * even when the underlying FK is many-to-one. When you know you asked
 * for a single parent (e.g. `plan:subscription_plans(name)`), use
 * `firstEmbedded` to normalize both shapes to one.
 */

/**
 * Returns the embedded parent, regardless of whether PostgREST
 * returned it as an object or a one-element array. `null`/`undefined`
 * pass through unchanged so callers can use optional chaining on the
 * result without an extra guard.
 *
 * Input is `unknown` because Supabase row values often come back as
 * `unknown` at call sites; the caller provides the expected `T` via
 * the type parameter and takes responsibility for the shape (same
 * contract as the row-level casts we already use in `mapRow` helpers).
 */
export function firstEmbedded<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value as T;
}
