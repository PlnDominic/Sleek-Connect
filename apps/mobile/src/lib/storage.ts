import Storage from 'expo-sqlite/kv-store';
import type { BagStorage } from '@sleek/shared/bag';

/** Small values kept on the phone (the bag, saved items). Reads and writes are immediate, so no loading step. */
export const deviceStorage: BagStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => Storage.setItemSync(key, value),
};

/** `BagProvider` wants a function that returns the storage. */
export const getDeviceStorage = () => deviceStorage;
