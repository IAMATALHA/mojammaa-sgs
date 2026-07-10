import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import Svg, { Circle } from 'react-native-svg'
import {
  Award, BookOpen, CheckCircle2, ChevronDown, CircleHelp, Target, TrendingDown, TrendingUp, Trophy,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import type { ChildReportReal, SubjectGradeReal } from '../../hooks/useParentNotes'
import { hexWithAlpha } from '../../utils/format'

interface AcademicReportCardProps {
  report: ChildReportReal
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const round1 = (value: number) => Math.round(value * 10) / 10

function gradeTint(value: number, theme: Theme, bareme = 20) {
  const v = value * (20 / bareme)   // seuils calibrés /20 quel que soit le barème
  if (v < 10) return theme.danger
  if (v < 12) return theme.warning
  return theme.success
}

type ReportTone = {
  colors: [string, string, string]
  locations: [number, number, number]
  badgeBg: string
  badgeBorder: string
  glowA: string
  glowB: string
  pillBg: string
  pillBorder: string
  statBg: string
  statBorder: string
  ringTrack: string
  ringStroke: string
}

function reportTone(score: number, bareme: number): ReportTone {
  const v = score * (20 / bareme)

  if (v < 10) {
    return {
      colors: ['#6D2638', '#B9404C', '#E66F54'],
      locations: [0, 0.58, 1],
      badgeBg: 'rgba(255,255,255,0.14)',
      badgeBorder: 'rgba(255,255,255,0.22)',
      glowA: 'rgba(255, 218, 205, 0.2)',
      glowB: 'rgba(255, 255, 255, 0.13)',
      pillBg: 'rgba(255,255,255,0.15)',
      pillBorder: 'rgba(255,255,255,0.24)',
      statBg: 'rgba(255,255,255,0.12)',
      statBorder: 'rgba(255,255,255,0.2)',
      ringTrack: 'rgba(255,255,255,0.2)',
      ringStroke: '#FFF4F0',
    }
  }

  if (v < 12) {
    return {
      colors: ['#72511C', '#BF7A24', '#E4B34B'],
      locations: [0, 0.58, 1],
      badgeBg: 'rgba(255,255,255,0.15)',
      badgeBorder: 'rgba(255,255,255,0.24)',
      glowA: 'rgba(255, 236, 180, 0.22)',
      glowB: 'rgba(255, 255, 255, 0.13)',
      pillBg: 'rgba(255,255,255,0.15)',
      pillBorder: 'rgba(255,255,255,0.24)',
      statBg: 'rgba(255,255,255,0.13)',
      statBorder: 'rgba(255,255,255,0.22)',
      ringTrack: 'rgba(255,255,255,0.22)',
      ringStroke: '#FFF8E6',
    }
  }

  return {
    colors: ['#135C4A', '#21866E', '#7DBB61'],
    locations: [0, 0.56, 1],
    badgeBg: 'rgba(255,255,255,0.16)',
    badgeBorder: 'rgba(255,255,255,0.25)',
    glowA: 'rgba(221, 255, 224, 0.24)',
    glowB: 'rgba(255, 255, 255, 0.14)',
    pillBg: 'rgba(255,255,255,0.16)',
    pillBorder: 'rgba(255,255,255,0.25)',
    statBg: 'rgba(255,255,255,0.14)',
    statBorder: 'rgba(255,255,255,0.24)',
    ringTrack: 'rgba(255,255,255,0.24)',
    ringStroke: '#F3FFF5',
  }
}

export default function AcademicReportCard({ report }: AcademicReportCardProps) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const summary = useMemo(() => {
    const subjects = report.subjects
    const classAvg = subjects.length > 0
      ? round1(subjects.reduce((sum, subject) => sum + subject.classAvg, 0) / subjects.length)
      : report.generalAvg
    const classDelta = round1(report.generalAvg - classAvg)
    const strongSubjects = subjects.filter(subject => subject.average >= subject.classAvg).length
    const topSubject = [...subjects].sort((a, b) => b.average - a.average)[0]
    const focusSubject = [...subjects].sort(
      (a, b) => (a.average - a.classAvg) - (b.average - b.classAvg),
    )[0]

    return { classAvg, classDelta, strongSubjects, topSubject, focusSubject }
  }, [report])

  const honorLabel: Record<NonNullable<ChildReportReal['honor']>, { label: string; tint: string }> = {
    felicitations: { label: t('parent.felicitations'), tint: theme.success },
    encouragements: { label: t('parent.encouragements'), tint: theme.info },
    avertissement: { label: t('parent.avertissement'), tint: theme.warning },
  }

  const deltaKey = summary.classDelta > 0
    ? 'parent.aboveClassShort'
    : summary.classDelta < 0
      ? 'parent.belowClassShort'
      : 'parent.sameAsClass'
  const deltaText = summary.classDelta === 0
    ? t(deltaKey)
    : t(deltaKey, { value: Math.abs(summary.classDelta).toFixed(1) })
  const tone = useMemo(() => reportTone(report.generalAvg, report.bareme), [report.bareme, report.generalAvg])

  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 360 }}
      style={[styles.shell, { backgroundColor: theme.card }, theme.shadows.clay]}
    >
      <LinearGradient
        colors={tone.colors}
        locations={tone.locations}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View pointerEvents="none" style={[styles.heroGlowA, { backgroundColor: tone.glowA }]} />
        <View pointerEvents="none" style={[styles.heroGlowB, { backgroundColor: tone.glowB }]} />
        <View pointerEvents="none" style={styles.heroSheen} />

        <View style={[styles.heroTop, isAr && styles.rowReverse]}>
          <View style={[styles.heroCopy, isAr && styles.rtlBlock]}>
            <View style={[
              styles.heroLabelRow,
              { backgroundColor: tone.badgeBg, borderColor: tone.badgeBorder },
              isAr ? styles.selfEnd : styles.selfStart,
              isAr && styles.rowReverse,
            ]}>
              <BookOpen size={14} color="rgba(255,255,255,0.86)" strokeWidth={2.2} />
              <Text style={[styles.heroLabel, { fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                {t('parent.reportSummary')}
              </Text>
            </View>
            <Text style={[styles.heroTitle, { fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.black }]}>
              {t('parent.generalAvg')}
            </Text>
            <View style={[styles.scoreLine, isAr && styles.rowReverse]}>
              <Text style={[styles.scoreValue, { fontFamily: theme.fonts.black }]}>
                {report.generalAvg.toFixed(1)}
              </Text>
              <Text style={[styles.scoreMax, { fontFamily: theme.fonts.semibold }]}>/ {report.bareme}</Text>
            </View>
            {report.hasClassComparison ? (
              <View style={[
                styles.deltaPill,
                { backgroundColor: tone.pillBg, borderColor: tone.pillBorder },
                isAr && styles.selfEnd,
                isAr && styles.rowReverse,
              ]}>
                {summary.classDelta >= 0 ? (
                  <TrendingUp size={13} color="#fff" strokeWidth={2.4} />
                ) : (
                  <TrendingDown size={13} color="#fff" strokeWidth={2.4} />
                )}
                <Text style={[styles.deltaText, { fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                  {deltaText}
                </Text>
              </View>
            ) : null}
          </View>

          <ScoreRing
            score={report.generalAvg}
            bareme={report.bareme}
            label={t('parent.scoreProgress', { value: Math.round((report.generalAvg / report.bareme) * 100) })}
            theme={theme}
            tone={tone}
          />
        </View>

        <View style={[styles.heroStats, isAr && styles.rowReverse]}>
          <HeroStat icon={Trophy} label={t('parent.rank')} value={report.rank} theme={theme} tone={tone} />
          <HeroStat icon={CircleHelp} label={t('parent.semester')} value={report.semestre || '—'} theme={theme} tone={tone} />
          <HeroStat
            icon={CheckCircle2}
            label={report.hasClassComparison ? t('parent.strongSubjects') : t('parent.subjectDetail')}
            value={report.hasClassComparison ? `${summary.strongSubjects}/${report.subjects.length}` : String(report.subjects.length)}
            theme={theme}
            tone={tone}
          />
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {report.honor && honorLabel[report.honor] ? (
          <View style={[
            styles.honor,
            {
              backgroundColor: hexWithAlpha(honorLabel[report.honor].tint, 0.13),
              borderColor: hexWithAlpha(honorLabel[report.honor].tint, 0.2),
            },
            isAr && styles.rowReverse,
          ]}>
            <Award size={15} color={honorLabel[report.honor].tint} strokeWidth={2.3} />
            <Text
              style={[
                styles.honorText,
                {
                  color: honorLabel[report.honor].tint,
                  fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold,
                },
              ]}
            >
              {honorLabel[report.honor].label}
            </Text>
          </View>
        ) : null}

        <View style={[styles.insightRow, isAr && styles.rowReverse]}>
          <InsightTile
            label={t('parent.topSubject')}
            value={summary.topSubject?.subject || '—'}
            detail={summary.topSubject ? `${summary.topSubject.average.toFixed(1)} / ${report.bareme}` : '—'}
            color={theme.success}
            theme={theme}
            alignRight={isAr}
          />
          <InsightTile
            label={t('parent.focusSubject')}
            value={summary.focusSubject?.subject || '—'}
            detail={summary.focusSubject ? `${summary.focusSubject.average.toFixed(1)} / ${report.bareme}` : '—'}
            color={theme.warning}
            theme={theme}
            alignRight={isAr}
          />
        </View>

        <View style={[styles.subjectHeader, isAr && styles.rowReverse]}>
          <View style={isAr && styles.rtlBlock}>
            <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}>
              {t('parent.subjectDetail')}
            </Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.regular }]}>
              {t('parent.subjectCount', { count: report.subjects.length })}
            </Text>
          </View>
          {report.hasClassComparison ? (
            <View style={[styles.benchmarkBadge, { backgroundColor: theme.primarySurface }, isAr && styles.rowReverse]}>
              <Target size={13} color={theme.primary} strokeWidth={2.3} />
              <Text style={[styles.benchmarkText, { color: theme.primary, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.semibold }]}>
                {t('parent.classComparison')}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.subjectList}>
          {report.subjects.map((subject, index) => (
            <SubjectGradeRow
              key={subject.subject}
              grade={subject}
              bareme={report.bareme}
              isLast={index === report.subjects.length - 1}
              theme={theme}
              isAr={isAr}
              hasClassComparison={report.hasClassComparison}
            />
          ))}
        </View>
      </View>
    </MotiView>
  )
}

function ScoreRing({
  score, bareme, label, theme, tone,
}: { score: number; bareme: number; label: string; theme: Theme; tone: ReportTone }) {
  const size = 112
  const stroke = 9
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const percentage = clamp(score / bareme, 0, 1)
  const offset = circumference * (1 - percentage)

  return (
    <View style={styles.ringWrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tone.ringTrack}
          strokeWidth={stroke}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tone.ringStroke}
          strokeWidth={stroke}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={[styles.ringScore, { fontFamily: theme.fonts.black }]}>{score.toFixed(1)}</Text>
        <Text numberOfLines={1} style={[styles.ringLabel, { fontFamily: theme.fonts.medium }]}>{label}</Text>
      </View>
    </View>
  )
}

