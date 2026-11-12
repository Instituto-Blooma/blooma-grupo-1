import { useSyncExternalStore } from 'react';

/**
 * Accessibility preferences (font size and high contrast), applied to <html> and saved in
 * localStorage so they survive page changes, reloads and new visits on this device.
 */

export const FONT_SCALES = [0.875, 1, 1.125, 1.25, 1.375, 1.5] as const;
export const DEFAULT_FONT_SCALE = 1;
export const HIGH_CONTRAST_CLASS = 'alto-contraste';

const STORAGE_KEY = 'medbridge:acessibilidade';

export type AccessibilityPreferences = {
  fontScale: number;
  highContrast: boolean;
};

const DEFAULTS: AccessibilityPreferences = { fontScale: DEFAULT_FONT_SCALE, highContrast: false };

function isValidScale(value: unknown): value is number {
  return typeof value === 'number' && (FONT_SCALES as ReadonlyArray<number>).includes(value);
}

function load(): AccessibilityPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULTS;
    }
    const parsed = JSON.parse(raw) as Partial<AccessibilityPreferences>;
    return {
      fontScale: isValidScale(parsed.fontScale) ? parsed.fontScale : DEFAULT_FONT_SCALE,
      highContrast: parsed.highContrast === true,
    };
  } catch {
    return DEFAULTS;
  }
}

function save(preferences: AccessibilityPreferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Private mode or blocked storage: preferences still apply until the tab is closed.
  }
}

/** Font size is set on <html>; the UI uses rem units, so everything scales together. */
function apply(preferences: AccessibilityPreferences) {
  const root = document.documentElement;
  root.style.fontSize =
    preferences.fontScale === DEFAULT_FONT_SCALE ? '' : `${preferences.fontScale * 100}%`;
  root.classList.toggle(HIGH_CONTRAST_CLASS, preferences.highContrast);
}

let current: AccessibilityPreferences = DEFAULTS;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  current = load();
  apply(current);
}

function update(next: AccessibilityPreferences) {
  current = next;
  apply(next);
  save(next);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAccessibilityPreferences() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULTS
  );
}

export const accessibilityActions = {
  increaseFont() {
    const index = FONT_SCALES.indexOf(current.fontScale as (typeof FONT_SCALES)[number]);
    const next = FONT_SCALES[Math.min(index + 1, FONT_SCALES.length - 1)];
    update({ ...current, fontScale: next ?? DEFAULT_FONT_SCALE });
  },
  decreaseFont() {
    const index = FONT_SCALES.indexOf(current.fontScale as (typeof FONT_SCALES)[number]);
    const next = FONT_SCALES[Math.max(index - 1, 0)];
    update({ ...current, fontScale: next ?? DEFAULT_FONT_SCALE });
  },
  resetFont() {
    update({ ...current, fontScale: DEFAULT_FONT_SCALE });
  },
  toggleHighContrast() {
    update({ ...current, highContrast: !current.highContrast });
  },
};

export function canIncreaseFont(preferences: AccessibilityPreferences) {
  return preferences.fontScale < FONT_SCALES[FONT_SCALES.length - 1];
}

export function canDecreaseFont(preferences: AccessibilityPreferences) {
  return preferences.fontScale > FONT_SCALES[0];
}
