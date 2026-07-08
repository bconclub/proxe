/** Push + local notifications via expo-notifications.
 *  Local notifications work everywhere with no setup. Remote (Expo push) needs
 *  an EAS projectId - guarded so the app never crashes when it's absent. */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { colors } from '../theme';
import { api } from './api';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerForPush(no?: number): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Campaign updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: colors.accent,
    });
  }

  if (!Device.isDevice) return null; // emulators can't get a push token

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  try {
    const projectId =
      (Constants.expoConfig?.extra as any)?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;
    const token = (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    ).data;
    if (token) {
      api.registerDevice({ token, platform: Platform.OS, no }).catch(() => {});
    }
    return token;
  } catch {
    return null; // no projectId yet (dev) - fine, local notifications still work
  }
}

/** Fire an immediate local notification - used by the journey demo + test button.
 *  On web, falls back to the browser Notification API. */
export async function sendLocal(title: string, body: string) {
  if (Platform.OS === 'web') {
    try {
      const N = (globalThis as any).Notification;
      if (N) {
        if (N.permission === 'granted') new N(title, { body });
        else if (N.permission !== 'denied') {
          const perm = await N.requestPermission();
          if (perm === 'granted') new N(title, { body });
        }
      }
    } catch {
      /* no-op on web */
    }
    return;
  }
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });
}
