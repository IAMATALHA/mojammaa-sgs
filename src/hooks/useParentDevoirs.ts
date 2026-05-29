import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useParentData } from './useParentData'

export interface ParentDevoir {
  id: string
  title: string
  description: string
  type: string
  classeId: string
  teacherNom: string
  dateLimite: string
  isPast: boolean
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function useParentDevoirs() {
  const { eleves, children } = useParentData()
  const [devoirs, setDevoirs] = useState<ParentDevoir[]>([])
  const [loading, setLoading] = useState(true)

  const classes = useMemo(() => {
    const set = new Set<string>()
    eleves.forEach(e => { if (e.classe) set.add(e.classe) })
    return [...set]
  }, [eleves])

  useEffect(() => {
    if (classes.length === 0) { setDevoirs([]); setLoading(false); return }

    const today = new Date().toISOString().split('T')[0]
    const unsubs: Unsubscribe[] = []

    const merged = new Map<string, ParentDevoir>()
    let ready = 0

    for (let i = 0; i < classes.length; i += 10) {
      const chunk = classes.slice(i, i + 10)
      unsubs.push(onSnapshot(
        query(collection(db, 'devoirs'), where('classeId', 'in', chunk)),
        snap => {
          snap.docs.forEach(d => {
            const data = d.data() as Record<string, unknown>
            const dateLimite = asString(data.dateLimite)
            merged.set(d.id, {
              id: d.id,
              title: asString(data.titre),
              description: asString(data.description),
              type: asString(data.type) || 'Maison',
              classeId: asString(data.classeId),
              teacherNom: asString(data.teacherNom),
              dateLimite,
              isPast: dateLimite < today,
            })
          })
          ready++
          if (ready >= Math.ceil(classes.length / 10)) {
            setDevoirs([...merged.values()].sort((a, b) => b.dateLimite.localeCompare(a.dateLimite)))
            setLoading(false)
          }
        },
        () => { setLoading(false) },
      ))
    }

    return () => unsubs.forEach(u => u())
  }, [classes.join(',')])

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

  return { loading, devoirs: devoirsByChild }
}
