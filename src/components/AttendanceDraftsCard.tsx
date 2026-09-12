import React, { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { attendanceDrafts } from '../services/attendance-drafts'
import type { AttendanceDraft } from '../services/attendance-drafts-core'

export default function AttendanceDraftsCard({ onOpen }: { onOpen: (draft: AttendanceDraft) => void }) {
  const { profile } = useAuth()
  const theme = useTheme()
  const { t } = useTranslation()
  const [drafts, setDrafts] = useState<AttendanceDraft[]>([])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setDrafts([])
    const refresh = () => {
      if (!profile?.uid) return
      void attendanceDrafts.read(profile.uid).then(list => {
        if (active) { setDrafts(list.filter(d => d.state !== 'synced').sort((a, b) => a.date.localeCompare(b.date))); setFailed(false) }
      }).catch(() => { if (active) setFailed(true) })
    }
    refresh()
    const unsubscribe = attendanceDrafts.subscribe(refresh)
    return () => { active = false; unsubscribe() }
  }, [profile?.uid])
  if (!drafts.length && !failed) return null
  return (
    <View style={{ marginBottom: 16, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, gap: 8 }}>
      <Text style={{ color: theme.text, fontFamily: theme.fonts.bold }}>{t('offlineAttendance.title')}</Text>
      {failed && <Text style={{ color: theme.danger }}>{t('offlineAttendance.storageFailed')}</Text>}
      {drafts.map(draft => (
        <Pressable key={`${draft.date}:${draft.lessonKey}`} accessibilityRole="button" onPress={() => onOpen(draft)} style={{ minHeight: 48, justifyContent: 'center', gap: 4, paddingVertical: 6 }}>
          <Text style={{ color: theme.primary, fontFamily: theme.fonts.semibold }}>{draft.slot.classe} · {draft.date} · {draft.seance}</Text>
          <Text style={{ color: draft.state === 'review' ? theme.danger : theme.textSoft, fontSize: 12 }}>{t(`offlineAttendance.${draft.state}Title`)}</Text>
        </Pressable>
      ))}
    </View>
  )
}
