/**
 * useUnreadMessagesCount — compteur de messages non lus pour le badge
 * de l'onglet Messages (même définition que le compteur du titre dans
 * les écrans Messages : message reçu dont readBy ne contient pas mon uid).
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeMessages } from '../services/messagesService'

export function useUnreadMessagesCount(): number {
  const { profile } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!profile?.uid) { setCount(0); return }
    const uid = profile.uid
    const unsub = subscribeMessages(
      uid, profile.role || 'parent',
      // fromId !== uid : ne pas compter ses propres diffusions comme non lues
      // (un admin "reçoit" aussi les broadcasts qu'il envoie).
      list => setCount(list.filter(m => m.fromId !== uid && !(m.readBy || []).includes(uid)).length),
      () => {},
    )
    return unsub
  }, [profile?.uid, profile?.role])

  return count
}
