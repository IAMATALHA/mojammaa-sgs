import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getLocales } from 'expo-localization'
import { I18nManager } from 'react-native'
import fr from './locales/fr'
import ar from './locales/ar'
import en from './locales/en'

const LANG_KEY = '@mojammaa_lang'

export type AppLanguage = 'fr' | 'ar' | 'en'

const resources = {
  fr: { translation: fr },
  ar: { translation: ar },
  en: { translation: en },
}

function detectDeviceLanguage(): AppLanguage {
  try {
    const locales = getLocales()
    const code = locales[0]?.languageCode ?? 'fr'
    if (code === 'ar') return 'ar'
    if (code === 'en') return 'en'
    return 'fr'
  } catch {
    return 'fr'
  }
}

export async function getStoredLanguage(): Promise<AppLanguage | null> {
  try {
    const val = await AsyncStorage.getItem(LANG_KEY)
    if (val === 'fr' || val === 'ar' || val === 'en') return val
    return null
  } catch {
    return null
  }
}

export async function storeLanguage(lang: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(LANG_KEY, lang)
}

export function applyRTL(_lang: AppLanguage) {
  // RTL disabled for now — layout stays LTR even in Arabic.
  // Phase 2 post-launch: enable RTL with proper layout adjustments.
  if (I18nManager.isRTL) {
    I18nManager.allowRTL(false)
    I18nManager.forceRTL(false)
  }
}

export async function initI18n(): Promise<void> {
  const stored = await getStoredLanguage()
  const lang = stored ?? detectDeviceLanguage()

  applyRTL(lang)

  await i18n.use(initReactI18next).init({
    resources,
    lng: lang,
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  })
}

export async function changeLanguage(lang: AppLanguage): Promise<void> {
  await storeLanguage(lang)
  applyRTL(lang)
  await i18n.changeLanguage(lang)
}

export default i18n
