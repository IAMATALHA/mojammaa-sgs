/**
 * AdminMatiereDetailScreen — drill-down d'UNE matière pour l'admin.
 *
 * Ouvert depuis la vue « Matières » de AdminStatsScreen (tap sur une tuile).
 * L'admin voit tout : moyennes école, détail PAR CLASSE (trié de la plus
 * faible à la plus forte — c'est là qu'on agit), S1 vs S2, professeurs qui
 * enseignent la matière, et les élèves les plus en difficulté.
 *
 * Barèmes marocains : les classes primaire (…AEP) sont notées /10, le reste
 * /20. Comparaisons inter-classes en équivalent /20 (×2 pour le primaire) ;
 * AFFICHAGE au barème brut de chaque classe (7,2/10 — pas 14,4/20).
 *
 * Requête : notes where matiereLabel == X (repli matiere == X pour les vieux
 * docs sans label) — admin : lecture totale autorisée par les rules.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, GraduationCap,
  TrendingDown, TrendingUp, Users,
} from 'lucide-react-native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { db } from '../../config/firebase'
import { toDocs } from '../../services/firestore'
import type { UserProfile } from '../../types'
import type { AdminStackParamList } from '../../navigation/types'
import { currentAcademicPeriod } from '../../utils/academicPeriod'

interface NoteRow {
  id?: string
  eleveId: string
  eleveNom?: string
  elevePrenom?: string
  classe?: string
  semestre?: string
  matiere?: string
  matiereLabel?: string
  note?: unknown
  bareme?: unknown
}
type ValidNote = NoteRow & { classe: string; matiereLabel: string; note: number; bareme: number; eq: number }

const isPrimaire = (classe: string) => /aep/i.test(classe)
const baremeOf = (classe: string) => (isPrimaire(classe) ? 10 : 20)
const asString = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
/** équivalent /20 pour comparer des classes de barèmes différents */
const eq20 = (note: number, bareme: number) => note * (20 / bareme)
const round1 = (v: number) => Math.round(v * 10) / 10
const norm = (value: string) => value.trim().toLowerCase()

function subjectOf(row: NoteRow): string {
  return asString(row.matiereLabel) || asString(row.matiere)
}

function baremeOfNote(row: NoteRow): number {
  const bareme = asNumber(row.bareme)
  if (bareme === 10 || bareme === 20) return bareme
  return baremeOf(asString(row.classe))
}

function tintFor(eq: number | null, theme: Theme) {
  if (eq == null) return theme.textMuted
  if (eq < 10) return theme.danger
  if (eq < 12) return theme.warning
  if (eq >= 16) return theme.success
  return theme.info
}

interface ClasseAgg {
  classe: string
  bareme: number
  avg: number            // barème brut de la classe
  avgEq: number          // équivalent /20 (tri + couleur)
  success: number        // % élèves ≥ moitié
  weakCount: number      // élèves < moitié
  count: number          // élèves notés
}
interface SubjectAgg {
  matiere: string
  avgEq: number
  success: number
  weakCount: number      // élèves uniques sous la moyenne
  studentCount: number
  notesCount: number
}
interface WeakStudent { id: string; nom: string; classe: string; matiere: string; note: number; bareme: number; eq: number }
interface WeakSubjectGroup { matiere: string; count: number; avgEq: number; students: WeakStudent[] }

