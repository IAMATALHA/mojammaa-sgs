/**
 * useActivationLink — ouvre le bon écran quand un lien d'activation
 * (mojammaa.com/activer#CODE, mojammaa.com/parents/activer#CODE) lance ou
 * réveille l'application (Android App Links, build 1.0.18 et suivants).
 *
 * Déconnecté : écran d'activation, code déjà rempli. Connecté, lien parent :
 * feuille « Ajouter un enfant » préremplie, JAMAIS envoyée d'office (le
 * téléphone de la direction, qui prépare les liens, se rattacherait l'élève en
 * touchant le sien). Connecté, lien professeur : on propose de se déconnecter,
 * puis l'activation s'ouvre avec le code.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { navigationRef } from '../navigation/navigationRef'
import { parseActivationLink, type ActivationLink } from '../utils/activation-link'

const LAUNCH_LINK_KEY = '@mojammaa/activationLink/launch'

/** Empreinte courte : le code d'activation n'est pas conservé en clair. */
function fingerprint(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  return String(hash)
}

/** `replayed` : lien de lancement déjà traité à un démarrage précédent. */
type PendingLink = ActivationLink & { replayed: boolean }

interface Options {
  signedIn: boolean
  /** Navigation montée et session connue. */
  ready: boolean
  logout: () => Promise<void>
}

export function useActivationLink({ signedIn, ready, logout }: Options) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<PendingLink | null>(null)
  // Code à proposer dans « Ajouter un enfant » (`null` : feuille fermée).
  const [childCode, setChildCode] = useState<string | null>(null)
  const asking = useRef(false)

  // Application déjà ouverte : chaque appui sur un lien est une intention.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const link = parseActivationLink(url)
      if (link) setPending({ ...link, replayed: false })
    })
    return () => subscription.remove()
  }, [])

  // Démarrage à froid. Sur Android, l'intent de lancement reste attaché à la
  // tâche : rouverte depuis les applications récentes après l'arrêt du
  // processus, l'app REÇOIT de nouveau le même lien (même piège que les
  // notifications, cf. usePushTapNavigation). On note donc le lien traité.
  useEffect(() => {
    let cancelled = false
    const readLaunchLink = async () => {
      const url = await Linking.getInitialURL()
      const link = parseActivationLink(url)
      if (!url || !link) return
      const mark = fingerprint(url)
      const previous = await AsyncStorage.getItem(LAUNCH_LINK_KEY).catch(() => null)
      AsyncStorage.setItem(LAUNCH_LINK_KEY, mark).catch(() => {})
      if (!cancelled) setPending({ ...link, replayed: previous === mark })
    }
    readLaunchLink().catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!signedIn) setChildCode(null)
  }, [signedIn])

  useEffect(() => {
    if (!pending || !ready || !navigationRef.isReady()) return
    if (!signedIn) {
      // Déconnecté, un lien rejoué reste utile : c'est aussi le parent qui
      // retouche son lien après avoir fermé l'application sans finir.
      asking.current = false
      navigationRef.navigate(
        pending.kind === 'parent' ? 'ParentActivation' : 'AccountActivation',
        { code: pending.code, linkAt: Date.now() },
      )
      setPending(null)
      return
    }
    // Connecté : un vieux lien rejoué n'est pas une intention.
    if (pending.replayed) { setPending(null); return }
    if (pending.kind === 'parent') {
      setChildCode(pending.code)
      setPending(null)
      return
    }
    if (asking.current) return
    asking.current = true
    Alert.alert(
      t('activationLink.signedInTitle'),
      t('activationLink.signedInBody'),
      [
        { text: t('activationLink.stay'), style: 'cancel', onPress: () => { asking.current = false; setPending(null) } },
        // Le lien reste en attente : l'activation s'ouvre une fois déconnecté.
        { text: t('common.logout'), onPress: () => { logout().catch(() => { asking.current = false; setPending(null) }) } },
      ],
      { cancelable: false },
    )
  }, [pending, ready, signedIn, logout, t])

  const dismissChild = useCallback(() => setChildCode(null), [])

  return { childCode, dismissChild }
}
