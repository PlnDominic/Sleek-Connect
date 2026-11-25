import { deviceStorage } from './storage';

const KEY = 'sleek-connect:delivery-area';

export function readDeliveryArea(): string {
  try {
    return deviceStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberDeliveryArea(area: string) {
  try {
    deviceStorage.setItem(KEY, area.trim());
  } catch {
    // The current screen can still use the area.
  }
}
