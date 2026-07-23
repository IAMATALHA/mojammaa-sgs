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
  Users,
} from 'lucide-react-native'
import { httpsCallable } from 'firebase/functions'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { functions } from '../../config/firebase'
import type { AdminStackParamList } from '../../navigation/types'
import type { AppliedScope, ScopeStudent } from '../../types/stats'
import { translatedFormula } from '../../utils/evaluationFormula'

const isPrimaire = (classe: string) => /aep/i.test(classe)
const baremeOf = (classe: string) => (isPrimaire(classe) ? 10 : 20)
const round1 = (v: number) => Math.round(v * 10) / 10

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
  avg: number | null     // barème brut de la classe
  avgEq: number | null   // équivalent /20 (tri + couleur)
  success: number | null // % élèves ≥ moitié
  weakCount: number      // élèves < moitié
  gradedCount: number
  enrolledCount: number
}
interface SubjectAgg {
  matiere: string
  avgEq: number | null
  success: number | null
  weakCount: number      // élèves uniques sous la moyenne
  studentCount: number
  notesCount: number
}
interface WeakStudent { id: string; nom: string; classe: string; note: number }
interface TeacherLite { id: string; nom: string; prenom: string; matiere: string; classes: string[] }
interface ProgressionTransition {
  fromSlot: string
  fromKind: string
  fromLabel: string
  toSlot: string
  toKind: string
  toLabel: string
  fromAverage: number
  toAverage: number
  delta: number
  comparableStudents: number
  improved: number
  stable: number
  declined: number
}
interface ProgressionRow {
  matiere: string
  semestre: string
  formula: 'weighted_blocks' | 'english_three_blocks'
  integratedWeight: number
  formulaLabel: string
  controls: { slot: string; label: string; average: number; entered: number }[]
  transitions: ProgressionTransition[]
  documents: number
  complete: number
  provisional: number
  componentsEntered: number
  componentsExpected: number
  coverageRate: number
  comparableStudents: number
  improved: number
  stable: number
  declined: number
  latestDelta: number | null
}
interface GradeDetailsResult {
  summary: {
    average: number | null
    successRate: number | null
    belowThreshold: number
    gradedStudents: number
    notesCount: number
    s1: number | null
    s2: number | null
  }
  classes: {
    name: string
    studentCount: number
    gradedStudents: number
    avgNote: number | null
    successRate: number | null
    passingStudents: number
    notesCount: number
  }[]
  subjects: {
    name: string
    notesCount: number
    avgNote: number | null
    successRate: number | null
    gradedStudents: number
    below10Count: number
  }[]
  weakStudents: ScopeStudent[]
  teachers: TeacherLite[]
  progression: ProgressionRow[]
  applied: AppliedScope
}

