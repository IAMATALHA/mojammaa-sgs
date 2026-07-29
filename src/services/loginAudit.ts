import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../config/firebase'

/**
 * Signale la connexion au serveur : IP (relevée côté serveur) + appareil.
 *
 * Le modèle réel vient de `Platform.constants`, déjà fourni par React Native —
 * pas besoin d'`expo-device` (module natif = nouveau build EAS, pas d'OTA).
 * Asymétrie assumée entre les plateformes : Android expose marque et modèle,
 * iOS ne les publie pas et on n'a que l'idiome (`phone` / `pad`).
 */

type AndroidConstants = { Brand?: string; Model?: string; Release?: string }
type IosConstants = { interfaceIdiom?: string; osVersion?: string }

function describeDevice() {
  const appVersion = Constants.expoConfig?.version ?? undefined

  if (Platform.OS === 'android') {
    const c = Platform.constants as AndroidConstants
    return {
      platform: 'android',
      osVersion: c.Release,
      brand: c.Brand,
      model: c.Model,
      appVersion,
    }
  }

  if (Platform.OS === 'ios') {
    const c = Platform.constants as IosConstants
    return {
      platform: 'ios',
      osVersion: c.osVersion,
      idiom: c.interfaceIdiom,
      appVersion,
    }
  }

  return { platform: Platform.OS, appVersion }
}

/**
 * À appeler après un sign-in réussi. Ne rejette jamais : journaliser une
 * connexion ne doit pas pouvoir faire échouer la connexion elle-même.
 */
export async function recordLoginDevice(): Promise<void> {
  try {
    const call = httpsCallable(functions, 'recordLoginDevice')
    await call(describeDevice())
  } catch {
    // Réseau coupé, fonction non déployée, quota : sans effet sur la session.
  }
}
