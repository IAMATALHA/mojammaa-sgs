/**
 * Écran "Aujourd'hui" du prof — hub central avec :
 *   - Le cours en cours OU le prochain cours
 *   - Bouton géant "Faire l'appel" qui ouvre l'écran de présence en 1 clic
 *   - Aperçu de la journée (autres séances)
 *
 * Le but est zéro friction : à l'ouverture de l'app, le prof voit ce qu'il
 * doit faire MAINTENANT, sans naviguer.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native'
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated'
import { useNavigation } from '@react-navigation/native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Ionicons } from '@expo/vector-icons'
import ScreenLayout from '../../components/ScreenLayout'
import PressableScale from '../../components/PressableScale'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../config/firebase'

interface Cours {
  id:            string
  classeId:      string
  jour:          string
  seance:        string
  matiere:       string
  salle?:        string
  professeurNom?: string
}

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'] as const

// Plages horaires fixes (alignées avec mojammaa-parent).
const SEANCES: Record<string, { start: number; end: number; label: string }> = {
  S1: { start: 8 * 60 + 30, end: 9 * 60 + 30,  label: '08:30 – 09:30' },
  S2: { start: 9 * 60 + 30, end: 10 * 60 + 30, label: '09:30 – 10:30' },
  S3: { start: 10 * 60 + 30, end: 11 * 60 + 30, label: '10:30 – 11:30' },
  S4: { start: 11 * 60 + 30, end: 12 * 60 + 30, label: '11:30 – 12:30' },
  S5: { start: 13 * 60,      end: 14 * 60,      label: '13:00 – 14:00' },
  S6: { start: 14 * 60,      end: 15 * 60,      label: '14:00 – 15:00' },
}

function nowMinutes(): number {
  const n = new Date()
  return n.getHours() * 60 + n.getMinutes()
}

function todayJour(): string {
  return JOURS[new Date().getDay()]
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export default function TeacherTodayScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const navigation = useNavigation<any>()
  const { profile } = useAuth()
  const [cours,   setCours]   = useState<Cours[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [now,     setNow]     = useState(nowMinutes())

  const fullName = profile ? `${profile.prenom} ${profile.nom}`.trim() : ''
  const jour     = todayJour()

  const load = useCallback(async () => {
    if (!fullName) return
    setLoading(true); setError(null)
    try {
      const snap = await getDocs(query(
        collection(db, 'emploiDuTemps'),
        where('professeurNom', '==', fullName),
        where('jour',           '==', jour),
      ))
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Cours[]
      list.sort((a, b) => (SEANCES[a.seance]?.start ?? 0) - (SEANCES[b.seance]?.start ?? 0))
      setCours(list)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les cours du jour.')
    } finally {
      setLoading(false)
    }
  }, [fullName, jour])

  useEffect(() => { load() }, [load])

  // Rafraîchit "now" chaque minute pour que le bouton "faire l'appel"
  // saute au cours suivant automatiquement.
  useEffect(() => {
    const id = setInterval(() => setNow(nowMinutes()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Sélectionne le cours actuel (en cours) ou le prochain à venir.
  const { current, next, remaining } = useMemo(() => {
    const cur  = cours.find(c => {
      const s = SEANCES[c.seance]
      return s && now >= s.start && now < s.end
    })
    const fut  = cours.filter(c => {
      const s = SEANCES[c.seance]
      return s && now < s.start
    })
    const nxt  = fut[0]
    const rest = fut.slice(1)
    return { current: cur, next: nxt, remaining: rest }
  }, [cours, now])

  const callAppel = (c: Cours) => {
    navigation.navigate('ClasseFolder', { classe: c.classeId, seance: c.seance, openAttendance: true })
  }

  return (
    <ScreenLayout title={t('teacher.today')}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
      >
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
            <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        {profile && (
          <Text style={[styles.greeting, { color: theme.textSoft }]}>
            {t('greeting.morning')} {profile.prenom} 👋
          </Text>
        )}

        {loading && cours.length === 0 ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : (
          <>
            {/* Cours en cours */}
            {current ? (
              <BigCard
                badge="EN COURS"
                badgeColor={theme.danger}
                classe={current.classeId}
                matiere={current.matiere}
                seance={current.seance}
                time={SEANCES[current.seance]?.label || ''}
                salle={current.salle}
                onCallAppel={() => callAppel(current)}
                theme={theme}
              />
            ) : null}

            {/* Prochain cours */}
            {next ? (
              <BigCard
                badge={current ? 'ENSUITE' : 'PROCHAIN COURS'}
                badgeColor={theme.primary}
                classe={next.classeId}
                matiere={next.matiere}
                seance={next.seance}
                time={SEANCES[next.seance]?.label || ''}
                salle={next.salle}
                countdown={SEANCES[next.seance] ? Math.max(0, SEANCES[next.seance].start - now) : undefined}
                onCallAppel={() => callAppel(next)}
                theme={theme}
              />
            ) : null}

            {/* Aucun cours */}
            {!current && !next ? (
              <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ fontSize: 28, marginBottom: 8 }}>🌴</Text>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  {cours.length === 0 ? t('teacher.noCourseAlert') : t('teacher.today')}
                </Text>
                <Text style={[styles.emptySub, { color: theme.textSoft }]}>
                  À demain !
                </Text>
              </View>
            ) : null}

            {/* Reste de la journée */}
            {remaining.length > 0 && (
              <>
                <Animated.Text
                  entering={FadeIn.delay(200)}
                  style={[styles.sectionTitle, { color: theme.textSoft, fontFamily: theme.fonts.black }]}
                >
                  Plus tard aujourd'hui
                </Animated.Text>
                {remaining.map((c, i) => (
                  <Animated.View
                    key={c.id}
                    entering={FadeInDown.delay(250 + i * 60).springify().damping(18)}
                    style={[styles.smallCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  >
                    <View>
                      <Text style={[styles.smallSeance, { color: theme.primary, fontFamily: theme.fonts.black }]}>{c.seance}</Text>
                      <Text style={[styles.smallTime, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>{SEANCES[c.seance]?.label}</Text>
                    </View>
                    <View style={{ flex: 1, marginStart: 16 }}>
                      <Text style={[styles.smallMatiere, { color: theme.text, fontFamily: theme.fonts.bold }]}>{c.matiere}</Text>
                      <Text style={[styles.smallClasse, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>
                        {c.classeId}{c.salle ? ` · ${c.salle}` : ''}
                      </Text>
                    </View>
                  </Animated.View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </ScreenLayout>
  )
}

function BigCard({
  badge, badgeColor, classe, matiere, seance, time, salle, countdown, onCallAppel, theme,
}: {
  badge: string
  badgeColor: string
  classe: string
  matiere: string
  seance: string
  time: string
  salle?: string
  countdown?: number
  onCallAppel: () => void
  theme: any
}) {
  const { t } = useTranslation()
  return (
    <Animated.View
      entering={FadeInDown.duration(450).springify().damping(18)}
      style={[styles.bigCard, {
        backgroundColor: theme.primary,
        shadowColor:     theme.primary,
        shadowOpacity:   0.30,
        shadowRadius:    20,
        shadowOffset:    { width: 0, height: 10 },
        elevation:       6,
      }]}
    >
      <View style={[styles.bigBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
        <Text style={[styles.bigBadgeText, { fontFamily: theme.fonts.black }]}>{badge}</Text>
      </View>
      {countdown != null && countdown > 0 ? (
        <Text style={[styles.bigCountdown, { fontFamily: theme.fonts.semibold }]}>
          {countdown < 60 ? `Dans ${countdown} min` : `Dans ${Math.floor(countdown / 60)}h${(countdown % 60).toString().padStart(2, '0')}`}
        </Text>
      ) : null}
      <Text style={[styles.bigClasse, { fontFamily: theme.fonts.bold }]}>{classe}</Text>
      <Text style={[styles.bigMatiere, { fontFamily: theme.fonts.black }]}>{matiere}</Text>
      <Text style={[styles.bigMeta, { fontFamily: theme.fonts.regular }]}>
        {seance} · {time}{salle ? `  ·  📍 ${salle}` : ''}
      </Text>
      <PressableScale onPress={onCallAppel} style={styles.callBtn}>
        <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
        <Text style={[styles.callBtnText, { color: theme.primary, fontFamily: theme.fonts.black }]}>{t('teacher.takeAttendance')}</Text>
      </PressableScale>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  greeting:    { fontSize: 14, marginBottom: 14 },
  bigCard:     { padding: 22, borderRadius: 20, marginBottom: 20 },
  bigBadge:    { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 12 },
  bigBadgeText:{ color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  bigCountdown:{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  bigClasse:   { color: '#fff', fontSize: 16, fontWeight: '700', opacity: 0.9, marginBottom: 4 },
  bigMatiere:  { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 6 },
  bigMeta:     { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginBottom: 16 },
  callBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', paddingVertical: 16, borderRadius: 14 },
  callBtnText: { fontSize: 17, fontWeight: '800' },

  emptyCard:   { padding: 28, borderRadius: 16, borderWidth: 1, alignItems: 'center', marginBottom: 20 },
  emptyTitle:  { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  emptySub:    { fontSize: 13 },

  sectionTitle:{ fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 6 },
  smallCard:   { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  smallSeance: { fontSize: 16, fontWeight: '800' },
  smallTime:   { fontSize: 11, marginTop: 2 },
  smallMatiere:{ fontSize: 15, fontWeight: '700' },
  smallClasse: { fontSize: 12, marginTop: 2 },

  loading:     { paddingVertical: 40, alignItems: 'center' },
  errorBox:    { padding: 12, borderRadius: 10, marginBottom: 12 },
})
