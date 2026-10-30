// App theme: Light / Dark / System default. Light is the default.
// Persisted per device in localStorage. "system" follows the phone's setting.
// The marketing website always stays dark (ThemeManager forces it there);
// this only drives the in-app look.
const KEY = "nk_theme";
export const THEMES = ["light", "dark", "system"];

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : "light";
  } catch (_) { return "light"; }
}

export function setThemePref(v) {
  try { localStorage.setItem(KEY, THEMES.includes(v) ? v : "light"); } catch (_) {}
  // Let the live ThemeManager re-apply immediately.
  try { window.dispatchEvent(new Event("nk-theme-change")); } catch (_) {}
}

function systemIsDark() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches); }
  catch (_) { return false; }
}

// A preference ("light"|"dark"|"system") -> the concrete theme to paint.
export function resolveTheme(pref) {
  if (pref === "dark") return "dark";
  if (pref === "system") return systemIsDark() ? "dark" : "light";
  return "light";
}

// Paint a concrete theme by setting <html data-theme>.
export function applyTheme(concrete) {
  try { document.documentElement.setAttribute("data-theme", concrete === "dark" ? "dark" : "light"); } catch (_) {}
}

// Apply the saved preference right now (used at boot, before React renders,
// to avoid a flash of the wrong theme).
export function applySavedTheme() { applyTheme(resolveTheme(getThemePref())); }
