import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, functions } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage'
import { httpsCallable } from 'firebase/functions'
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

type DeviceState = { uid: string; registered: boolean }
let registrationEpoch = 0
let deviceIdPromise: Promise<string> | null = null
let registrationQueue: Promise<unknown> = Promise.resolve()
let stoppingUid: string | null = null

async function bounded<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('notification-timeout')), ms) })]) }
  finally { if (timer) clearTimeout(timer) }
}

async function installationId(): Promise<string> {
  deviceIdPromise ??= (async () => {
    const stored = await AsyncStorage.getItem('@mojammaa/push-installation-v1')
    if (stored) return stored
    const id = doc(collection(db, '_ids')).id
    await AsyncStorage.setItem('@mojammaa/push-installation-v1', id)
    return id
  })().catch(error => { deviceIdPromise = null; throw error })
  return deviceIdPromise
}

async function saveDevice(userId: string, enabled: boolean, token?: string) {
  const deviceId = await installationId()
  if (token) await AsyncStorage.setItem('@mojammaa/push-token-v1', token)
  const previousRevision = Number(await AsyncStorage.getItem('@mojammaa/push-revision-v1') || 0)
  if (!Number.isSafeInteger(previousRevision) || previousRevision < 0) throw new Error('invalid-device-revision')
  const revision = previousRevision + 1
  await AsyncStorage.setItem('@mojammaa/push-revision-v1', String(revision))
  const result = await httpsCallable<unknown, { applied: boolean }>(functions, 'registerPushDevice', { timeout: 10_000 })({
    deviceId, revision, enabled, ...(token ? { token } : {}),
    platform: Platform.OS, language: notificationLanguage(i18n.language),
  })
  await AsyncStorage.setItem('@mojammaa/push-state-v1', JSON.stringify({ uid: userId, registered: enabled && result.data.applied !== false }))
}

export async function clearPushToken(userId: string) {
  stoppingUid = userId
  registrationEpoch++
  try {
  await registrationQueue.catch(() => {})
  if (Platform.OS === 'web') return
  let token = await AsyncStorage.getItem('@mojammaa/push-token-v1')
  if (!token) {
    const permissions = await Notifications.getPermissionsAsync()
    const projectId = getExpoProjectId()
    if (projectId && (permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL)) {
      token = (await bounded(Notifications.getExpoPushTokenAsync({ projectId }))).data
    }
  }
  await saveDevice(userId, false, token || undefined)
  } catch (error) { stoppingUid = null; throw error }
}

export async function registerForPushNotificationsAsync(userId: string, requestPermission = true): Promise<void> {
  const epoch = registrationEpoch
  const operation = async () => {
    if (stoppingUid === userId || auth.currentUser?.uid !== userId || epoch !== registrationEpoch || Platform.OS === 'web') return
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Mojammaa', importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250], lightColor: palette.brandRed,
        })
      }
      let permissions = await Notifications.getPermissionsAsync()
      if (!permissions.granted && requestPermission && permissions.canAskAgain) {
        permissions = await Notifications.requestPermissionsAsync()
      }
      const granted = permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      if (epoch !== registrationEpoch || auth.currentUser?.uid !== userId) return
      if (!granted) { await saveDevice(userId, false, await AsyncStorage.getItem('@mojammaa/push-token-v1') || undefined); return }
      const projectId = getExpoProjectId()
      if (!projectId) throw new Error('missing-project')
      const token = (await bounded(Notifications.getExpoPushTokenAsync({ projectId }))).data
      if (epoch !== registrationEpoch || auth.currentUser?.uid !== userId) return
      await saveDevice(userId, true, token)
    } catch {
      // A permission alone does not prove that the server registered this phone.
      await AsyncStorage.setItem('@mojammaa/push-state-v1', JSON.stringify({ uid: userId, registered: false }))
    }
  }
  registrationQueue = registrationQueue.catch(() => {}).then(operation)
  await registrationQueue
}

export async function notificationDiagnostics(): Promise<'enabled' | 'disabled' | 'unregistered' | 'unsupported'> {
  if (Platform.OS === 'web') return 'unsupported'
  const permission = await Notifications.getPermissionsAsync()
  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) return 'disabled'
  if (Platform.OS === 'android') {
    const channel = await Notifications.getNotificationChannelAsync('default')
    if (channel?.importance === Notifications.AndroidImportance.NONE) return 'disabled'
  }
  const raw = await AsyncStorage.getItem('@mojammaa/push-state-v1')
  const state: DeviceState | null = raw ? JSON.parse(raw) : null
  return state?.uid === auth.currentUser?.uid && state?.registered ? 'enabled' : 'unregistered'
}

export async function syncNotificationLanguage(lang: AppLanguage) {
  const uid = auth.currentUser?.uid
  if (!uid) return
  try {
    void setDoc(doc(db, 'users', uid), { notificationLanguage: lang, notificationLanguageUpdatedAt: serverTimestamp() }, { merge: true }).catch(() => {})
    await registerForPushNotificationsAsync(uid, false)
  } catch { /* Retried when the app becomes active. */ }
}

export function startNotificationSync(uid: string) {
  stoppingUid = null
  const refresh = () => { void registerForPushNotificationsAsync(uid, false).catch(() => {}) }
  const appState = AppState.addEventListener('change', state => { if (state === 'active') refresh() })
  const tokenListener = Platform.OS !== 'web' ? Notifications.addPushTokenListener(refresh) : null
  return () => { appState.remove(); tokenListener?.remove() }
}
