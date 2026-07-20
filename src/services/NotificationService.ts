import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../config/firebase';
import i18n, { type AppLanguage } from '../i18n';
import { palette } from '../theme/designTokens';

function notificationLanguage(value: string): AppLanguage {
  if (value.startsWith('ar')) return 'ar';
  if (value.startsWith('en')) return 'en';
  return 'fr';
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldSetBadge: false,
  }),
});

function getExpoProjectId(): string | undefined {
  const configuredProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  const easProjectId = Constants.easConfig?.projectId;
  if (typeof configuredProjectId === 'string' && configuredProjectId.length > 0) {
    return configuredProjectId;
  }
  if (typeof easProjectId === 'string' && easProjectId.length > 0) {
    return easProjectId;
  }
  return undefined;
}

/** Enregistre la plateforme + l'horodatage de connexion sur users/{uid}. */
export async function recordLogin(userId: string) {
  if (!userId) return;
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      lastLoginAt: serverTimestamp(),
      lastLoginPlatform: Platform.OS,
    }, { merge: true });
  } catch (e) {
    console.warn('[auth] failed to record login', e);
  }
}

/**
 * Résout ville/pays depuis l'IP réelle de connexion, côté serveur (Cloud
 * Function recordLoginLocation) — le client ne peut ni connaître ni
 * falsifier sa propre IP publique, donc ce n'est pas un simple setDoc.
 */
export async function recordLoginLocation() {
  try {
    await httpsCallable(functions, 'recordLoginLocation')();
  } catch (e) {
    console.warn('[auth] failed to record login location', e);
  }
}

export async function clearPushToken(userId: string) {
  if (!userId) return;
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      expoPushToken: null,
      expoPushTokenUpdatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.warn('[push] failed to clear token', e);
  }
}

export async function registerForPushNotificationsAsync(userId: string) {
  let token;
  
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: palette.brandRed,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return;
  }

  // EAS project ID (UUID from app.json extra.eas.projectId).
  // Required since Expo SDK 53+ — push notifications fail silently without it.
  // ⚠️ Dans EXPO GO (npx expo start), les push distants n'existent plus depuis
  // SDK 53 : cet appel échoue → AUCUN token enregistré → le téléphone ne sera
  // jamais notifié. Tester les push sur un build EAS ou la version Play Store.
  try {
    const projectId = getExpoProjectId();
    if (!projectId) {
      console.warn('[push] projectId EAS introuvable — impossible de créer un ExpoPushToken.');
      return;
    }
    token = (await Notifications.getExpoPushTokenAsync({
      projectId,
    })).data;
  } catch (e) {
    console.warn('[push] getExpoPushTokenAsync a échoué — push indisponibles ' +
      '(Expo Go ne les supporte plus ; utiliser un build EAS/Play Store).', e);
    return;
  }
  
  // Save token to Firestore — setDoc(merge) au lieu d'updateDoc, sinon
  // le 1er login d'un user dont le doc users/{uid} n'existe pas encore
  // plante (Firestore refuse updateDoc sur un doc inexistant).
  if (userId && token) {
    const userRef = doc(db, 'users', userId);
    try {
      await setDoc(userRef, {
        expoPushToken: token,
        expoPushTokenUpdatedAt: serverTimestamp(),
        notificationLanguage: notificationLanguage(i18n.language),
      }, { merge: true });
    } catch (e) {
      console.warn('[push] failed to persist token', e);
    }
  }

  return token;
}

export async function syncNotificationLanguage(lang: AppLanguage) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid), {
      notificationLanguage: lang,
      notificationLanguageUpdatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.warn('[push] failed to persist notification language', e);
  }
}
