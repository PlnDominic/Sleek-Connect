import type { BagStorage } from '@sleek/shared/bag';

/** On the web preview the browser's own storage does the job. */
export const deviceStorage: BagStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Blocked storage: nothing is kept.
    }
  },
};

export const getDeviceStorage = () => deviceStorage;

/** The session on the web preview, in the browser's own storage. */
export const authStorage = {
  getItem: (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Blocked storage: the session lasts until the page closes.
    }
  },
  removeItem: (key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing was kept.
    }
  },
};
