/** Opaque preference identifiers, not an authentication/security primitive.
 * Keep names, grades and document contents out of the local preference store.
 */
export function parentAlertToken(value: unknown): string {
  const text = JSON.stringify(value)
  let a = 0x811c9dc5
  let b = 0x9e3779b9
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193)
    b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}

export function parentAlertStorageKey(parentId: string, childId: string): string {
  return '@mojammaa/parent-alerts-v1/' + parentAlertToken([parentId, childId])
}

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> }

export function createParentAlertHistory(storage: Storage) {
  const writes = new Map<string, Promise<void>>()
  const read = async (key: string): Promise<string[]> => {
    const raw = await storage.getItem(key)
    if (!raw) return []
    try {
      const value: unknown = JSON.parse(raw)
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && /^[a-f0-9]{16}$/.test(v)) : []
    } catch { return [] }
  }
  return {
    async read(key: string) {
      await writes.get(key)?.catch(() => {})
      return read(key)
    },
    mark(key: string, tokens: string[]) {
      // Serialize read/merge/write so rapidly opening two alerts loses neither.
      const job = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
        const previous = await read(key)
        await storage.setItem(key, JSON.stringify([...new Set([...previous, ...tokens])].slice(-512)))
      })
      writes.set(key, job)
      void job.finally(() => { if (writes.get(key) === job) writes.delete(key) }).catch(() => {})
      return job
    },
  }
}
