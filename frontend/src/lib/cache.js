// Tiny in-memory stale-while-revalidate cache for tab data.
//
// Module scope survives SPA navigation, so a tab that was opened once can show
// its last data INSTANTLY when you come back to it, instead of a spinner + full
// refetch every single time (the "Family keeps reloading" problem). The page
// still refreshes quietly in the background and updates in place.
//
// It is per-session and in-memory only (never written to disk), and is cleared
// on logout so one account's data can never show under another.

const store = new Map(); // key -> { value, ts }

export function cacheGet(key) {
  const e = store.get(key);
  return e ? e.value : undefined;
}

export function cacheHas(key) {
  return store.has(key);
}

export function cacheSet(key, value) {
  store.set(key, { value, ts: Date.now() });
  return value;
}

// Age of a cached entry in ms (Infinity if absent) — lets a caller skip a
// background refetch that just happened.
export function cacheAge(key) {
  const e = store.get(key);
  return e ? Date.now() - e.ts : Infinity;
}

// Clear one key, or the whole cache when called with no argument (on logout).
export function cacheClear(key) {
  if (key === undefined) store.clear();
  else store.delete(key);
}
