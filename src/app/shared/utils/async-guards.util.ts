import { DestroyRef, inject } from '@angular/core';

/**
 * Tracks a monotonic generation counter so async responses can be
 * discarded when a newer request has superseded them. Without this, fast
 * filter changes can land out-of-order and leave stale data on screen.
 *
 * Usage:
 *   private readonly guard = createGenerationGuard();
 *
 *   async refresh() {
 *     const gen = this.guard.next();
 *     const rows = await this.service.getThings();
 *     if (!this.guard.isCurrent(gen)) return;
 *     this.rows.set(rows);
 *   }
 *
 * The component's `DestroyRef` is pulled via `inject()` by default, so
 * this must be called from an injection context (field initializer, ctor).
 */
export function createGenerationGuard(
  destroyRef: DestroyRef = inject(DestroyRef),
): { next: () => number; isCurrent: (gen: number) => boolean } {
  let gen = 0;
  destroyRef.onDestroy(() => {
    // Poison the counter so any in-flight check returns false.
    gen = Number.MIN_SAFE_INTEGER;
  });
  return {
    next: () => ++gen,
    isCurrent: (g) => g === gen,
  };
}

/**
 * Simple trailing-edge debouncer tied to a component lifecycle.
 *
 * Usage:
 *   private readonly debounce = createDebouncer(250);
 *
 *   onSearchChange(value: string) {
 *     this.filters.update((f) => ({ ...f, searchText: value }));
 *     this.debounce(() => void this.refresh());
 *   }
 *
 * The scheduled callback is cancelled when the component is destroyed, so
 * we never fire a refresh against a torn-down component.
 */
export function createDebouncer(
  ms: number,
  destroyRef: DestroyRef = inject(DestroyRef),
): (action: () => void) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  destroyRef.onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
  return (action) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(action, ms);
  };
}
