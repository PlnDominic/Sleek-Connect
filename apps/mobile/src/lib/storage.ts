import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import type { BagStorage } from '@sleek/shared/bag';

/** Small values kept on the phone (the bag, saved items). Reads and writes are immediate, so no loading step. */
export const deviceStorage: BagStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => Storage.setItemSync(key, value),
};

/** `BagProvider` wants a function that returns the storage. */
export const getDeviceStorage = () => deviceStorage;

/**
 * The signed-in session, kept in the phone's secure store (Android Keystore / iOS Keychain), not in the plain app database where a
 * device backup or another tool could read it. A session is bigger than one secure value is meant to hold, so it is split into
 * pieces. A session saved by an earlier version of the app is moved across the first time it is read.
 */
const PIECE = 1800;
const countKey = (key: string) => `${key}.n`;
const pieceKey = (key: string, i: number) => `${key}.${i}`;
const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

async function readSecure(key: string): Promise<string | null> {
  const count = Number(await SecureStore.getItemAsync(countKey(key), options));
  if (!count) return null;
  const pieces: string[] = [];
  for (let i = 0; i < count; i++) {
    const piece = await SecureStore.getItemAsync(pieceKey(key, i), options);
    if (piece === null) return null;
    pieces.push(piece);
  }
  return pieces.join('');
}

async function removeSecure(key: string) {
  const count = Number(await SecureStore.getItemAsync(countKey(key), options)) || 0;
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(pieceKey(key, i), options);
  await SecureStore.deleteItemAsync(countKey(key), options);
}

async function writeSecure(key: string, value: string) {
  await removeSecure(key);
  const pieces = value.match(new RegExp(`[\\s\\S]{1,${PIECE}}`, 'g')) ?? [];
  for (let i = 0; i < pieces.length; i++) await SecureStore.setItemAsync(pieceKey(key, i), pieces[i], options);
  // The count is written last, so a half-written session is never read.
  await SecureStore.setItemAsync(countKey(key), String(pieces.length), options);
}

export const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await readSecure(key);
      if (value !== null) return value;
    } catch {
      // Fall through to an older copy, if any.
    }
    const old = Storage.getItemSync(key);
    if (old) {
      try {
        await writeSecure(key, old);
        Storage.removeItemSync(key);
      } catch {
        // Keep the old copy until the secure store works.
      }
    }
    return old;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await writeSecure(key, value);
      Storage.removeItemSync(key);
    } catch {
      // The secure store is unavailable: the session lasts until the app closes rather than being written in the clear.
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await removeSecure(key);
    } catch {
      // Nothing to remove.
    }
    Storage.removeItemSync(key);
  },
};