function HeroStat({
  icon: Icon, label, value, theme, tone,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
  label: string
  value: string
  theme: Theme
  tone: ReportTone
}) {
  return (
    <View style={[styles.heroStat, { backgroundColor: tone.statBg, borderColor: tone.statBorder }]}>
      <Icon size={14} color="rgba(255,255,255,0.9)" strokeWidth={2.3} />
      <Text numberOfLines={1} style={[styles.heroStatValue, { fontFamily: theme.fonts.bold }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.heroStatLabel, { fontFamily: theme.fonts.medium }]}>{label}</Text>
    </View>
  )
}

function InsightTile({
  label, value, detail, color, theme, alignRight,
}: {
  label: string
  value: string
  detail: string
  color: string
  theme: Theme
  alignRight: boolean
}) {
  return (
    <View style={[styles.insightTile, { backgroundColor: hexWithAlpha(color, 0.1), borderColor: hexWithAlpha(color, 0.18) }]}>
      <Text
        numberOfLines={1}
        style={[
          styles.insightLabel,
          { color, fontFamily: alignRight ? theme.fonts.arabicSemi : theme.fonts.semibold, textAlign: alignRight ? 'right' : 'left' },
        ]}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.insightValue,
          { color: theme.text, fontFamily: alignRight ? theme.fonts.arabicBold : theme.fonts.bold, textAlign: alignRight ? 'right' : 'left' },
        ]}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.insightDetail,
          { color: theme.textSoft, fontFamily: theme.fonts.medium, textAlign: alignRight ? 'right' : 'left' },
        ]}
      >
        {detail}
      </Text>
    </View>
  )
}