export default function AdminMatiereDetailScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>()
  const route = useRoute<RouteProp<AdminStackParamList, 'AdminMatiereDetail'>>()
  const matiere = route.params?.matiere?.trim() || ''
  const classeParam = route.params?.classe?.trim() || ''
  const scope = route.params?.scope
  const title = matiere || classeParam || t('admin.notesAnalysis')
  const [details, setDetails] = useState<GradeDetailsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const baseScope: AppliedScope = scope || {
        period: 'mois',
        academicYear: '',
        cycle: '',
        niveau: '',
        classe: '',
        matiere: '',
        notesPeriod: 'S1',
        from: '',
        to: '',
      }
      const response = await httpsCallable<
        { scope: AppliedScope; matiere?: string; classe?: string },
        GradeDetailsResult
      >(functions, 'getStatsGradeDetails')({
        scope: baseScope,
        matiere: matiere || undefined,
        classe: classeParam || undefined,
      })
      setDetails(response.data)
    } catch (e: any) {
      setError(e?.message || t('common.error'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [classeParam, matiere, scope, t])

  useEffect(() => { load() }, [load])
  const onRefresh = () => { setRefreshing(true); load() }

  const stats = useMemo(() => {
    const summary = details?.summary
    const classes: ClasseAgg[] = (details?.classes || []).map(row => {
      const bareme = baremeOf(row.name)
      const avgEq = row.avgNote
      return {
        classe: row.name,
        bareme,
        avg: avgEq == null ? null : round1(avgEq * (bareme / 20)),
        avgEq,
        success: row.successRate,
        weakCount: Math.max(0, row.gradedStudents - row.passingStudents),
        gradedCount: row.gradedStudents,
        enrolledCount: row.studentCount,
      }
    }).sort((a, b) => {
      if (a.avgEq == null) return b.avgEq == null ? a.classe.localeCompare(b.classe, 'fr') : 1
      if (b.avgEq == null) return -1
      return a.avgEq - b.avgEq
    })
    const subjects: SubjectAgg[] = (details?.subjects || []).map(row => ({
      matiere: row.name,
      avgEq: row.avgNote,
      success: row.successRate,
      weakCount: row.below10Count,
      studentCount: row.gradedStudents,
      notesCount: row.notesCount,
    })).sort((a, b) => {
      if (a.avgEq == null) return b.avgEq == null ? a.matiere.localeCompare(b.matiere, 'fr') : 1
      if (b.avgEq == null) return -1
      return a.avgEq - b.avgEq || a.matiere.localeCompare(b.matiere, 'fr')
    })
    const weakStudents: WeakStudent[] = (details?.weakStudents || []).map(student => ({
      id: student.id,
      nom: `${student.prenom} ${student.nom}`.trim(),
      classe: student.classe,
      note: student.average ?? 0,
    }))
    return {
      classes,
      subjects,
      schoolAvg: summary?.average ?? null,
      success: summary?.successRate ?? null,
      weakTotal: summary?.belowThreshold ?? 0,
      notesCount: summary?.notesCount ?? 0,
      weakest: weakStudents,
    }
  }, [details])
  const teachers = details?.teachers || []

  const fontBold = isAr ? theme.fonts.arabicBold : theme.fonts.bold
  const fontSemi = isAr ? theme.fonts.arabicSemi : theme.fonts.semibold
  const openProgression = (
    row: ProgressionRow,
    transition: ProgressionTransition,
    outcome: 'improved' | 'stable' | 'declined',
  ) => {
    const applied = details?.applied || scope
    if (!applied) return
    navigation.navigate('AdminScopeStudents', {
      // Le drill-down devient un véritable sous-périmètre matière. Le serveur
      // refuse ensuite toute transition qui ne correspond pas à ce scope.
      scope: { ...applied, matiere: row.matiere },
      segment: 'progression',
      progression: {
        matiere: row.matiere,
        semestre: row.semestre,
        fromSlot: transition.fromSlot,
        toSlot: transition.toSlot,
        fromLabel: transition.fromLabel,
        toLabel: transition.toLabel,
        outcome,
      },
    })
  }

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

          {/* Progression intra-semestre — signal précoce, avant S1 → S2. */}
          {(details?.progression || []).length > 0 ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.text, fontFamily: fontBold }]}>
                {t('admin.controlProgression')}
              </Text>
              <Text style={[styles.progressionLead, { color: theme.textSoft, fontFamily: fontSemi }]}>
                {t('admin.controlProgressionLead')}
              </Text>
              {details!.progression.map(row => (
                <View key={`${row.matiere}-${row.semestre}`} style={[styles.progressionBlock, { borderTopColor: theme.border }]}>
                  <View style={[styles.rowBetween, isAr && styles.rowReverse]}>
                    <Text numberOfLines={1} style={[styles.progressionTitle, { color: theme.text, fontFamily: fontBold }]}>
                      {row.matiere} · {row.semestre}
                    </Text>
                    <Text style={[styles.coverageText, { color: theme.textMuted }]}>
                      {t('admin.componentsCoverage', {
                        entered: row.componentsEntered,
                        expected: row.componentsExpected,
                        percent: row.coverageRate,
                      })}
                    </Text>
                  </View>
                  {row.controls.length > 0 ? (
                    <Text style={[styles.controlSequence, { color: theme.textSoft }]}>
                      {row.controls
                        .map(control => `${control.label} ${control.average}/20 · n=${control.entered}`)
                        .join('   |   ')}
                    </Text>
                  ) : null}
                  {(row.transitions || []).length === 0 ? (
                    <Text style={[styles.noComparison, { color: theme.textMuted, fontFamily: fontSemi }]}>
                      {t('admin.noComparisonYet')}
                    </Text>
                  ) : (row.transitions || []).map(transition => {
                    const deltaColor = transition.delta > 0
                      ? theme.success
                      : transition.delta < 0 ? theme.danger : theme.textSoft
                    const deltaSurface = transition.delta > 0
                      ? theme.successSurface
                      : transition.delta < 0 ? theme.dangerSurface : theme.surfaceAlt
                    return (
                      <View
                        key={`${transition.fromSlot}-${transition.toSlot}`}
                        style={[styles.transitionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      >
                        <View style={[styles.rowBetween, isAr && styles.rowReverse]}>
                          <Text numberOfLines={2} style={[styles.transitionTitle, { color: theme.text, fontFamily: fontBold }]}>
                            {transition.fromLabel} → {transition.toLabel}
                          </Text>
                          <View style={[styles.deltaPill, { backgroundColor: deltaSurface }]}>
                            <Text style={{ color: deltaColor, fontFamily: theme.fonts.bold, fontSize: 11 }}>
                              {transition.delta > 0 ? '+' : ''}{transition.delta} pt
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.transitionAverage, { color: theme.textSoft, fontFamily: fontSemi }]}>
                          {transition.fromAverage}/20 → {transition.toAverage}/20 · {t('admin.comparableStudents', {
                            count: transition.comparableStudents,
                          })}
                        </Text>
                        <View style={styles.progressionMetrics}>
                          <ProgressionOutcome
                            label={t('admin.progressedCount', { count: transition.improved })}
                            color={theme.success}
                            onPress={() => openProgression(row, transition, 'improved')}
                          />
                          <ProgressionOutcome
                            label={t('admin.stableCount', { count: transition.stable })}
                            color={theme.textSoft}
                            onPress={() => openProgression(row, transition, 'stable')}
                          />
                          <ProgressionOutcome
                            label={t('admin.declinedCount', { count: transition.declined })}
                            color={theme.danger}
                            onPress={() => openProgression(row, transition, 'declined')}
                          />
                        </View>
                      </View>
                    )
                  })}
                  <Text style={[styles.formulaText, { color: theme.textMuted }]}>
                    {translatedFormula(row.formula, row.integratedWeight, t)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {!matiere ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.text, fontFamily: fontBold }]}>{t('admin.bySubject')}</Text>
              {stats.subjects.length === 0 ? (
                <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 8 }}>{t('common.noData')}</Text>
              ) : stats.subjects.map(subject => {
                const tint = tintFor(subject.avgEq, theme)
                const displayBareme = classeParam ? baremeOf(classeParam) : 20
                const displayAvg = subject.avgEq == null
                  ? null
                  : classeParam ? round1(subject.avgEq * (displayBareme / 20)) : subject.avgEq
                return (
                  <Pressable
                    key={subject.matiere}
                    onPress={() => navigation.navigate('AdminMatiereDetail', {
                      matiere: subject.matiere,
                      classe: classeParam || undefined,
                      scope: details?.applied || scope,
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
                      {subject.avgEq != null ? (
                        <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
                          <View style={[styles.progressFill, { width: `${Math.max(3, Math.min(100, (subject.avgEq / 20) * 100))}%`, backgroundColor: tint }]} />
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.classNums}>
                      <Text style={{ color: tint, fontFamily: theme.fonts.black, fontSize: 16, fontVariant: ['tabular-nums'] }}>
                        {displayAvg == null ? '—' : (
                          <>{displayAvg}<Text style={{ fontSize: 11, color: theme.textMuted }}>/{displayBareme}</Text></>
                        )}
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: fontSemi, fontSize: 10.5 }}>
                        {subject.success == null ? '—' : `${subject.success}%`} · {subject.studentCount} {t('admin.eleves').toLowerCase()} · {subject.notesCount} {t('admin.notesShort')}
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
                      scope: details?.applied || scope,
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
                      {c.avgEq != null ? (
                        <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
                          <View style={[styles.progressFill, { width: `${Math.max(3, Math.min(100, (c.avgEq / 20) * 100))}%`, backgroundColor: tint }]} />
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.classNums}>
                      <Text style={{ color: tint, fontFamily: theme.fonts.black, fontSize: 16, fontVariant: ['tabular-nums'] }}>
                        {c.avg == null ? '—' : (
                          <>{c.avg}<Text style={{ fontSize: 11, color: theme.textMuted }}>/{c.bareme}</Text></>
                        )}
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: fontSemi, fontSize: 10.5 }}>
                        {c.success == null ? '—' : `${c.success}%`} · {c.gradedCount}/{c.enrolledCount} {t('admin.eleves').toLowerCase()}
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
                const classes = p.classes.length > 0 ? p.classes.join(' · ') : '—'
                return (
                  <View key={p.id} style={[styles.teacherRow, { borderBottomColor: theme.border }, isAr && styles.rowReverse]}>
                    <View style={[styles.teacherIcon, { backgroundColor: theme.infoSurface }]}>
                      <GraduationCap size={15} color={theme.info} strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, marginStart: 10 }}>
                      <Text numberOfLines={1} style={{ color: theme.text, fontFamily: fontBold, fontSize: 13.5 }}>
                        {`${p.prenom || ''} ${p.nom || ''}`.trim() || p.matiere || t('admin.profs')}
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
            ) : stats.weakest.length === 0 ? (
              <View style={[styles.rowStart, { marginTop: 8 }]}>
                <CheckCircle2 size={15} color={theme.success} strokeWidth={2.2} />
                <Text style={{ color: theme.success, fontFamily: fontSemi, fontSize: 13, marginStart: 6 }}>
                  {t('admin.noStrugglingStudents')}
                </Text>
              </View>
            ) : (
              <>
                {stats.weakest.map(w => (
                  <Pressable
                    key={w.id}
                    onPress={() => {
                      const applied = details?.applied || scope
                      if (applied) navigation.navigate('AdminStudentFile', { eleveId: w.id, scope: applied })
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={w.nom}
                    accessibilityHint={t('admin.statsOpenStudentFile')}
                    style={({ pressed }) => [
                      styles.teacherRow,
                      { borderBottomColor: theme.border },
                      isAr && styles.rowReverse,
                      pressed && styles.pressed,
                    ]}
                  >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontFamily: fontBold, fontSize: 13.5 }}>{w.nom}</Text>
                    <Text numberOfLines={1} style={{ color: theme.textSoft, fontFamily: fontSemi, fontSize: 11.5, marginTop: 1 }}>
                      {w.classe}
                    </Text>
                  </View>
                  <Text style={{ color: theme.danger, fontFamily: theme.fonts.black, fontSize: 15, fontVariant: ['tabular-nums'] }}>
                    {w.note}<Text style={{ fontSize: 10.5, color: theme.textMuted }}>/20</Text>
                  </Text>
                  <ChevronRight size={14} color={theme.textMuted} style={{ marginStart: 7 }} />
                </Pressable>
                ))}
                {stats.weakTotal > stats.weakest.length ? (
                  <Pressable
                    onPress={() => {
                      const applied = details?.applied || scope
                      if (applied) navigation.navigate('AdminScopeStudents', { scope: applied, segment: 'threshold' })
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.seeAllButton, pressed && styles.pressed]}
                  >
                    <Text style={{ color: theme.primary, fontFamily: fontBold, fontSize: 12.5 }}>
                      {t('common.seeAll')} ({stats.weakTotal})
                    </Text>
                    <ChevronRight size={14} color={theme.primary} strokeWidth={2.4} />
                  </Pressable>
                ) : null}
              </>
            )}
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

function ProgressionOutcome({ label, color, onPress }: {
  label: string
  color: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.progressionMetricButton, pressed && styles.pressed]}
    >
      <Text style={[styles.progressionMetric, { color }]}>{label}</Text>
      <ChevronRight size={11} color={color} />
    </Pressable>
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
  progressionLead: { fontSize: 11.5, lineHeight: 17, marginTop: 4 },
  progressionBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 10, gap: 6 },
  progressionTitle: { flex: 1, fontSize: 12.5, marginEnd: 8 },
  controlSequence: { fontSize: 10.5, fontWeight: '700', lineHeight: 17 },
  noComparison: { fontSize: 11.5, lineHeight: 17, paddingVertical: 5 },
  transitionCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 9, gap: 5 },
  transitionTitle: { flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 16, marginEnd: 8 },
  transitionAverage: { fontSize: 10.5, lineHeight: 15 },
  progressionMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  progressionMetricButton: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 7,
    borderRadius: 8,
  },
  progressionMetric: { fontSize: 10, fontWeight: '800' },
  coverageText: { fontSize: 9.5, fontWeight: '700' },
  formulaText: { fontSize: 9.5, fontWeight: '600', lineHeight: 14 },

  classRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  weakPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, marginStart: 8 },
  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 7 },
  progressFill: { height: '100%', borderRadius: 999 },
  classNums: { alignItems: 'flex-end', flexShrink: 0, maxWidth: 120 },

  teacherRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  teacherIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  seeAllButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 10 },
})
