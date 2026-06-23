/**
 * Firebase config — partagé avec mojammaa-admin (web) et mojammaa-parent.
 * Tous les rôles (élève/parent, prof, admin) pointent sur le même projet
 * Firestore. La séparation des données se fait par les Firestore rules,
 * dont la source de vérité est ICI : firestore.rules de CE repo
 * (déployer UNIQUEMENT depuis ce repo — jamais depuis mojammaa-admin).
 *
 * Auth persistence : sans setup explicite, Firebase Web SDK en React Native
 * perd la session à chaque cold start. On câble AsyncStorage via
 * initializeAuth + getReactNativePersistence. Le require() dynamique
 * contourne le fait que getReactNativePersistence n'est pas exposé dans
 * les types TS de firebase/auth en v12 mais reste accessible au runtime.
 */
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, initializeAuth, type Auth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const firebaseConfig = {
  apiKey: 'AIzaSyCCULKNSmhrLStX8eEeUZF83Fu89uQJBB4',
  authDomain: 'mojammaa-sgs.firebaseapp.com',
  projectId: 'mojammaa-sgs',
  storageBucket: 'mojammaa-sgs.firebasestorage.app',
  messagingSenderId: '21853485219',
  appId: '1:21853485219:web:8e1689fc7a782173882716',
  measurementId: 'G-54FCH6WS1J',
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

let auth: Auth
try {
  // firebase/auth expose getReactNativePersistence au runtime mais pas
  // dans ses .d.ts en v12 — d'où le require().
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getReactNativePersistence } = require('firebase/auth') as {
    getReactNativePersistence: (s: typeof AsyncStorage) => any
  }
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
} catch (e: any) {
  // Cas BÉNIN attendu : re-initialisation (fast refresh) ou plateforme web —
  // Firebase lève alors 'auth/already-initialized'. On récupère silencieusement
  // le singleton déjà câblé (persistance conservée).
  // Cas RÉEL : tout autre échec dégrade la persistance (session perdue à chaque
  // cold start) — on le LOGUE pour ne pas le rendre invisible, puis on retombe
  // sur getAuth pour que l'app boot quand même.
  if (e?.code !== 'auth/already-initialized') {
    console.warn('[firebase] initializeAuth a échoué — persistance dégradée:', e)
  }
  auth = getAuth(app)
}

export { app, auth }
export const db      = getFirestore(app)
export const storage = getStorage(app)
// Functions colocalisées en europe-west1 (cf. functions/index.js setGlobalOptions).
export const functions = getFunctions(app, 'europe-west1')
