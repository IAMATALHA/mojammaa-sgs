import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createParentAlertHistory, parentAlertStorageKey } from '../utils/parent-alert-history'

const history = createParentAlertHistory(AsyncStorage)

export function useViewedParentAlerts(parentId: string, childId: string) {
  const key = parentId && childId ? parentAlertStorageKey(parentId, childId) : ''
  const [state, setState] = useState<{ key: string; ready: boolean; tokens: string[] } | null>(null)
  useEffect(() => {
    let active = true
    const apply = (tokens: string[]) => {
      if (active) setState(previous => ({ key, ready: true,
        tokens: [...new Set([...(previous?.key === key ? previous.tokens : []), ...tokens])],
      }))
    }
    if (key) void history.read(key).then(apply).catch(() => apply([]))
    else apply([])
    return () => { active = false }
  }, [key])
  const tokens = new Set(state?.key === key ? state.tokens : [])
  return {
    ready: state?.key === key && state.ready,
    isViewed: (current: string[]) => current.length > 0 && current.every(token => tokens.has(token)),
    markViewed(current: string[]) {
      if (!key || current.length === 0) return
      setState(previous => ({ key, ready: true,
        tokens: [...new Set([...(previous?.key === key ? previous.tokens : []), ...current])],
      }))
      // A storage failure must not prevent navigation or resurrect the alert in
      // this session. A later launch can safely show it again if saving failed.
      void history.mark(key, current).catch(() => {})
    },
  }
}
