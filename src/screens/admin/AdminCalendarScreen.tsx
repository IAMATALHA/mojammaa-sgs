import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
  Pressable, Alert, Linking,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore'
import {
  ChevronLeft, ChevronRight, Plus, Trash2, X, BookOpen, FileText, Image as ImageIcon, Clock, Users,
} from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import BottomSheet from '../../components/BottomSheet'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../config/firebase'
import {
  getJoursScolaires, setJourScolaire, deleteJourScolaire,
  type JourScolaire, type JourType,
} from '../../services/calendarService'
import type { Attachment } from '../../services/StorageService'
import { toDoc } from '../../services/firestore'
import * as Haptics from 'expo-haptics'
import { academicPeriodForDate } from '../../utils/academicPeriod'

const JOUR_TYPES: { value: JourType; labelKey: string; color: string }[] = [
  { value: 'vacances', labelKey: 'calendar.vacances', color: '#52B788' },
  { value: 'evenement', labelKey: 'calendar.evenement', color: '#D95B00' },
  { value: 'examen', labelKey: 'calendar.examen', color: '#E63946' },
]

const WEEK_DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const WEEK_DAYS_AR = ['اثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت', 'أحد']
const WEEK_DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface CalendarTask {
  id: string
  title: string
  className: string
  teacherNom: string
  description: string
  dateLimite: string
  type: string
  attachments: Attachment[]
}

interface CalendarCell {
  iso: string
  dayNumber: number
  inMonth: boolean
  isToday: boolean
}

function localISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + days)
  return next
}

function buildMonthCells(monthDate: Date): CalendarCell[] {
  const today = localISO(new Date())
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const startOffset = (first.getDay() + 6) % 7
  const start = addDays(first, -startOffset)
  const totalRows = Math.ceil((startOffset + new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()) / 7)
  return Array.from({ length: totalRows * 7 }, (_, i) => {
    const date = addDays(start, i)
    const iso = localISO(date)
    return { iso, dayNumber: date.getDate(), inMonth: date.getMonth() === monthDate.getMonth(), isToday: iso === today }
  })
}

function formatMonthTitle(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)
}

function formatSelectedDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
}

