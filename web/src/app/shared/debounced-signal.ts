import { DestroyRef, effect, inject, signal, untracked, type Signal } from '@angular/core';

/** Signal that follows `source` after `ms` of quiet. Call in an injection context. */
export function debouncedSignal<T>(source: Signal<T>, ms: number): Signal<T> {
  const out = signal(untracked(source));
  let timer: ReturnType<typeof setTimeout> | undefined;
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  effect(() => {
    const value = source();
    clearTimeout(timer);
    timer = setTimeout(() => out.set(value), ms);
  });
  return out.asReadonly();
}
