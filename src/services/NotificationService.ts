import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldSetBadge: false,
  }),
});

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
      lightColor: '#FF231F7C',
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
  token = (await Notifications.getExpoPushTokenAsync({
    projectId: '6ff4e5d9-040f-45df-ac65-5cf941ad8627',
  })).data;
  
  // Save token to Firestore — setDoc(merge) au lieu d'updateDoc, sinon
  // le 1er login d'un user dont le doc users/{uid} n'existe pas encore
  // plante (Firestore refuse updateDoc sur un doc inexistant).
  if (userId && token) {
    const userRef = doc(db, 'users', userId);
    try {
      await setDoc(userRef, {
        expoPushToken: token,
        expoPushTokenUpdatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.warn('[push] failed to persist token', e);
    }
  }

  return token;
}