export default function AdminCalendarScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [jours, setJours] = useState<JourScolaire[]>([])
  const [tasks, setTasks] = useState<CalendarTask[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDate, setSelectedDate] = useState(localISO(new Date()))
  const [selectedType, setSelectedType] = useState<JourType>('evenement')
  const [saving, setSaving] = useState(false)
  const [markOpen, setMarkOpen] = useState(false)
  const [hwDetail, setHwDetail] = useState<CalendarTask | null>(null)

  const cells = useMemo(() => buildMonthCells(monthDate), [monthDate])
  const visibleStart = cells[0]?.iso || localISO(new Date())
  const visibleEnd = cells[cells.length - 1]?.iso || visibleStart

  const weekDays = lang === 'ar' ? WEEK_DAYS_AR : lang === 'en' ? WEEK_DAYS_EN : WEEK_DAYS_FR

  const joursMap = useMemo(() => {
    const map = new Map<string, JourScolaire>()
    jours.forEach(j => map.set(j.date, j))
    return map
  }, [jours])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, CalendarTask[]>()
    tasks.forEach(task => {
      const list = map.get(task.dateLimite) || []
      list.push(task)
      map.set(task.dateLimite, list)
    })
    return map
  }, [tasks])

  const selectedJour = joursMap.get(selectedDate)
  const selectedTasks = tasksByDate.get(selectedDate) || []
  const hasContent = !!selectedJour || selectedTasks.length > 0

  // Agenda « À venir » — événements (jours spéciaux) et devoirs séparés.
  const upcomingEvents = useMemo(() => {
    const today = localISO(new Date())
    return jours
      .filter(j => j.date >= today)
      .map(j => ({
        key: `j-${j.date}`, date: j.date, label: j.label,
        sub: t(`calendar.${j.type}`),
        color: JOUR_TYPES.find(jt => jt.value === j.type)?.color || '#D95B00',
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 12)
  }, [jours, t])

  const upcomingHomework = useMemo(() => {
    const today = localISO(new Date())
    return tasks
      .filter(task => task.dateLimite >= today)
      .sort((a, b) => a.dateLimite.localeCompare(b.dateLimite))
      .slice(0, 12)
  }, [tasks])

  const loadJours = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getJoursScolaires(visibleStart, visibleEnd)
      setJours(list)
    } catch {} finally { setLoading(false); setRefreshing(false) }
  }, [visibleStart, visibleEnd])

  useEffect(() => { loadJours() }, [loadJours])

  useEffect(() => {
    const period = academicPeriodForDate(monthDate)
    // Pas de monthKey : il indexe le mois de CRÉATION, or le calendrier place
    // les devoirs par dateLimite (filtre client visibleStart/visibleEnd juste
    // en dessous). Un devoir créé fin juin dû début juillet manquerait sinon.
    const unsub: Unsubscribe = onSnapshot(query(
      collection(db, 'devoirs'),
      where('academicYear', '==', period.academicYear),
    ), snap => {
      setTasks(snap.docs.map(d => {
        const data = toDoc<{
          titre?: string; classeId?: string; teacherNom?: string; description?: string
          dateLimite?: string; type?: string; attachments?: Attachment[]
        }>(d)
        return {
          id: d.id,
          title: data.titre || '',
          className: data.classeId || '',
          teacherNom: data.teacherNom || '',
          description: data.description || '',
          dateLimite: data.dateLimite || '',
          type: data.type || 'devoir',
          attachments: Array.isArray(data.attachments) ? data.attachments : [],
        }
      }).filter(t => t.dateLimite >= visibleStart && t.dateLimite <= visibleEnd))
    }, () => {})
    return () => unsub()
  }, [monthDate, visibleStart, visibleEnd])

  const shiftMonth = (delta: number) => {
    Haptics.selectionAsync()
    setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const handleCellPress = (cell: CalendarCell) => {
    Haptics.selectionAsync()
    setSelectedDate(cell.iso)
  }

  const handleAddSpecialDay = async () => {
    if (!profile?.uid) return
    if (joursMap.has(selectedDate)) { Alert.alert(t('common.error'), t('calendar.alreadyExists')); return }
    setSaving(true)
    try {
      const typeInfo = JOUR_TYPES.find(jt => jt.value === selectedType)!
      await setJourScolaire({ date: selectedDate, type: selectedType, label: t(typeInfo.labelKey), annuleCours: true }, profile.uid)
      setMarkOpen(false)
      loadJours()
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally { setSaving(false) }
  }

  const handleDeleteSpecialDay = (date: string) => {
    Alert.alert(t('common.confirm'), t('calendar.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => { await deleteJourScolaire(date); loadJours() } },
    ])
  }

  const dotColors = (iso: string): string[] => {
    const colors: string[] = []
    const jour = joursMap.get(iso)
    if (jour) colors.push(JOUR_TYPES.find(jt => jt.value === jour.type)?.color || '#D95B00')
    const dt = tasksByDate.get(iso)
    if (dt && dt.length > 0) colors.push(theme.primary)
    return colors
  }

  return (
    <ScreenLayout title={t('calendar.title')}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadJours() }} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Month nav */}
        <View style={s.monthNav}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.prevMonth')} style={[s.navBtn, { backgroundColor: theme.surface }]}>
            <ChevronLeft size={20} color={theme.text} strokeWidth={2} />
          </Pressable>
          <Pressable onPress={() => { Haptics.selectionAsync(); setMonthDate(new Date()); setSelectedDate(localISO(new Date())) }}>
            <Text style={[s.monthTitle, { color: theme.text }]}>{formatMonthTitle(monthDate, lang)}</Text>
          </Pressable>
          <Pressable onPress={() => shiftMonth(1)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.nextMonth')} style={[s.navBtn, { backgroundColor: theme.surface }]}>
            <ChevronRight size={20} color={theme.text} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Week header */}
        <View style={s.weekRow}>
          {weekDays.map((d, i) => (
            <Text key={i} style={[s.weekDay, { color: theme.textSoft }]}>{d}</Text>
          ))}
        </View>

        {/* Grid */}
        {loading ? (
          <View style={s.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : (
          <View style={s.grid}>
            {cells.map(cell => {
              const selected = selectedDate === cell.iso
              const dots = dotColors(cell.iso)
              return (
                <Pressable key={cell.iso} onPress={() => handleCellPress(cell)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={formatSelectedDate(cell.iso, lang)}
                  style={[s.cell, {
                    backgroundColor: selected ? theme.primary : 'transparent',
                    opacity: cell.inMonth ? 1 : 0.3,
                  }]}>
                  <Text style={[s.dayNum, {
                    color: selected ? '#fff' : cell.isToday ? theme.primary : theme.text,
                    fontWeight: cell.isToday || selected ? '900' : '600',
                  }]}>
                    {cell.dayNumber}
                  </Text>
                  <View style={s.dotRow}>
                    {dots.map((c, i) => <View key={i} style={[s.dot, { backgroundColor: selected ? '#fff' : c }]} />)}
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}

        {/* Détail du jour sélectionné — seulement s'il a du contenu */}
        {hasContent && (
          <View style={[s.dayDetail, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.dayDetailTitle, { color: theme.text }]}>
              {formatSelectedDate(selectedDate, lang)}
            </Text>

            {selectedJour && (
              <View style={[s.eventRow, { backgroundColor: (JOUR_TYPES.find(jt => jt.value === selectedJour.type)?.color || '#D95B00') + '15' }]}>
                <View style={[s.eventDot, { backgroundColor: JOUR_TYPES.find(jt => jt.value === selectedJour.type)?.color || '#D95B00' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{selectedJour.label}</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>{t(`calendar.${selectedJour.type}`)}</Text>
                </View>
                <Pressable onPress={() => handleDeleteSpecialDay(selectedJour.date)} hitSlop={14} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
                  <Trash2 size={16} color={theme.danger} strokeWidth={2} />
                </Pressable>
              </View>
            )}

            {selectedTasks.map(task => (
              <View key={task.id} style={[s.eventRow, { backgroundColor: theme.primarySurface }]}>
                <View style={[s.eventDot, { backgroundColor: task.type === 'examen' ? theme.danger : theme.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{task.title || t('tabs.homework')}</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>{task.className}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Événements à venir */}
        <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{t('calendar.eventsSection')}</Text>
        {upcomingEvents.length === 0 ? (
          <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 2 }}>{t('calendar.noEvents')}</Text>
        ) : (
          upcomingEvents.map(item => {
            const [, , dd] = item.date.split('-')
            return (
              <Pressable key={item.key} onPress={() => setSelectedDate(item.date)} style={s.agendaItem}>
                <View style={[s.agendaDate, { backgroundColor: theme.card, borderColor: item.color + '66' }]}>
                  <Text style={{ color: item.color, fontWeight: '800', fontSize: 17, lineHeight: 20 }}>{Number(dd)}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
                    {formatWeekdayShort(item.date, lang)}
                  </Text>
                </View>
                <View style={[s.agendaBody, { backgroundColor: item.color + '15' }]}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{item.label}</Text>
                    <Text numberOfLines={1} style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>{item.sub}</Text>
                  </View>
                  <Pressable onPress={() => handleDeleteSpecialDay(item.date)} hitSlop={14} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
                    <Trash2 size={15} color={theme.danger} strokeWidth={2} />
                  </Pressable>
                </View>
              </Pressable>
            )
          })
        )}

        {/* Devoirs à venir — tap pour voir l'exercice / le document */}
        <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{t('calendar.homeworkSection')}</Text>
        {upcomingHomework.length === 0 ? (
          <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 2 }}>{t('calendar.noHomework')}</Text>
        ) : (
          upcomingHomework.map(task => {
            const [, , dd] = task.dateLimite.split('-')
            const color = task.type === 'examen' ? theme.danger : theme.primary
            const nbAtt = task.attachments.length
            return (
              <Pressable key={task.id} onPress={() => { Haptics.selectionAsync(); setHwDetail(task) }} style={s.agendaItem}>
                <View style={[s.agendaDate, { backgroundColor: theme.card, borderColor: color + '66' }]}>
                  <Text style={{ color, fontWeight: '800', fontSize: 17, lineHeight: 20 }}>{Number(dd)}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
                    {formatWeekdayShort(task.dateLimite, lang)}
                  </Text>
                </View>
                <View style={[s.agendaBody, { backgroundColor: color + '15' }]}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{task.title || t('tabs.homework')}</Text>
                    <Text numberOfLines={1} style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
                      {task.className}{task.teacherNom ? ` · ${task.teacherNom}` : ''}
                    </Text>
                  </View>
                  {nbAtt > 0 && (
                    <View style={s.attBadge}>
                      <FileText size={12} color={color} strokeWidth={2} />
                      <Text style={{ color, fontWeight: '800', fontSize: 11, marginStart: 3 }}>{nbAtt}</Text>
                    </View>
                  )}
                  <ChevronRight size={16} color={theme.textMuted} strokeWidth={2} />
                </View>
              </Pressable>
            )
          })
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FAB : marquer un jour spécial */}
      <Pressable onPress={() => { Haptics.selectionAsync(); setMarkOpen(true) }}
        accessibilityRole="button" accessibilityLabel={t('calendar.addDay')}
        style={[s.fab, { backgroundColor: theme.accent }, theme.shadows.lg]}>
        <Plus size={26} color="#fff" strokeWidth={2.5} />
      </Pressable>

      {/* Feuille de marquage */}
      <BottomSheet visible={markOpen} onClose={() => setMarkOpen(false)}>
        <Text style={[s.sheetTitle, { color: theme.text }]}>{t('calendar.addDay')}</Text>
        <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 4, marginBottom: 14, textTransform: 'capitalize' }}>
          {formatSelectedDate(selectedDate, lang)}
        </Text>
        <View style={s.typeRow}>
          {JOUR_TYPES.map(jt => {
            const active = selectedType === jt.value
            return (
              <Pressable key={jt.value} onPress={() => { Haptics.selectionAsync(); setSelectedType(jt.value) }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(jt.labelKey)}
                style={[s.typeChip, { backgroundColor: active ? jt.color : theme.surfaceAlt }]}>
                <View style={[s.typeDot, { backgroundColor: active ? '#fff' : jt.color }]} />
                <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', fontSize: 12 }}>{t(jt.labelKey)}</Text>
              </Pressable>
            )
          })}
        </View>
        <Pressable
          disabled={saving || joursMap.has(selectedDate)}
          onPress={handleAddSpecialDay}
          style={[s.addBtn, { backgroundColor: joursMap.has(selectedDate) ? theme.surfaceAlt : theme.primary }]}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : (
            <Text style={{ color: joursMap.has(selectedDate) ? theme.textMuted : '#fff', fontWeight: '800', fontSize: 13 }}>
              {joursMap.has(selectedDate)
                ? t('calendar.alreadyExists')
                : `${t('calendar.mark')} · ${selectedDate.split('-').reverse().join('/')}`}
            </Text>
          )}
        </Pressable>
      </BottomSheet>

      {/* Détail d'un devoir : énoncé + pièces jointes (exercice / document) */}
      <BottomSheet visible={!!hwDetail} onClose={() => setHwDetail(null)}>
        {hwDetail && (
          <>
            <View style={s.hwHeader}>
              <View style={[s.hwTypePill, { backgroundColor: theme.primarySurface }]}>
                <BookOpen size={12} color={theme.primary} strokeWidth={2.4} />
                <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 11, letterSpacing: 0.4, marginStart: 5 }}>
                  {(hwDetail.type || t('tabs.homework')).toUpperCase()}
                </Text>
              </View>
              <Pressable onPress={() => setHwDetail(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')} style={[s.hwClose, { backgroundColor: theme.surface }]}>
                <X size={18} color={theme.text} strokeWidth={2} />
              </Pressable>
            </View>

            <Text style={[s.sheetTitle, { color: theme.text, marginTop: 12 }]}>{hwDetail.title || t('tabs.homework')}</Text>

            {hwDetail.description ? (
              <Text style={{ color: theme.textSoft, fontSize: 13, lineHeight: 20, marginTop: 8 }}>{hwDetail.description}</Text>
            ) : null}

            <View style={[s.hwMeta, { backgroundColor: theme.surface }]}>
              <Clock size={14} color={theme.textSoft} strokeWidth={2} />
              <Text style={{ color: theme.text, fontSize: 13, marginStart: 8 }}>
                {hwDetail.dateLimite.split('-').reverse().join('/')}
              </Text>
            </View>
            <View style={[s.hwMeta, { backgroundColor: theme.surface }]}>
              <Users size={14} color={theme.textSoft} strokeWidth={2} />
              <Text style={{ color: theme.text, fontSize: 13, marginStart: 8 }}>
                {hwDetail.className}{hwDetail.teacherNom ? ` · ${hwDetail.teacherNom}` : ''}
              </Text>
            </View>

            <Text style={[s.sectionTitle, { color: theme.textMuted, marginTop: 18 }]}>{t('calendar.homeworkAttachments')}</Text>
            {hwDetail.attachments.length === 0 ? (
              <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 2 }}>{t('calendar.noAttachments')}</Text>
            ) : (
              hwDetail.attachments.map((a, i) => {
                const isImg = a.mime?.startsWith('image/')
                return (
                  <Pressable key={a.url + i} onPress={() => { if (/^https:\/\//i.test(a.url)) Linking.openURL(a.url).catch(() => {}) }}
                    style={[s.attRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={[s.attIcon, { backgroundColor: theme.primarySurface }]}>
                      {isImg
                        ? <ImageIcon size={18} color={theme.primary} strokeWidth={2} />
                        : <FileText size={18} color={theme.primary} strokeWidth={2} />}
                    </View>
                    <View style={{ flex: 1, marginStart: 10 }}>
                      <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '600', fontSize: 13 }}>{a.name}</Text>
                      <Text numberOfLines={1} style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
                        {a.mime}{a.size ? ` · ${Math.round(a.size / 1024)} KB` : ''}
                      </Text>
                    </View>
                    <ChevronRight size={16} color={theme.textMuted} strokeWidth={2} />
                  </Pressable>
                )
              })
            )}
            <View style={{ height: 8 }} />
          </>
        )}
      </BottomSheet>
    </ScreenLayout>
  )
}

function formatWeekdayShort(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(y, m - 1, d))
}

const s = StyleSheet.create({
  content: { paddingBottom: 32 },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  navBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 18, fontWeight: '900', textTransform: 'capitalize' },

  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 6, borderRadius: 12 },
  dayNum: { fontSize: 14 },
  dotRow: { flexDirection: 'row', gap: 3, marginTop: 4, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  dayDetail: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 16 },
  dayDetailTitle: { fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  eventRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginTop: 10, gap: 10 },
  eventDot: { width: 10, height: 10, borderRadius: 5 },

  typeRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 999 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  addBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 14 },

  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, marginTop: 18, marginBottom: 10 },
  agendaItem: { flexDirection: 'row', gap: 10, marginBottom: 9 },
  agendaDate: { width: 46, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  agendaBody: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 13, paddingHorizontal: 13, paddingVertical: 9, gap: 8 },

  fab: {
    position: 'absolute', bottom: 18, right: 0,
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { fontSize: 17, fontWeight: '800' },

  attBadge: { flexDirection: 'row', alignItems: 'center', marginEnd: 6 },

  hwHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hwTypePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  hwClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  hwMeta: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginTop: 8 },
  attRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  attIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  loading: { paddingVertical: 40, alignItems: 'center' },
})
