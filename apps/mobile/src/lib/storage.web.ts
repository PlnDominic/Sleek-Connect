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
