/**
 * AuthContext — détecte l'utilisateur connecté et son rôle.
 *
 * Stratégie de fallback :
 *   - Pas de doc Firestore       → role 'student' (parent par défaut, c'est
 *     l'usage le plus large et le moins privilégié)
 *   - role inconnu                → 'student'
 *   - role: 'parent'              → 'student' (parent voit les données enfant)
 *   - role: 'professeur'          → 'teacher'
 *   - role: 'admin'               → 'admin'
 *
 * Le profil est suivi en TEMPS RÉEL (onSnapshot sur users/{uid}) tant que
 * l'utilisateur est connecté :
 *   - doc supprimé en cours de session (offboarding) → déconnexion immédiate
 *   - rôle modifié (rétrogradation) → prise en compte sans redémarrage
 *   - erreur de lecture (offline/permission) → session conservée + profileError
 *
 * Le composant exporte { user, profile, role, isLoading, profileError, logout, refresh }.
 */

import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback, useMemo,
} from 'react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../config/firebase'
import type { RoleLogic, RoleRaw, UserProfile } from '../types'
import { registerForPushNotificationsAsync, clearPushToken } from '../services/NotificationService'

function rawToLogic(raw: RoleRaw | string | undefined): RoleLogic {
  if (raw === 'admin') return 'admin'
  if (raw === 'professeur' || raw === 'teacher') return 'teacher'
  return 'student' // 'parent', 'student' ou rien → student
}

interface AuthContextValue {
  user:         User | null
  profile:      UserProfile | null
  role:         RoleLogic
  isLoading:    boolean
  // true quand la lecture du profil a ÉCHOUÉ (offline/permission) : on garde la
  // session, mais l'UI peut distinguer « pas de profil par erreur » de « profil
  // réellement parent » et éviter d'afficher l'espace parent à un prof/admin.
  profileError: boolean
  logout:       () => Promise<void>
  refresh:      () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  role: 'student',
  isLoading: true,
  profileError: false,
  logout: async () => {},
  refresh: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,         setUser]         = useState<User | null>(null)
  const [profile,      setProfile]      = useState<UserProfile | null>(null)
  const [isLoading,    setIsLoading]    = useState(true)
  const [profileError, setProfileError] = useState(false)

  // unsub du listener temps réel sur users/{uid} (un seul actif à la fois).
  const profileUnsubRef = useRef<null | (() => void)>(null)
  // Le token push n'est enregistré qu'au PREMIER chargement réussi du profil,
  // pas à chaque mise à jour temps réel → évite le spam d'enregistrement.
  const pushRegisteredRef = useRef(false)

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, fbUser => {
      // Tout changement d'état auth invalide le listener de profil précédent.
      if (profileUnsubRef.current) { profileUnsubRef.current(); profileUnsubRef.current = null }

      if (!fbUser) {
        pushRegisteredRef.current = false
        setUser(null)
        setProfile(null)
        setProfileError(false)
        setIsLoading(false)
        return
      }

      // Nouvel utilisateur authentifié : on ré-arme le gate (le rôle est inconnu
      // tant que le doc users/{uid} n'est pas arrivé — éviter le flash de l'UI
      // parent affichée à tort à un prof/admin juste après le login).
      setIsLoading(true)
      setProfileError(false)
      pushRegisteredRef.current = false
      let first = true

      profileUnsubRef.current = onSnapshot(
        doc(db, 'users', fbUser.uid),
        snap => {
          if (!snap.exists()) {
            // Pas (ou PLUS) de doc users/{uid} : compte non provisionné, ou
            // désactivé/supprimé en cours de session (offboarding). On déconnecte
            // et on renvoie au login, au lieu d'afficher à tort l'espace parent.
            setProfile(null)
            setUser(null)
            if (profileUnsubRef.current) { profileUnsubRef.current(); profileUnsubRef.current = null }
            // signOut relance onAuthStateChanged (branche null) qui remet isLoading=false.
            signOut(auth).catch(() => setIsLoading(false))
            return
          }
          // Doc présent : profil exposé / mis à jour en temps réel. Une
          // rétrogradation de rôle prend ainsi effet immédiatement.
          setProfile({ uid: fbUser.uid, ...snap.data() } as UserProfile)
          setProfileError(false)
          setUser(fbUser)
          if (!pushRegisteredRef.current) {
            pushRegisteredRef.current = true
            registerForPushNotificationsAsync(fbUser.uid)
          }
          if (first) { first = false; setIsLoading(false) }
        },
        () => {
          // Erreur de lecture (offline/permission) : on NE déconnecte PAS — la
          // session est conservée. On signale l'erreur pour que l'UI ne suppose
          // pas « parent » par défaut. Firestore termine le listener ici.
          profileUnsubRef.current = null
          setProfileError(true)
          setUser(fbUser)
          if (first) { first = false; setIsLoading(false) }
        },
      )
    })

    return () => {
      unsubAuth()
      if (profileUnsubRef.current) { profileUnsubRef.current(); profileUnsubRef.current = null }
    }
  }, [])

  const logout = useCallback(async () => {
    // Clear the push token first so the next user on this device does not
    // receive notifications meant for the previous account.
    if (user?.uid) {
      try { await clearPushToken(user.uid) } catch {}
    }
    await signOut(auth)
  }, [user])

  // Relecture manuelle ponctuelle (one-shot). Le profil est déjà suivi en
  // temps réel, mais refresh() reste utile pour forcer une relecture après une
  // écriture locale immédiate.
  const refresh = useCallback(async () => {
    if (!user) return
    try {
      const snap = await getDoc(doc(db, 'users', user.uid))
      if (snap.exists()) {
        setProfile({ uid: user.uid, ...snap.data() } as UserProfile)
        setProfileError(false)
      } else {
        setProfile(null)
      }
    } catch {
      setProfileError(true)
    }
  }, [user])

  const role = useMemo<RoleLogic>(() => rawToLogic(profile?.role), [profile])

  const value = useMemo(
    () => ({ user, profile, role, isLoading, profileError, logout, refresh }),
    [user, profile, role, isLoading, profileError, logout, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
