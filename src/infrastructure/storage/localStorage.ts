import type { StoragePort } from '../../application/ports';

/** `StoragePort` on top of `window.localStorage`; failures are swallowed. */
export const browserStorage: StoragePort = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage full or unavailable: the app still works for this session.
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to clean up.
    }
  },
};
