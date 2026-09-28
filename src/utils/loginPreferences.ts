import AsyncStorage from '@react-native-async-storage/async-storage'

// Mode et pays mémorisés : les parents retrouvent « Téléphone » et leur pays,
// le personnel « E-mail », sans rien rechoisir.
export type LoginMode = 'phone' | 'email'
export const LOGIN_MODE_KEY = '@mojammaa/login/mode'
export const LOGIN_COUNTRY_KEY = '@mojammaa/login/phoneCountry'

/** Mémorise l'identifiant réellement utilisable, p. ex. juste après une activation. */
export function rememberLoginMode(mode: LoginMode, phoneCountryIso?: string): void {
  AsyncStorage.multiSet([
    [LOGIN_MODE_KEY, mode],
    ...(phoneCountryIso ? [[LOGIN_COUNTRY_KEY, phoneCountryIso] as [string, string]] : []),
  ]).catch(() => {})
}
