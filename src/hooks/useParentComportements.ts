import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeChildrenOfParent, type EleveDoc } from '../services/elevesService'
import { subscribeComportementsForEleves, type ComportementDoc } from '../services/comportementsService'

export function useParentComportements() {
  const { profile } = useAuth()
  const uid = profile?.uid || ''
  const [family, setFamily] = useState<{ uid: string; children: EleveDoc[]; error: boolean }>({ uid: '', children: [], error: false })
  const eleves = family.uid === uid ? family.children : []
  const ids = eleves.map(child => child.codeMassar || child.id || '').filter(Boolean)
  const scope = `${uid}:${ids.join('|')}`
  const [data, setData] = useState<{ scope: string; entries: ComportementDoc[]; error: string | null }>({ scope: '', entries: [], error: null })
  useEffect(() => {
    if (!uid) return
    return subscribeChildrenOfParent(uid,
      children => setFamily({ uid, children, error: false }),
      () => setFamily({ uid, children: [], error: true }),
    )
  }, [uid])
  useEffect(() => {
    if (!ids.length) return
    return subscribeComportementsForEleves(ids,
      entries => setData({ scope, entries, error: null }),
      () => setData({ scope, entries: [], error: 'load-failed' }),
    )
  }, [scope])
  const entries = useMemo(() => data.scope === scope
    ? [...data.entries].filter(entry => ids.includes(entry.eleveId)).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)) : [],
  [data, scope])
  return { entries, eleves,
    loading: !!uid && (family.uid !== uid || (ids.length > 0 && data.scope !== scope)),
    error: family.uid === uid && family.error ? 'load-failed' : data.scope === scope ? data.error : null,
  }
}
