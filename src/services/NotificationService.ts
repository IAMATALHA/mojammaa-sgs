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
  // Aucun compte connecté : une notification encore adressée à l'ancien compte
  // (coupure différée après une déconnexion hors ligne) ne s'affiche pas dans
  // l'app (audit 2026-09-28, F9).
  handleNotification: async () => {
    const visible = !!auth.currentUser;
    return {
      shouldPlaySound: visible,
      shouldShowBanner: visible,
      shouldShowList: visible,
      shouldSetBadge: false,
    };
  },
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
// Dernier enregistrement confirmé par le serveur : un envoi identique (même
// compte, même jeton, même langue) n'est répété qu'après ce délai.
const REREGISTER_AFTER_MS = 10 * 60_000
let lastRegistration: { key: string; at: number } | null = null
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

// Clé de libération remise par le serveur à chaque activation, et coupure en
// attente après une déconnexion hors ligne (audit 2026-09-28, F9).
const RELEASE_KEY = '@mojammaa/push-release-key-v1'
const PENDING_RELEASE = '@mojammaa/push-release-pending-v1'
type PendingRelease = { deviceId: string; revision: number; releaseKey: string }

async function nextRevision(): Promise<number> {
  const previousRevision = Number(await AsyncStorage.getItem('@mojammaa/push-revision-v1') || 0)
  if (!Number.isSafeInteger(previousRevision) || previousRevision < 0) throw new Error('invalid-device-revision')
  const revision = previousRevision + 1
  await AsyncStorage.setItem('@mojammaa/push-revision-v1', String(revision))
  return revision
}

async function saveDevice(userId: string, enabled: boolean, token?: string) {
  const deviceId = await installationId()
  if (token) await AsyncStorage.setItem('@mojammaa/push-token-v1', token)
  const revision = await nextRevision()
  const result = await httpsCallable<unknown, { applied: boolean; releaseKey?: string }>(functions, 'registerPushDevice', { timeout: 10_000 })({
    deviceId, revision, enabled, ...(token ? { token } : {}),
    platform: Platform.OS, language: notificationLanguage(i18n.language),
  })
  if (typeof result.data.releaseKey === 'string') await AsyncStorage.setItem(RELEASE_KEY, result.data.releaseKey)
  const applied = result.data.applied !== false
  await AsyncStorage.setItem('@mojammaa/push-state-v1', JSON.stringify({ uid: userId, registered: enabled && applied }))
  return applied
}

export async function clearPushToken(userId: string) {
  stoppingUid = userId
  registrationEpoch++
  lastRegistration = null
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

/**
 * Déconnexion : coupe les notifications du compte avant la fermeture de la
 * session quand c'est possible. Hors ligne ou service indisponible, ne bloque
 * jamais la déconnexion : la coupure est mise en attente et rejouée sans
 * session, avec la clé de libération de ce téléphone (audit 2026-09-28, F9).
 */
export async function stopPushForLogout(userId: string): Promise<'cleared' | 'deferred'> {
  try {
    await bounded(clearPushToken(userId), 8_000)
    return 'cleared'
  } catch {
    try {
      const releaseKey = await AsyncStorage.getItem(RELEASE_KEY)
      // Installation jamais réenregistrée depuis cette version : pas de clé,
      // l'installation passera au prochain compte connecté sur ce téléphone.
      if (releaseKey) {
        const pending: PendingRelease = { deviceId: await installationId(), revision: await nextRevision(), releaseKey }
        await AsyncStorage.setItem(PENDING_RELEASE, JSON.stringify(pending))
      }
    } catch { /* Le stockage local ne doit pas empêcher la déconnexion. */ }
    return 'deferred'
  }
}

/** Rejoue une coupure en attente ; conservée seulement si le réseau manque. */
export async function retryPendingPushRelease(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_RELEASE)
    if (!raw) return
    const pending = JSON.parse(raw) as PendingRelease
    try {
      await httpsCallable(functions, 'registerPushDevice', { timeout: 10_000 })({
        deviceId: pending.deviceId, revision: pending.revision, releaseKey: pending.releaseKey, enabled: false,
      })
    } catch (error) {
      const code = (error as { code?: unknown })?.code
      // Clé refusée ou demande invalide : la rejouer ne changera rien.
      if (code !== 'functions/permission-denied' && code !== 'functions/invalid-argument') return
    }
    await AsyncStorage.removeItem(PENDING_RELEASE)
  } catch { /* Nouvel essai au prochain retour au premier plan. */ }
}

/** Relance la coupure en attente à chaque retour de l'app au premier plan. */
export function startPendingPushReleaseRetry() {
  void retryPendingPushRelease()
  const appState = AppState.addEventListener('change', state => { if (state === 'active') void retryPendingPushRelease() })
  return () => appState.remove()
}

/**
 * `force` ignore le cache de 10 min : réservé au bouton « Actualiser », une
 * action explicite de l'utilisateur qui doit toujours interroger le serveur.
 */
export async function registerForPushNotificationsAsync(userId: string, requestPermission = true, { force = false } = {}): Promise<void> {
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
      if (!granted) {
        lastRegistration = null
        await saveDevice(userId, false, await AsyncStorage.getItem('@mojammaa/push-token-v1') || undefined)
        return
      }
      const projectId = getExpoProjectId()
      if (!projectId) throw new Error('missing-project')
      const token = (await bounded(Notifications.getExpoPushTokenAsync({ projectId }))).data
      if (epoch !== registrationEpoch || auth.currentUser?.uid !== userId) return
      const key = JSON.stringify([userId, token, notificationLanguage(i18n.language)])
      if (!force && lastRegistration?.key === key && Date.now() - lastRegistration.at < REREGISTER_AFTER_MS) return
      const applied = await saveDevice(userId, true, token)
      // Une déconnexion pendant l'appel (epoch changé) a déjà vidé le cache :
      // ne pas le réécrire, sinon la reconnexion suivante serait ignorée. Un
      // enregistrement refusé par le serveur invalide aussi un cache antérieur,
      // pour que l'essai suivant repasse par le serveur.
      lastRegistration = applied && epoch === registrationEpoch ? { key, at: Date.now() } : null
    } catch {
      // Tout échec invalide le cache : l'essai suivant repasse par le serveur
      // et rétablit l'état local.
      lastRegistration = null
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
  // Android émet cet événement à CHAQUE lecture du jeton, y compris celle que
  // fait getExpoPushTokenAsync pendant l'enregistrement : y réagir relançait
  // l'enregistrement sans fin (≈ 2 appels/s depuis un seul téléphone, constaté
  // en production le 28/09). Seul un jeton réellement nouveau relance.
  let lastDeviceToken: string | null = null
  const tokenListener = Platform.OS !== 'web' ? Notifications.addPushTokenListener(event => {
    const deviceToken = typeof event?.data === 'string' ? event.data : null
    if (deviceToken && deviceToken === lastDeviceToken) return
    lastDeviceToken = deviceToken
    refresh()
  }) : null
  return () => { appState.remove(); tokenListener?.remove() }
}
