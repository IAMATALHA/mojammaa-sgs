import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useParentData } from './useParentData'
import type { Attachment } from '../services/StorageService'
import { currentAcademicPeriod } from '../utils/academicPeriod'

export interface ParentDevoir {
  id: string
  title: string
  description: string
  type: string
  classeId: string
  teacherNom: string
  dateLimite: string
  isPast: boolean
  attachments: Attachment[]
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function useParentDevoirs() {
  const period = currentAcademicPeriod()
  const { eleves, children } = useParentData()
  const [devoirs, setDevoirs] = useState<ParentDevoir[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const classes = useMemo(() => {
    const set = new Set<string>()
    eleves.forEach(e => { if (e.classe) set.add(e.classe) })
    return [...set]
  }, [eleves])

  useEffect(() => {
    if (classes.length === 0) { setDevoirs([]); setLoading(false); return }
    setError(null)

    const today = new Date().toISOString().split('T')[0]
    const unsubs: Unsubscribe[] = []

    // One bucket per query chunk, each rebuilt from scratch on every snapshot so
    // devoirs deleted by a teacher disappear instead of lingering in a map that
    // is only ever added to.
    const buckets = new Map<number, Map<string, ParentDevoir>>()
    const chunkCount = Math.ceil(classes.length / 10)
    const readyBuckets = new Set<number>()

    const apply = () => {
      const merged = new Map<string, ParentDevoir>()
      buckets.forEach(bucket => bucket.forEach((dev, id) => merged.set(id, dev)))
      setDevoirs([...merged.values()].sort((a, b) => b.dateLimite.localeCompare(a.dateLimite)))
    }

    for (let i = 0; i < classes.length; i += 10) {
      const chunk = classes.slice(i, i + 10)
      const bucketId = i / 10
      buckets.set(bucketId, new Map())
      unsubs.push(onSnapshot(
        // Année scolaire uniquement — filtrer par mois de CRÉATION ferait
        // disparaître un devoir avant sa date de rendu (créé le 28, dû le 5).
        query(
          collection(db, 'devoirs'),
          where('classeId', 'in', chunk),
          where('academicYear', '==', period.academicYear),
        ),
        snap => {
          const next = new Map<string, ParentDevoir>()
          snap.docs.forEach(d => {
            const data = d.data() as Record<string, unknown>
            const dateLimite = asString(data.dateLimite)
            next.set(d.id, {
              id: d.id,
              title: asString(data.titre),
              description: asString(data.description),
              type: asString(data.type) || 'Maison',
              classeId: asString(data.classeId),
              teacherNom: asString(data.teacherNom),
              dateLimite,
              isPast: dateLimite < today,
              attachments: Array.isArray(data.attachments) ? (data.attachments as Attachment[]) : [],
            })
          })
          buckets.set(bucketId, next)
          readyBuckets.add(bucketId)
          apply()
          if (readyBuckets.size >= chunkCount) setLoading(false)
        },
        err => { setError(err?.message || 'load failed'); setLoading(false) },
      ))
    }

    return () => unsubs.forEach(u => u())
  }, [classes.join(','), period.academicYear])

  const childClassMap = useMemo(() => {
    const map = new Map<string, string>()
    children.forEach(c => { if (c.classe) map.set(c.classe, c.id) })
    return map
  }, [children])

  const devoirsByChild = useMemo(() => {
    return devoirs.map(d => ({
      ...d,
      childId: childClassMap.get(d.classeId) || '',
    }))
  }, [devoirs, childClassMap])

  return { loading, error, devoirs: devoirsByChild }
}