function SubjectGradeRow({
  grade, bareme, isLast, theme, isAr, hasClassComparison,
}: {
  grade: SubjectGradeReal
  bareme: number
  isLast: boolean
  theme: Theme
  isAr: boolean
  hasClassComparison: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const diff = round1(grade.average - grade.classAvg)
  const tint = gradeTint(grade.average, theme, bareme)
  const progress = `${clamp((grade.average / bareme) * 100, 2, 100)}%` as DimensionValue
  const diffColor = diff > 0 ? theme.success : diff < 0 ? theme.danger : theme.textMuted
  const expandable = grade.controles.length > 0

  return (
    <Pressable
      onPress={expandable ? () => setOpen(o => !o) : undefined}
      accessibilityRole={expandable ? 'button' : undefined}
      accessibilityState={expandable ? { expanded: open } : undefined}
      style={[styles.subjectRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}
    >
      <View style={[styles.subjectTop, isAr && styles.rowReverse]}>
        <View style={[styles.subjectNameBlock, isAr && styles.rtlBlock]}>
          <Text
            numberOfLines={1}
            style={[styles.subjectName, { color: theme.text, fontFamily: isAr ? theme.fonts.arabicBold : theme.fonts.bold }]}
          >
            {grade.subject}
          </Text>
          {hasClassComparison ? (
            <Text
              numberOfLines={1}
              style={[styles.subjectMeta, { color: theme.textSoft, fontFamily: isAr ? theme.fonts.arabicSemi : theme.fonts.regular }]}
            >
              {t('parent.classAvg', { avg: grade.classAvg.toFixed(1) })}
            </Text>
          ) : null}
        </View>
        <View style={[styles.gradeBlock, isAr && { alignItems: 'flex-start', marginStart: 0, marginEnd: 12 }]}>
          <Text style={[styles.gradeValue, { color: tint, fontFamily: theme.fonts.black }]}>
            {grade.average.toFixed(1)}
          </Text>
          {hasClassComparison ? (
            <Text style={[styles.gradeDiff, { color: diffColor, fontFamily: theme.fonts.semibold }]}>
              {diff > 0 ? '+' : ''}{diff.toFixed(1)}
            </Text>
          ) : null}
        </View>
        {expandable && (
          <ChevronDown
            size={15} color={theme.textMuted} strokeWidth={2.2}
            style={{ marginStart: 8, transform: [{ rotate: open ? '180deg' : '0deg' }] }}
          />
        )}
      </View>
      <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
        <View style={[styles.progressFill, { width: progress, backgroundColor: tint }]} />
      </View>
      {open && (
        <View style={[styles.controlsRow, isAr && styles.rowReverse]}>
          {grade.controles.map((c, i) => (
            <View key={i} style={[styles.controlChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.controlChipLabel, { color: theme.textSoft, fontFamily: theme.fonts.medium }]}>C{i + 1}</Text>
              <Text style={[styles.controlChipValue, { color: gradeTint(c, theme, bareme), fontFamily: theme.fonts.bold }]}>
                {Math.round(c * 100) / 100}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 28,
    marginHorizontal: 20,
    overflow: 'hidden',
  },
  hero: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  heroGlowA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -72,
    right: -44,
  },
  heroGlowB: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    bottom: -48,
    left: -28,
  },
  heroSheen: {
    position: 'absolute',
    width: 88,
    height: 260,
    top: -54,
    right: 92,
    backgroundColor: 'rgba(255,255,255,0.08)',
    transform: [{ rotate: '23deg' }],
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 11,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 24,
    marginTop: 8,
  },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 4,
    gap: 6,
  },
  scoreValue: {
    color: '#fff',
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  scoreMax: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 15,
    paddingBottom: 8,
  },
  deltaPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deltaText: {
    color: '#fff',
    fontSize: 11,
  },
  ringWrap: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  ringScore: {
    color: '#fff',
    fontSize: 22,
    lineHeight: 26,
    fontVariant: ['tabular-nums'],
  },
  ringLabel: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 9.5,
    marginTop: 1,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  heroStat: {
    flex: 1,
    minHeight: 68,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroStatValue: {
    color: '#fff',
    fontSize: 14,
    marginTop: 7,
    fontVariant: ['tabular-nums'],
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 9.5,
    marginTop: 2,
  },
  body: {
    padding: 16,
    gap: 16,
  },
  honor: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  honorText: {
    fontSize: 12,
  },
  insightRow: {
    flexDirection: 'row',
    gap: 10,
  },
  insightTile: {
    flex: 1,
    minHeight: 86,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  insightLabel: {
    fontSize: 10.5,
  },
  insightValue: {
    fontSize: 14,
    marginTop: 8,
  },
  insightDetail: {
    fontSize: 11,
    marginTop: 3,
  },
  subjectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  benchmarkBadge: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
  },
  benchmarkText: {
    fontSize: 10.5,
  },
  subjectList: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  subjectRow: {
    paddingVertical: 12,
  },
  subjectTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subjectNameBlock: {
    flex: 1,
    minWidth: 0,
  },
  subjectName: {
    fontSize: 14,
  },
  subjectMeta: {
    fontSize: 11,
    marginTop: 3,
  },
  gradeBlock: {
    alignItems: 'flex-end',
    marginStart: 12,
  },
  gradeValue: {
    fontSize: 20,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  gradeDiff: {
    fontSize: 10.5,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  controlChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  controlChipLabel: {
    fontSize: 10.5,
  },
  controlChipValue: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  rowReverse: {
    flexDirection: 'row-reverse',
  },
  selfStart: {
    alignSelf: 'flex-start',
  },
  selfEnd: {
    alignSelf: 'flex-end',
  },
  rtlBlock: {
    alignItems: 'flex-end',
  },
})
