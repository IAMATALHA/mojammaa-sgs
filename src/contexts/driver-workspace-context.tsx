import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { subscribeDriverProfile } from '../services/pickup-service'
import { subscribeChildrenOfParent } from '../services/elevesService'
import type { DriverProfile } from '../types/pickup'

export type AppWorkspace = 'primary' | 'driver' | 'parent'

export interface WorkspaceValue {
  driverProfile: DriverProfile | null
  canUseDriverWorkspace: boolean
  canUseParentWorkspace: boolean
  linkedChildrenCount: number
  activeWorkspace: AppWorkspace
  /** Chargement du profil chauffeur uniquement (API historique). */
  isLoading: boolean
  /** Erreur du profil chauffeur uniquement (API historique). */
  error: string | null
  isParentWorkspaceLoading: boolean
  parentWorkspaceError: string | null
  openDriverWorkspace: () => void
  openParentWorkspace: () => void
  openPrimaryWorkspace: () => void
  retryDriverProfile: () => void
  retryParentWorkspace: () => void
}

const WorkspaceContext = createContext<WorkspaceValue>({
  driverProfile: null,
  canUseDriverWorkspace: false,
  canUseParentWorkspace: false,
  linkedChildrenCount: 0,
  activeWorkspace: 'primary',
  isLoading: false,
  error: null,
  isParentWorkspaceLoading: false,
  parentWorkspaceError: null,
  openDriverWorkspace: () => {},
  openParentWorkspace: () => {},
  openPrimaryWorkspace: () => {},
  retryDriverProfile: () => {},
  retryParentWorkspace: () => {},
})

/**
 * Sépare le rôle scolaire principal des capacités additionnelles chauffeur et
 * parent. La capacité parent est prouvée par le lien vivant
 * `eleves.parentUid == auth.uid` : aucun second compte ni rôle dupliqué.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth()
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null)
  const [linkedChildrenCount, setLinkedChildrenCount] = useState(0)
  const [requestedWorkspace, setRequestedWorkspace] = useState<AppWorkspace>('primary')
  const [driverResolvedUid, setDriverResolvedUid] = useState<string | null>(null)
  const [parentResolvedUid, setParentResolvedUid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parentWorkspaceError, setParentWorkspaceError] = useState<string | null>(null)
  const [driverRetryVersion, setDriverRetryVersion] = useState(0)
  const [parentRetryVersion, setParentRetryVersion] = useState(0)

  // Un changement de session invalide toutes les capacités de l'ancien compte.
  useEffect(() => {
    setRequestedWorkspace('primary')
    setDriverProfile(null)
    setLinkedChildrenCount(0)
    setError(null)
    setParentWorkspaceError(null)
    setDriverResolvedUid(null)
    setParentResolvedUid(null)
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) {
      return
    }

    setDriverResolvedUid(null)
    setError(null)
    return subscribeDriverProfile(
      user.uid,
      profile => {
        setDriverProfile(profile)
        setError(null)
        setDriverResolvedUid(user.uid)
        if (!profile?.active) setRequestedWorkspace('primary')
      },
      err => {
        setDriverProfile(null)
        setError(err.message)
        setDriverResolvedUid(user.uid)
        setRequestedWorkspace('primary')
      },
    )
  }, [user?.uid, driverRetryVersion])

  useEffect(() => {
    if (!user?.uid) {
      return
    }

    setParentResolvedUid(null)
    setParentWorkspaceError(null)
    return subscribeChildrenOfParent(
      user.uid,
      children => {
        setLinkedChildrenCount(children.length)
        setParentWorkspaceError(null)
        setParentResolvedUid(user.uid)
        if (children.length === 0) {
          setRequestedWorkspace(current => current === 'parent' ? 'primary' : current)
        }
      },
      err => {
        // Échec fermé pour les données enfant, mais jamais bloquant pour
        // l'espace professionnel principal.
        setLinkedChildrenCount(0)
        setParentWorkspaceError(err.message)
        setParentResolvedUid(user.uid)
        setRequestedWorkspace(current => current === 'parent' ? 'primary' : current)
      },
    )
  }, [user?.uid, parentRetryVersion])

  // Une valeur reçue pour l'utilisateur précédent ne doit jamais ouvrir un
  // espace pendant la transition de session.
  const currentDriverProfile = user?.uid && driverResolvedUid === user.uid
    ? driverProfile
    : null
  const currentLinkedChildrenCount = user?.uid && parentResolvedUid === user.uid
    ? linkedChildrenCount
    : 0
  const canUseDriverWorkspace = currentDriverProfile?.active === true
  // Les comptes parent/student conservent leur espace historique même sans
  // enfant lié. Pour un professionnel, seul le lien enfant vivant ouvre cet
  // espace additionnel.
  const canUseParentWorkspace = role === 'student' || currentLinkedChildrenCount > 0
  const isLoading = Boolean(user?.uid && driverResolvedUid !== user.uid)
  const isParentWorkspaceLoading = Boolean(user?.uid && parentResolvedUid !== user.uid)

  let activeWorkspace: AppWorkspace = 'primary'
  if (requestedWorkspace === 'parent' && canUseParentWorkspace) {
    activeWorkspace = 'parent'
  } else if (role === 'driver') {
    // Le rôle chauffeur utilise son stack chauffeur comme espace principal.
    // Si cette capacité est révoquée mais qu'un lien enfant valide existe,
    // l'accès parent reste disponible au lieu de déconnecter la famille.
    activeWorkspace = canUseDriverWorkspace
      ? 'driver'
      : currentLinkedChildrenCount > 0
        ? 'parent'
        : 'primary'
  } else if (requestedWorkspace === 'driver' && canUseDriverWorkspace) {
    activeWorkspace = 'driver'
  }

  const openDriverWorkspace = useCallback(() => {
    if (currentDriverProfile?.active) setRequestedWorkspace('driver')
  }, [currentDriverProfile?.active])

  const openParentWorkspace = useCallback(() => {
    if (role === 'student' || currentLinkedChildrenCount > 0) {
      setRequestedWorkspace('parent')
    }
  }, [role, currentLinkedChildrenCount])

  const openPrimaryWorkspace = useCallback(() => {
    setRequestedWorkspace('primary')
  }, [])

  const retryDriverProfile = useCallback(() => {
    setDriverResolvedUid(null)
    setError(null)
    setDriverRetryVersion(version => version + 1)
  }, [])

  const retryParentWorkspace = useCallback(() => {
    setParentResolvedUid(null)
    setParentWorkspaceError(null)
    setParentRetryVersion(version => version + 1)
  }, [])

  const value = useMemo<WorkspaceValue>(() => ({
    driverProfile: currentDriverProfile,
    canUseDriverWorkspace,
    canUseParentWorkspace,
    linkedChildrenCount: currentLinkedChildrenCount,
    activeWorkspace,
    isLoading,
    error,
    isParentWorkspaceLoading,
    parentWorkspaceError,
    openDriverWorkspace,
    openParentWorkspace,
    openPrimaryWorkspace,
    retryDriverProfile,
    retryParentWorkspace,
  }), [
    currentDriverProfile, canUseDriverWorkspace, canUseParentWorkspace,
    currentLinkedChildrenCount, activeWorkspace, isLoading, error,
    isParentWorkspaceLoading, parentWorkspaceError,
    openDriverWorkspace, openParentWorkspace, openPrimaryWorkspace,
    retryDriverProfile, retryParentWorkspace,
  ])

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}

// API historiques conservées pour les écrans Smart Pickup déjà publiés.
export const DriverWorkspaceProvider = WorkspaceProvider
export const useDriverWorkspace = useWorkspace
