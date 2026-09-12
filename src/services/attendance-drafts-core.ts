import type { WeeklySlot } from './scheduleService'

export type AttendanceStatus = 'present' | 'absent' | 'retard'
export interface AttendanceDraftRow {
  id: string; nom: string; prenom: string; status: AttendanceStatus; baseVersion: string
}
export interface AttendanceDraft {
  uid: string; lessonKey: string; date: string; slot: WeeklySlot; seance: string
  rows: AttendanceDraftRow[]; state: 'draft' | 'queued' | 'review' | 'synced'
  operationId?: string; updatedAt: number; error?: string
}
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }
export const attendanceDraftKey = (date: string, lessonKey: string) => `${date}:${lessonKey}`

/** One serialized local document per user; no cross-account reads or sends.
 * Persist BEFORE sending. Only explicitly queued drafts are synchronized.
 */
export function createAttendanceDraftStore(storage: Storage, send: (draft: AttendanceDraft) => Promise<{ versions: Record<string, string> }>, currentUid: () => string | undefined) {
  let writes: Promise<unknown> = Promise.resolve()
  const syncing = new Set<string>()
  const listeners = new Set<() => void>()
  const storageKey = (uid: string) => `@mojammaa/attendance-v1/${uid}`
  const notify = () => listeners.forEach(fn => fn())

  async function read(uid: string): Promise<AttendanceDraft[]> {
    await writes.catch(() => {})
    const raw = await storage.getItem(storageKey(uid))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('invalid-draft-storage')
    return parsed.filter((d): d is AttendanceDraft => !!d && d.uid === uid && Array.isArray(d.rows))
  }
  function change(uid: string, update: (list: AttendanceDraft[]) => AttendanceDraft[]) {
    const action = writes.catch(() => {}).then(async () => {
      const raw = await storage.getItem(storageKey(uid))
      const list: AttendanceDraft[] = raw ? JSON.parse(raw) : []
      // Old synchronized caches expire; unsent work is never silently deleted.
      const next = update(list).filter(d => d.uid === uid && (d.state !== 'synced' || Date.now() - d.updatedAt < 7 * 86400_000))
      await storage.setItem(storageKey(uid), JSON.stringify(next))
      notify()
    })
    writes = action
    return action
  }
  async function put(draft: AttendanceDraft) {
    await change(draft.uid, list => [...list.filter(d => attendanceDraftKey(d.date, d.lessonKey) !== attendanceDraftKey(draft.date, draft.lessonKey)), draft])
  }
  async function get(uid: string, date: string, key: string) {
    return (await read(uid)).find(d => attendanceDraftKey(d.date, d.lessonKey) === attendanceDraftKey(date, key)) || null
  }
  async function flush(uid: string) {
    if (syncing.has(uid) || currentUid() !== uid) return
    syncing.add(uid)
    try {
      const drafts = (await read(uid)).filter(d => d.state === 'queued').sort((a, b) => a.updatedAt - b.updatedAt)
      for (const draft of drafts) {
        if (currentUid() !== uid) break
        try {
          const result = await send(draft)
          await change(uid, list => list.map(d => d.operationId === draft.operationId && d.state === 'queued'
            ? { ...d, state: 'synced', rows: d.rows.map(row => ({ ...row, baseVersion: result.versions[row.id] || row.baseVersion })), error: undefined, updatedAt: Date.now() }
            : d))
        } catch (error: any) {
          const code = String(error?.code || '').replace('functions/', '')
          if (['permission-denied', 'failed-precondition', 'invalid-argument', 'already-exists'].includes(code)) {
            await change(uid, list => list.map(d => d.operationId === draft.operationId
              ? { ...d, state: 'review', error: code } : d))
          } else break // Network failure: keep queued, retry on foreground/timer.
        }
      }
    } finally { syncing.delete(uid) }
  }
  const discard = (draft: AttendanceDraft) => change(draft.uid, list => list.filter(d =>
    attendanceDraftKey(d.date, d.lessonKey) !== attendanceDraftKey(draft.date, draft.lessonKey) || d.state === 'queued'))
  return { read, get, put, flush, discard, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } } }
}
