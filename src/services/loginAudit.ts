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

type AndroidConstants = {
  Brand?: string
  Manufacturer?: string
  Model?: string
  Release?: string
}
type IosConstants = { interfaceIdiom?: string; osVersion?: string }

function describeDevice() {
  const appVersion = Constants.expoConfig?.version ?? undefined

  if (Platform.OS === 'android') {
    const c = Platform.constants as AndroidConstants
    return {
      platform: 'android',
      osVersion: c.Release,
      // `Brand` est la marque commerciale (`Redmi`, `Poco`), `Manufacturer` le
      // constructeur (`Xiaomi`) — souvent differents, on envoie les deux.
      brand: c.Brand,
      manufacturer: c.Manufacturer,
      model: c.Model,
      appVersion,
    }
  }

  if (Platform.OS === 'ios') {
    const c = Platform.constants as IosConstants
    return {
      platform: 'ios',
      osVersion: c.osVersion,
      // Pas une supposition : tout appareil sous iOS est fabrique par Apple.
      // Apple n'expose pas le modele au JS — `Constants.platform.ios.model`
      // le donnerait ("iPhone 7 Plus") mais il est deprecie et vaut `null`
      // dans la plupart des builds de production, d'ou le repli sur l'idiome.
      brand: 'Apple',
      idiom: c.interfaceIdiom,
      appVersion,
    }
  }

  return { platform: Platform.OS, appVersion }
}

/**
 * Appelé par AuthContext dès qu'une session est établie — aussi bien après une
 * saisie d'identifiants qu'à la reprise d'une session existante au démarrage
 * de l'app. C'est ce second cas qui compte en pratique : les sessions Firebase
 * persistent, donc un journal branché sur le seul écran de login resterait
 * quasi vide pendant des semaines.
 *
 * Ne rejette jamais : journaliser une session ne doit pas pouvoir faire
 * échouer la session elle-même.
 */
export async function recordLoginDevice(): Promise<void> {
  try {
    const call = httpsCallable(functions, 'recordLoginDevice')
    await call(describeDevice())
  } catch {
    // Réseau coupé, fonction non déployée, quota : sans effet sur la session.
  }
}
