import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '../config/firebase'
import type { Attachment } from '../services/StorageService'
import { currentAcademicPeriod, localISODate } from '../utils/academicPeriod'
import type { EleveDoc } from '../services/elevesService'
import { useAuth } from '../contexts/AuthContext'
import {
  homeworkSubmissionId,
  subscribeParentHomeworkSubmissions,
  type HomeworkSubmission,
  type HomeworkSubmissionStatus,
} from '../services/homeworkSubmissionsService'

export interface ParentDevoir {
  id: string
  title: string
  description: string
  type: string
  classeId: string
  teacherId: string
  teacherNom: string
  dateLimite: string
  isPast: boolean
  attachments: Attachment[]
  childId: string
  childName: string
  parentUid: string
  status: HomeworkSubmissionStatus
  submission: HomeworkSubmission | null
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

interface RawDevoir extends Omit<ParentDevoir, 'childId' | 'childName' | 'parentUid' | 'status' | 'submission'> {}

export function useParentDevoirs(eleves: EleveDoc[]) {
  const period = currentAcademicPeriod()
  const { profile } = useAuth()
  const [devoirs, setDevoirs] = useState<RawDevoir[]>([])
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([])
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

    const today = localISODate()
    const unsubs: Unsubscribe[] = []

    // One bucket per query chunk, each rebuilt from scratch on every snapshot so
    // devoirs deleted by a teacher disappear instead of lingering in a map that
    // is only ever added to.
    const buckets = new Map<number, Map<string, RawDevoir>>()
    const chunkCount = Math.ceil(classes.length / 10)
    const readyBuckets = new Set<number>()

    const apply = () => {
      const merged = new Map<string, RawDevoir>()
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
          const next = new Map<string, RawDevoir>()
          snap.docs.forEach(d => {
            const data = d.data() as Record<string, unknown>
            const dateLimite = asString(data.dateLimite)
            next.set(d.id, {
              id: d.id,
              title: asString(data.titre),
              description: asString(data.description),
              type: asString(data.type) || 'Maison',
              classeId: asString(data.classeId),
              teacherId: asString(data.teacherId),
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

  useEffect(() => {
    if (!profile?.uid) { setSubmissions([]); return }
    return subscribeParentHomeworkSubmissions(
      profile.uid,
      eleves.map(eleve => eleve.codeMassar || eleve.id || ''),
      list => setSubmissions(list),
      err => setError(err.message),
    )
  }, [profile?.uid, eleves.map(eleve => eleve.codeMassar || eleve.id || '').join('|')])

  const devoirsByChild = useMemo(() => {
    const byId = new Map(submissions.map(row => [row.id, row]))
    return devoirs.flatMap(d =>
      eleves
        .filter(eleve => eleve.classe === d.classeId)
        .map(eleve => {
          const childId = eleve.codeMassar || eleve.id || ''
          const submission = byId.get(homeworkSubmissionId(d.id, childId)) || null
          return {
            ...d,
            childId,
            childName: [eleve.prenomLatin || eleve.prenom, eleve.nomLatin || eleve.nom].filter(Boolean).join(' '),
            parentUid: profile?.uid || '',
            status: submission?.status || 'pending',
            submission,
          }
        }),
    )
  }, [devoirs, eleves, submissions, profile?.uid])

  return { loading, error, devoirs: devoirsByChild }
}