export default function AdminMatiereDetailScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>()
  const route = useRoute<RouteProp<AdminStackParamList, 'AdminMatiereDetail'>>()
  const matiere = route.params?.matiere?.trim() || ''
  const classeParam = route.params?.classe?.trim() || ''
  const title = matiere || classeParam || t('admin.notesAnalysis')
  const period = currentAcademicPeriod()

  const [notes, setNotes] = useState<NoteRow[]>([])
  const [teachers, setTeachers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const notesCol = collection(db, 'notes')
      const noteReads = matiere
        ? [
          getDocs(query(notesCol, where('matiereLabel', '==', matiere), where('academicYear', '==', period.academicYear), where('semestre', '==', period.semestre))),
          getDocs(query(notesCol, where('matiere', '==', matiere), where('academicYear', '==', period.academicYear), where('semestre', '==', period.semestre))),
        ]
        : classeParam
          ? [getDocs(query(notesCol, where('classe', '==', classeParam), where('academicYear', '==', period.academicYear), where('semestre', '==', period.semestre)))]
          : [getDocs(query(notesCol, where('academicYear', '==', period.academicYear), where('semestre', '==', period.semestre)))]
      const [noteSnaps, usersSnap] = await Promise.all([
        Promise.all(noteReads),
        getDocs(query(collection(db, 'users'), where('role', '==', 'professeur'))),
      ])
      const merged = new Map<string, NoteRow>()
      noteSnaps.forEach(snap => {
        snap.docs.forEach(d => merged.set(d.id, { ...(d.data() as NoteRow), id: d.id }))
      })
      const filtered = [...merged.values()].filter(row => {
        if (matiere && norm(subjectOf(row)) !== norm(matiere)) return false
        if (classeParam && asString(row.classe) !== classeParam) return false
        return true
      })
      setNotes(filtered)
      setTeachers(
        toDocs<UserProfile>(usersSnap).filter(u => {
          const matchesSubject = matiere ? norm(u.matiere || '') === norm(matiere) : true
          const classes = Array.isArray(u.classes) ? u.classes : []
          const matchesClass = classeParam ? u.classe === classeParam || classes.includes(classeParam) : true
          return matchesSubject && matchesClass
        }),
      )
    } catch (e: any) {
      setError(e?.message || t('common.error'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [classeParam, matiere, period.academicYear, period.semestre, t])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  const stats = useMemo(() => {
    const valid = notes
      .map(n => {
        const classe = asString(n.classe)
        const subject = subjectOf(n)
        const note = asNumber(n.note)
        const bareme = baremeOfNote(n)
        if (!classe || !subject || note == null || note < 0 || note > bareme) return null
        return {
          ...n,
          classe,
          matiereLabel: subject,
          note,
          bareme,
          eq: eq20(note, bareme),
        }
      })
      .filter((n): n is ValidNote => n != null)

    const studentAggs = (rows: ValidNote[]) => {
      const byStudent = new Map<string, ValidNote[]>()
      rows.forEach(row => {
        const id = row.eleveId || row.id || `${row.classe}-${row.elevePrenom || ''}-${row.eleveNom || ''}`
        if (!id) return
        const bucket = byStudent.get(id) || []
        bucket.push(row)
        byStudent.set(id, bucket)
      })
      return [...byStudent.entries()].map(([id, bucket]) => {
        const first = bucket[0]
        const eq = bucket.reduce((sum, row) => sum + row.eq, 0) / bucket.length
        const note = bucket.reduce((sum, row) => sum + row.note, 0) / bucket.length
        return {
          id,
          nom: `${first.elevePrenom || ''} ${first.eleveNom || ''}`.trim() || first.eleveId || id,
          classe: first.classe,
          matiere: first.matiereLabel,
          note: round1(note),
          bareme: first.bareme,
          eq: round1(eq),
        }
      })
    }

    // ── par classe ──
    const byClasse = new Map<string, ValidNote[]>()
    valid.forEach(n => {
      const rows = byClasse.get(n.classe) || []
      rows.push(n)
      byClasse.set(n.classe, rows)
    })
    const classes: ClasseAgg[] = [...byClasse.entries()].map(([classe, rows]) => {
      const bareme = baremeOf(classe)
      const avg = rows.reduce((s, row) => s + row.note, 0) / rows.length
      const avgEq = rows.reduce((s, row) => s + row.eq, 0) / rows.length
      const students = studentAggs(rows)
      return {
        classe, bareme,
        avg: round1(avg),
        avgEq: round1(avgEq),
        success: students.length ? Math.round((students.filter(student => student.eq >= 10).length / students.length) * 100) : 0,
        weakCount: students.filter(student => student.eq < 10).length,
        count: students.length,
      }
    }).sort((a, b) => a.avgEq - b.avgEq)   // la plus faible d'abord : là où agir

    const bySubject = new Map<string, typeof valid>()
    valid.forEach(n => {
      const rows = bySubject.get(n.matiereLabel) || []
      rows.push(n)
      bySubject.set(n.matiereLabel, rows)
    })
    const subjects: SubjectAgg[] = [...bySubject.entries()].map(([subject, rows]) => {
      const avgEq = rows.reduce((sum, row) => sum + row.eq, 0) / rows.length
      const students = studentAggs(rows)
      return {
        matiere: subject,
        avgEq: round1(avgEq),
        success: students.length ? Math.round((students.filter(student => student.eq >= 10).length / students.length) * 100) : 0,
        weakCount: students.filter(student => student.eq < 10).length,
        studentCount: students.length,
        notesCount: rows.length,
      }
    }).sort((a, b) => a.avgEq - b.avgEq || a.matiere.localeCompare(b.matiere, 'fr'))

    // ── globaux (équivalent /20) ──
    const eqAll = valid.map(n => n.eq)
    const globalStudents = studentAggs(valid)
    const schoolAvg = eqAll.length ? round1(eqAll.reduce((s, v) => s + v, 0) / eqAll.length) : null
    const success = globalStudents.length ? Math.round((globalStudents.filter(student => student.eq >= 10).length / globalStudents.length) * 100) : null
    const weakTotal = globalStudents.filter(student => student.eq < 10).length

    // ── S1 vs S2 (équivalent /20) ──
    const semAvg = (s: string) => {
      const vals = valid.filter(n => n.semestre === s).map(n => n.eq)
      return vals.length ? round1(vals.reduce((x, y) => x + y, 0) / vals.length) : null
    }
    const s1 = semAvg('S1'), s2 = semAvg('S2')
    const delta = s1 != null && s2 != null ? round1(s2 - s1) : null

    // ── élèves en difficulté, catégorisés par matière ──
    const weakBySubject: WeakSubjectGroup[] = [...bySubject.entries()]
      .map(([subject, rows]) => {
        const students = studentAggs(rows)
          .filter(student => student.eq < 10)
          .sort((a, b) => a.eq - b.eq || a.nom.localeCompare(b.nom, 'fr'))
        const avgEq = students.length ? round1(students.reduce((sum, student) => sum + student.eq, 0) / students.length) : 0
        return { matiere: subject, count: students.length, avgEq, students }
      })
      .filter(group => group.count > 0)
      .sort((a, b) => b.count - a.count || a.avgEq - b.avgEq || a.matiere.localeCompare(b.matiere, 'fr'))
    const weakest = weakBySubject
      .flatMap(group => group.students)
      .sort((a, b) => a.eq - b.eq || a.matiere.localeCompare(b.matiere, 'fr'))
      .slice(0, 12)

    return { classes, subjects, schoolAvg, success, weakTotal, s1, s2, delta, notesCount: valid.length, weakBySubject, weakest }
  }, [notes])

  const fontBold = isAr ? theme.fonts.arabicBold : theme.fonts.bold
  const fontSemi = isAr ? theme.fonts.arabicSemi : theme.fonts.semibold

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* En-tête */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityRole="button" accessibilityLabel={t('common.close')}
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ChevronLeft size={20} color={theme.text} strokeWidth={2.2} />
        </Pressable>
        <View style={[styles.headIcon, { backgroundColor: theme.primarySurface }]}>
          <BookOpen size={16} color={theme.primary} strokeWidth={2.2} />
        </View>
        <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontFamily: fontBold, fontSize: 19, letterSpacing: -0.3 }}>
          {title}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: theme.dangerSurface }]}>
              <Text style={{ color: theme.danger, fontSize: 13, fontFamily: fontSemi }}>{error}</Text>
            </View>
          ) : null}

          {/* KPIs école */}
          <View style={styles.kpiRow}>
            <Kpi value={stats.schoolAvg != null ? `${stats.schoolAvg}/20` : '—'} label={t('admin.avgGrade')} color={tintFor(stats.schoolAvg, theme)} theme={theme} isAr={isAr} />
            <Kpi value={stats.success != null ? `${stats.success}%` : '—'} label={t('admin.successRate')} color={theme.info} theme={theme} isAr={isAr} />
            <Kpi value={String(stats.weakTotal)} label={t('admin.below10')} color={stats.weakTotal > 0 ? theme.danger : theme.success} theme={theme} isAr={isAr} />
          </View>

          {/* S1 → S2 */}
          {stats.s1 != null && stats.s2 != null && (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={[styles.rowBetween, isAr && styles.rowReverse]}>
                <Text style={[styles.cardTitle, { color: theme.text, fontFamily: fontBold }]}>S1 → S2</Text>
                <View style={[styles.deltaPill, { backgroundColor: (stats.delta ?? 0) >= 0 ? theme.successSurface : theme.dangerSurface }]}>
                  {(stats.delta ?? 0) >= 0
                    ? <TrendingUp size={13} color={theme.success} strokeWidth={2.4} />
                    : <TrendingDown size={13} color={theme.danger} strokeWidth={2.4} />}
                  <Text style={{ color: (stats.delta ?? 0) >= 0 ? theme.success : theme.danger, fontFamily: theme.fonts.bold, fontSize: 12, marginStart: 4 }}>
                    {(stats.delta ?? 0) > 0 ? '+' : ''}{stats.delta} pt
                  </Text>
                </View>
              </View>
              <Text style={{ color: theme.textSoft, fontFamily: fontSemi, fontSize: 13, marginTop: 6 }}>
                {stats.s1}/20 → {stats.s2}/20
              </Text>
            </View>
          )}

          {!matiere ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.text, fontFamily: fontBold }]}>{t('admin.bySubject')}</Text>
              {stats.subjects.length === 0 ? (
                <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 8 }}>{t('common.noData')}</Text>
              ) : stats.subjects.map(subject => {
                const tint = tintFor(subject.avgEq, theme)
                const displayBareme = classeParam ? baremeOf(classeParam) : 20
                const displayAvg = classeParam ? round1(subject.avgEq * (displayBareme / 20)) : subject.avgEq
                return (
                  <Pressable
                    key={subject.matiere}
                    onPress={() => navigation.navigate('AdminMatiereDetail', {
                      matiere: subject.matiere,
                      classe: classeParam || undefined,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={subject.matiere}
                    style={({ pressed }) => [styles.classRow, { borderBottomColor: theme.border }, pressed && styles.pressed]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={[styles.rowStart, isAr && styles.rowReverse]}>
                        <Text numberOfLines={1} style={{ color: theme.text, fontFamily: fontBold, fontSize: 14 }}>{subject.matiere}</Text>
                        {subject.weakCount > 0 && (
                          <View style={[styles.weakPill, { backgroundColor: theme.dangerSurface }]}>
                            <AlertTriangle size={10} color={theme.danger} strokeWidth={2.4} />
                            <Text style={{ color: theme.danger, fontFamily: theme.fonts.bold, fontSize: 10, marginStart: 3 }}>{subject.weakCount}</Text>
                          </View>
                        )}
                      </View>
                      <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
                        <View style={[styles.progressFill, { width: `${Math.max(3, Math.min(100, (subject.avgEq / 20) * 100))}%`, backgroundColor: tint }]} />
                      </View>
                    </View>
                    <View style={styles.classNums}>
                      <Text style={{ color: tint, fontFamily: theme.fonts.black, fontSize: 16, fontVariant: ['tabular-nums'] }}>
                        {displayAvg}<Text style={{ fontSize: 11, color: theme.textMuted }}>/{displayBareme}</Text>
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: fontSemi, fontSize: 10.5 }}>
                        {subject.success}% · {subject.studentCount} {t('admin.eleves').toLowerCase()} · {subject.notesCount} {t('admin.notesShort')}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          {!classeParam ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.text, fontFamily: fontBold }]}>{t('admin.byClass')}</Text>
              {stats.classes.length === 0 ? (
                <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 8 }}>{t('common.noData')}</Text>
              ) : stats.classes.map(c => {
                const tint = tintFor(c.avgEq, theme)
                return (
                  <Pressable
                    key={c.classe}
                    onPress={() => navigation.navigate('AdminMatiereDetail', {
                      matiere: matiere || undefined,
                      classe: c.classe,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={c.classe}
                    style={({ pressed }) => [styles.classRow, { borderBottomColor: theme.border }, pressed && styles.pressed]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={[styles.rowStart, isAr && styles.rowReverse]}>
                        <Text numberOfLines={1} style={{ color: theme.text, fontFamily: fontBold, fontSize: 14 }}>{c.classe}</Text>
                        {c.weakCount > 0 && (
                          <View style={[styles.weakPill, { backgroundColor: theme.dangerSurface }]}>
                            <AlertTriangle size={10} color={theme.danger} strokeWidth={2.4} />
                            <Text style={{ color: theme.danger, fontFamily: theme.fonts.bold, fontSize: 10, marginStart: 3 }}>{c.weakCount}</Text>
                          </View>
                        )}
                      </View>
                      <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
                        <View style={[styles.progressFill, { width: `${Math.max(3, Math.min(100, (c.avgEq / 20) * 100))}%`, backgroundColor: tint }]} />
                      </View>
                    </View>
                    <View style={styles.classNums}>
                      <Text style={{ color: tint, fontFamily: theme.fonts.black, fontSize: 16, fontVariant: ['tabular-nums'] }}>
                        {c.avg}<Text style={{ fontSize: 11, color: theme.textMuted }}>/{c.bareme}</Text>
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: fontSemi, fontSize: 10.5 }}>
                        {c.success}% · {c.count} {t('admin.eleves').toLowerCase()}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          {matiere || classeParam ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.text, fontFamily: fontBold }]}>
                {matiere ? t('admin.subjectTeachers') : t('admin.profs')}
              </Text>
              {teachers.length === 0 ? (
                <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 8 }}>{t('common.noData')}</Text>
              ) : teachers.map(p => {
                const classes = Array.isArray(p.classes) && p.classes.length > 0
                  ? p.classes.join(' · ')
                  : (p.classe || '—')
                return (
                  <View key={p.uid || p.email} style={[styles.teacherRow, { borderBottomColor: theme.border }, isAr && styles.rowReverse]}>
                    <View style={[styles.teacherIcon, { backgroundColor: theme.infoSurface }]}>
                      <GraduationCap size={15} color={theme.info} strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, marginStart: 10 }}>
                      <Text numberOfLines={1} style={{ color: theme.text, fontFamily: fontBold, fontSize: 13.5 }}>
                        {`${p.prenom || ''} ${p.nom || ''}`.trim() || p.email}
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: fontSemi, fontSize: 11.5, marginTop: 1 }}>
                        {classes}
                      </Text>
                    </View>
                  </View>
                )
              })}
            </View>
          ) : null}

          {/* Élèves en difficulté */}
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text, fontFamily: fontBold }]}>{t('admin.strugglingStudents')}</Text>
            {stats.notesCount === 0 ? (
              <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 8 }}>{t('common.noData')}</Text>
            ) : (() => {
              if (stats.weakBySubject.length === 0) {
                return (
                  <View style={[styles.rowStart, { marginTop: 8 }]}>
                    <CheckCircle2 size={15} color={theme.success} strokeWidth={2.2} />
                    <Text style={{ color: theme.success, fontFamily: fontSemi, fontSize: 13, marginStart: 6 }}>
                      {t('admin.noStrugglingStudents')}
                    </Text>
                  </View>
                )
              }
              if (!matiere) {
                return stats.weakBySubject.map(group => (
                  <Pressable
                    key={group.matiere}
                    onPress={() => navigation.navigate('AdminMatiereDetail', {
                      matiere: group.matiere,
                      classe: classeParam || undefined,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={`${group.matiere}, ${group.count} ${t('admin.eleves').toLowerCase()}`}
                    style={({ pressed }) => [styles.weakSubjectRow, { borderBottomColor: theme.border }, pressed && styles.pressed]}
                  >
                    <View style={[styles.weakSubjectIcon, { backgroundColor: theme.dangerSurface }]}>
                      <AlertTriangle size={14} color={theme.danger} strokeWidth={2.3} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: theme.text, fontFamily: fontBold, fontSize: 14 }}>
                        {group.matiere}
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: fontSemi, fontSize: 11.5, marginTop: 2 }}>
                        {group.students.slice(0, 2).map(student => `${student.nom} · ${student.classe}`).join('  |  ')}
                      </Text>
                    </View>
                    <View style={[styles.weakCountButton, { backgroundColor: theme.dangerSurface }]}>
                      <Text style={{ color: theme.danger, fontFamily: theme.fonts.black, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                        {group.count}
                      </Text>
                      <Text style={{ color: theme.danger, fontFamily: fontSemi, fontSize: 10, marginStart: 3 }}>
                        {t('admin.eleves').toLowerCase()}
                      </Text>
                      <ChevronRight size={13} color={theme.danger} strokeWidth={2.4} />
                    </View>
                  </Pressable>
                ))
              }
              return stats.weakest.map((w, i) => (
                <View key={`${w.nom}-${w.classe}-${i}`} style={[styles.teacherRow, { borderBottomColor: theme.border }, isAr && styles.rowReverse]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontFamily: fontBold, fontSize: 13.5 }}>{w.nom}</Text>
                    <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: fontSemi, fontSize: 11.5, marginTop: 1 }}>
                      {w.classe} · {w.matiere}
                    </Text>
                  </View>
                  <Text style={{ color: theme.danger, fontFamily: theme.fonts.black, fontSize: 15, fontVariant: ['tabular-nums'] }}>
                    {w.note}<Text style={{ fontSize: 10.5, color: theme.textMuted }}>/{w.bareme}</Text>
                  </Text>
                </View>
              ))
            })()}
          </View>

          <View style={[styles.rowStart, { justifyContent: 'center', marginTop: 4 }]}>
            <Users size={12} color={theme.textMuted} strokeWidth={2} />
            <Text style={{ color: theme.textMuted, fontFamily: fontSemi, fontSize: 11, marginStart: 5 }}>
          {stats.notesCount} {t('admin.notesCaptured').toLowerCase()}
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function Kpi({ value, label, color, theme, isAr }: {
  value: string; label: string; color: string; theme: Theme; isAr: boolean
}) {
  return (
    <View style={[styles.kpi, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text numberOfLines={1} style={{ color, fontFamily: theme.fonts.black, fontSize: 19, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text numberOfLines={2} style={{ color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold, fontSize: 10.5, marginTop: 4, textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  loading: { paddingVertical: 60, alignItems: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  errorBox: { padding: 12, borderRadius: 10 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },

  kpiRow: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },

  card: { borderWidth: 1, borderRadius: 18, padding: 14 },
  cardTitle: { fontSize: 14.5, letterSpacing: -0.2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowStart: { flexDirection: 'row', alignItems: 'center' },
  rowReverse: { flexDirection: 'row-reverse' },
  deltaPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },

  classRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  weakPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, marginStart: 8 },
  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 7 },
  progressFill: { height: '100%', borderRadius: 999 },
  classNums: { alignItems: 'flex-end', flexShrink: 0, maxWidth: 120 },

  weakSubjectRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  weakSubjectIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  weakCountButton: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 9, flexShrink: 0 },

  teacherRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  teacherIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
})
