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
 *
 * Chaque lien reçu est une intention : rien n'est filtré ici. C'est l'activité
 * Android qui retire le lien d'un lancement rejoué (tâche rouverte depuis les
 * applications récentes, processus relancé) et qui garde celui touché avant
 * que React soit prêt — voir plugins/with-launch-link-intent.js.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'
import { navigationRef } from '../navigation/navigationRef'
import { authRoutesForLink, parseActivationLink, type ActivationLink } from '../utils/activation-link'
import { createLatestOnly } from '../utils/latest-only'

/** `at` : rang de l'intention, pour repartir d'une feuille neuve à chaque lien. */
export type ChildLink = { code: string; at: number }

interface Options {
  signedIn: boolean
  /** Navigation montée et session connue. */
  ready: boolean
  logout: () => Promise<void>
}

export function useActivationLink({ signedIn, ready, logout }: Options) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<ActivationLink | null>(null)
  // Lien parent proposé dans « Ajouter un enfant », et feuille ouverte ou non.
  const [child, setChild] = useState<ChildLink | null>(null)
  const [childOpen, setChildOpen] = useState(false)
  const intents = useRef(createLatestOnly()).current
  const intentCount = useRef(0)
  const asking = useRef(false)

  // Application déjà ouverte : chaque appui sur un lien est une intention, et
  // elle périme la lecture du lien de lancement si celle-ci n'a pas fini.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const link = parseActivationLink(url)
      if (!link) return
      intents.cancel()
      setPending(link)
    })
    return () => subscription.remove()
  }, [intents])

  // Démarrage par un lien.
  useEffect(() => {
    const latest = intents.begin()
    Linking.getInitialURL()
      .then(url => {
        const link = parseActivationLink(url)
        if (link && latest()) setPending(link)
      })
      .catch(() => {})
    return () => intents.cancel()
  }, [intents])

  // Session fermée : plus de feuille, plus de question en cours.
  useEffect(() => {
    if (signedIn) return
    setChildOpen(false)
    asking.current = false
  }, [signedIn])

  useEffect(() => {
    if (!pending || !ready) return
    if (!signedIn) {
      // Seul ce cas navigue : la pile de connexion doit être montée.
      if (!navigationRef.isReady()) return
      navigationRef.reset(authRoutesForLink(navigationRef.getRootState()?.routes, pending))
      setPending(null)
      return
    }
    if (pending.kind === 'parent') {
      intentCount.current += 1
      setChild({ code: pending.code, at: intentCount.current })
      setChildOpen(true)
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

  const dismissChild = useCallback(() => {
    // Une fermeture animée / alerte de la feuille précédente peut finir après
    // l'arrivée d'un autre lien : elle ne doit pas fermer la nouvelle feuille.
    if (child?.at === intentCount.current) setChildOpen(false)
  }, [child])

  return { child, childOpen, dismissChild }
}
