import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './auth';
import { UUID_PATTERN } from './orders';
import { supabase } from './supabase';

export type PushResult = 'granted' | 'denied' | 'unsupported';

// Show order updates as banners even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/**
 * Registers this phone for order updates. With an order token it also follows that order, so guests are covered too.
 * `ask: false` only refreshes a registration the shopper already allowed. Remote push needs a real phone and a build
 * with an EAS project (Expo Go on Android can't receive it), so anything else is "unsupported", never an error.
 */
export async function registerForPush(orderToken?: string, { ask = true }: { ask?: boolean } = {}): Promise<PushResult> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Order updates', importance: Notifications.AndroidImportance.DEFAULT });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      if (!ask) return 'denied';
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return 'denied';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return 'unsupported';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_device', {
      p_token: token,
      p_platform: Platform.OS,
      p_order_token: orderToken ?? null,
    });
    if (error) throw error;
    return 'granted';
  } catch {
    return 'unsupported';
  }
}

/** Stops order updates on this phone. */
export async function unregisterPush(): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.rpc('unregister_push_device', { p_token: token });
  } catch {
    // Not registered, or offline: nothing to undo.
  }
}

export async function pushAllowed(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  try {
    return (await Notifications.getPermissionsAsync()).status === 'granted';
  } catch {
    return false;
  }
}

/** Opens the order when a notification is tapped, and keeps the phone registered for whoever is signed in. */
export function PushSetup() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Signing in or out moves the phone's registration to the right account; the shopper has already said yes.
  useEffect(() => {
    void registerForPush(undefined, { ask: false });
  }, [userId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const token = response?.notification.request.content.data?.orderToken;
      if (typeof token === 'string' && UUID_PATTERN.test(token)) router.push({ pathname: '/orders/[token]', params: { token } });
    };
    // A tap that launched the app, and taps while it is running.
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);

  return null;
}
