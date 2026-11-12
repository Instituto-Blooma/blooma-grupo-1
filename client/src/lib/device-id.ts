const STORAGE_KEY = 'medbridge:aparelho';

let cached: string | null = null;

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `aparelho-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Identifies this browser (computer or phone) so a request accepted here shows as
 * "Solicitação em andamento" on every other pharmacy device. Kept in localStorage so it survives
 * reloads; falls back to an id that lasts until the tab is closed when storage is blocked.
 */
export function getDeviceId(): string {
  if (cached) {
    return cached;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const created = randomId();
    window.localStorage.setItem(STORAGE_KEY, created);
    cached = created;
    return created;
  } catch {
    cached = randomId();
    return cached;
  }
}
