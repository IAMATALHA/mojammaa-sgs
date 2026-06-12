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
 * Le composant exporte { user, profile, role, isLoading, logout, refresh }.
 */

import React, {
  createContext, useContext, useEffect, useState, useCallback, useMemo,
} from 'react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../config/firebase'
import type { RoleLogic, RoleRaw, UserProfile } from '../types'
import { registerForPushNotificationsAsync, clearPushToken } from '../services/NotificationService'

function rawToLogic(raw: RoleRaw | string | undefined): RoleLogic {
  if (raw === 'admin') return 'admin'
  if (raw === 'professeur' || raw === 'teacher') return 'teacher'
  return 'student' // 'parent', 'student' ou rien → student
}

interface AuthContextValue {
  user:      User | null
  profile:   UserProfile | null
  role:      RoleLogic
  isLoading: boolean
  logout:    () => Promise<void>
  refresh:   () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  role: 'student',
  isLoading: true,
  logout: async () => {},
  refresh: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null)
  const [profile,   setProfile]   = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchProfile = useCallback(async (firebaseUser: User) => {
    try {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
      if (snap.exists()) {
        setProfile({ uid: firebaseUser.uid, ...snap.data() } as UserProfile)
      } else {
        setProfile(null)
      }
      // Attempt to register for push notifications
      registerForPushNotificationsAsync(firebaseUser.uid)
    } catch {
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fbUser => {
      if (fbUser) {
        // Re-raise the gate before exposing the user: role is unknown until
        // the profile doc arrives, and rendering with the 'student' fallback
        // flashes the parent UI to teachers/admins right after login.
        setIsLoading(true)
        setUser(fbUser)
        await fetchProfile(fbUser)
      } else {
        setUser(null)
        setProfile(null)
      }
      setIsLoading(false)
    })
    return unsub
  }, [fetchProfile])

  const logout = useCallback(async () => {
    // Clear the push token first so the next user on this device does not
    // receive notifications meant for the previous account.
    if (user?.uid) {
      try { await clearPushToken(user.uid) } catch {}
    }
    await signOut(auth)
  }, [user])

  const refresh = useCallback(async () => {
    if (user) await fetchProfile(user)
  }, [user, fetchProfile])

  const role = useMemo<RoleLogic>(() => rawToLogic(profile?.role), [profile])

  const value = useMemo(
    () => ({ user, profile, role, isLoading, logout, refresh }),
    [user, profile, role, isLoading, logout, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
