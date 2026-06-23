import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import {
  Award, TrendingUp, TrendingDown, Minus, Trophy, FileText,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { Card, EmptyState, SectionHeader } from '../../components/dashboard'
import { useParentData } from '../../hooks/useParentData'
import { useParentNotes, type SubjectGradeReal } from '../../hooks/useParentNotes'
import ScreenBackground from '../../components/ScreenBackground'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'

export default function ParentNotesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()

  const HONOR_LABEL: Record<string, { label: string; tint: 'success' | 'info' | 'warning' }> = {
    felicitations:  { label: t('parent.felicitations'), tint: 'success' },
    encouragements: { label: t('parent.encouragements'), tint: 'info'    },
    avertissement:  { label: t('parent.avertissement'),  tint: 'warning' },
  }
  const parent = useParentData()
  const [selectedChildId, setSelectedChildId] = useState<string>('')

  useEffect(() => {
    if (parent.children.length > 0 && !selectedChildId) {
      setSelectedChildId(parent.children[0].id)
    }
  }, [parent.children, selectedChildId])

  const selectedChild = useMemo(
    () => parent.children.find(c => c.id === selectedChildId),
    [parent.children, selectedChildId],
  )
  const selectedEleve = useMemo(
    () => parent.eleves.find(e => e.codeMassar === selectedChildId),
    [parent.eleves, selectedChildId],
  )

  const { loading, error, report } = useParentNotes(selectedChildId, selectedEleve?.classe)

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />
      <ScreenBackground />

      <View style={styles.header}>
        <Text style={{
          color: theme.text,
          fontFamily: theme.fonts.black,
          fontSize: theme.fontSize.h2,
          letterSpacing: -0.5,
        }}>
          {t('parent.bulletin')}
        </Text>
        <Text style={{
          color: theme.textSoft,
          fontFamily: theme.fonts.regular,
          fontSize: theme.fontSize.small,
          marginTop: 2,
        }}>
          {report?.semestre ? `Semestre ${report.semestre}` : '—'}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.chips}
      >
        {parent.children.map(c => (
          <Pressable
            key={c.id}
            onPress={() => setSelectedChildId(c.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedChildId === c.id }}
            accessibilityLabel={c.firstName}
            style={[styles.chip, {
              backgroundColor: selectedChildId === c.id ? c.avatarColor : theme.surface,
              borderColor: selectedChildId === c.id ? c.avatarColor : theme.border,
            }]}
          >
            <Text style={{
              color: selectedChildId === c.id ? '#fff' : theme.text,
              fontFamily: theme.fonts.semibold,
              fontSize: 12.5,
            }}>
              {c.firstName}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {(error || parent.error) && !report ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <MessagesErrorBanner messageKey="common.dataLoadError" />
          </View>
        ) : null}
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : !report ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <EmptyState
                icon={FileText}
                title={t('parent.noBulletin')}
                message={t('parent.bulletinAvailable')}
              />
            </Card>
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: 20 }}>
              <Card padding={18}>
                <View style={styles.recapRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      color: theme.textSoft,
                      fontFamily: theme.fonts.medium,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 0.6,
                    }}>
                      {t('parent.generalAvg')}
                    </Text>
                    <Text style={{
                      color: theme.text,
                      fontFamily: theme.fonts.black,
                      fontSize: 36,
                      letterSpacing: -1,
                      marginTop: 2,
                    }}>
                      {report.generalAvg.toFixed(1)}
                      <Text style={{
                        color: theme.textSoft,
                        fontFamily: theme.fonts.medium,
                        fontSize: 16,
                      }}>
                        {' '}/ 20
                      </Text>
                    </Text>
                  </View>
                  <View style={[styles.rankBadge, { backgroundColor: theme.primarySurface }]}>
                    <Trophy size={16} color={theme.primary} strokeWidth={2.2} />
                    <Text style={{
                      color: theme.primary,
                      fontFamily: theme.fonts.bold,
                      fontSize: 14,
                      marginTop: 4,
                    }}>
                      {report.rank}
                    </Text>
                    <Text style={{
                      color: theme.primary,
                      fontFamily: theme.fonts.medium,
                      fontSize: 9.5,
                      letterSpacing: 0.5,
                    }}>
                      {t('parent.rank')}
                    </Text>
                  </View>
                </View>

                {report.honor && HONOR_LABEL[report.honor] ? (
                  <View style={[
                    styles.honor,
                    { backgroundColor: theme[`${HONOR_LABEL[report.honor].tint}Surface` as keyof typeof theme] as string },
                  ]}>
                    <Award size={14} color={theme[HONOR_LABEL[report.honor].tint as keyof typeof theme] as string} strokeWidth={2.2} />
                    <Text style={{
                      color: theme[HONOR_LABEL[report.honor].tint as keyof typeof theme] as string,
                      fontFamily: theme.fonts.bold,
                      fontSize: 12,
                      letterSpacing: 0.4,
                      marginStart: 6,
                    }}>
                      {HONOR_LABEL[report.honor].label.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
              </Card>
            </View>

            <View style={styles.section}>
              <SectionHeader
                title={t('parent.subjectDetail')}
                subtitle={t('parent.subjectCount', { count: report.subjects.length })}
              />
              <Card padding={4}>
                {report.subjects.map((s, idx) => (
                  <SubjectRow
                    key={s.subject}
                    grade={s}
                    isLast={idx === report.subjects.length - 1}
                    theme={theme}
                  />
                ))}
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function SubjectRow({ grade, isLast, theme }: { grade: SubjectGradeReal; isLast: boolean; theme: Theme }) {
  const { t } = useTranslation()
  const diff = grade.average - grade.classAvg
  const TrendIcon = grade.trend === 'up' ? TrendingUp : grade.trend === 'down' ? TrendingDown : Minus
  const trendColor = grade.trend === 'up' ? theme.success : grade.trend === 'down' ? theme.danger : theme.textSoft

  return (
    <View style={[styles.subjectRow, !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 14 }}>{grade.subject}</Text>
        <Text style={{ color: theme.textSoft, fontFamily: theme.fonts.regular, fontSize: 11, marginTop: 2 }}>
          {t('parent.classAvg', { avg: grade.classAvg.toFixed(1) })}
        </Text>
      </View>
      <View style={styles.gradeBlock}>
        <Text style={{ color: theme.text, fontFamily: theme.fonts.black, fontSize: 20, letterSpacing: -0.5 }}>
          {grade.average.toFixed(1)}
        </Text>
        <View style={styles.trendRow}>
          <TrendIcon size={11} color={trendColor} strokeWidth={2.4} />
          <Text style={{ color: trendColor, fontFamily: theme.fonts.semibold, fontSize: 10.5, marginStart: 3 }}>
            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  chips: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, marginEnd: 6 },
  scroll: { paddingBottom: 32 },
  section: { paddingHorizontal: 20, marginTop: 22 },
  recapRow: { flexDirection: 'row', alignItems: 'center' },
  rankBadge: { width: 76, height: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  honor: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginTop: 14, alignSelf: 'flex-start' },
  subjectRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  gradeBlock: { alignItems: 'flex-end', marginStart: 12 },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
})
