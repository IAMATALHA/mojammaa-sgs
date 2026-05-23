/**
 * ParentNotesScreen — bulletin scolaire par enfant.
 *
 * - Sélecteur d'enfant en haut (chips).
 * - Carte récap : moyenne générale, rang, mention.
 * - Liste des matières : moyenne enfant vs classe + tendance + commentaire.
 */

import React, { useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import {
  Award, TrendingUp, TrendingDown, Minus, Trophy, FileText,
} from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { Card, EmptyState, SectionHeader } from '../../components/dashboard'
import {
  PARENT_CHILDREN, PARENT_REPORTS,
  type SubjectGrade,
} from '../../utils/mockData'

const HONOR_LABEL: Record<string, { label: string; tint: 'success' | 'info' | 'warning' }> = {
  felicitations:  { label: 'Félicitations',   tint: 'success' },
  encouragements: { label: 'Encouragements',  tint: 'info'    },
  avertissement:  { label: 'Avertissement',   tint: 'warning' },
}

export default function ParentNotesScreen() {
  const theme = useTheme()
  const [selectedChildId, setSelectedChildId] = useState<string>(PARENT_CHILDREN[0]?.id ?? '')

  const selectedChild  = useMemo(
    () => PARENT_CHILDREN.find(c => c.id === selectedChildId),
    [selectedChildId],
  )
  const report = useMemo(
    () => PARENT_REPORTS.find(r => r.childId === selectedChildId),
    [selectedChildId],
  )

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={{
          color: theme.text,
          fontFamily: theme.fonts.black,
          fontSize: theme.fontSize.h2,
          letterSpacing: -0.5,
        }}>
          Bulletin
        </Text>
        <Text style={{
          color: theme.textSoft,
          fontFamily: theme.fonts.regular,
          fontSize: theme.fontSize.small,
          marginTop: 2,
        }}>
          {report?.term ?? '—'}
        </Text>
      </View>

      {/* Child chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {PARENT_CHILDREN.map(c => (
          <Pressable
            key={c.id}
            onPress={() => setSelectedChildId(c.id)}
            android_ripple={{ color: theme.border }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selectedChildId === c.id ? c.avatarColor : theme.surface,
                borderColor:     selectedChildId === c.id ? c.avatarColor : theme.border,
              },
              pressed && { opacity: 0.88 },
            ]}
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
        {!report ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <EmptyState
                icon={FileText}
                title="Pas encore de bulletin"
                message="Le bulletin sera disponible à la fin du trimestre."
              />
            </Card>
          </View>
        ) : (
          <>
            {/* Récap card */}
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
                      Moyenne générale
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
                      RANG
                    </Text>
                  </View>
                </View>

                {report.honor ? (
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

            {/* Subjects */}
            <View style={styles.section}>
              <SectionHeader
                title="Détail par matière"
                subtitle={`${report.subjects.length} matière${report.subjects.length > 1 ? 's' : ''}`}
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

function SubjectRow({
  grade, isLast, theme,
}: { grade: SubjectGrade; isLast: boolean; theme: any }) {
  const diff = grade.average - grade.classAvg
  const TrendIcon = grade.trend === 'up' ? TrendingUp
                  : grade.trend === 'down' ? TrendingDown
                  : Minus
  const trendColor = grade.trend === 'up'   ? theme.success
                   : grade.trend === 'down' ? theme.danger
                   : theme.textSoft

  return (
    <View style={[
      styles.subjectRow,
      !isLast && { borderBottomWidth: 1, borderBottomColor: theme.border },
    ]}>
      <View style={{ flex: 1 }}>
        <Text style={{
          color: theme.text,
          fontFamily: theme.fonts.bold,
          fontSize: 14,
        }}>
          {grade.subject}
        </Text>
        <Text style={{
          color: theme.textSoft,
          fontFamily: theme.fonts.regular,
          fontSize: 11,
          marginTop: 2,
        }}>
          {grade.teacher} · moy. classe {grade.classAvg.toFixed(1)}
        </Text>
        {grade.comment ? (
          <Text
            numberOfLines={2}
            style={{
              color: theme.textMuted,
              fontFamily: theme.fonts.regular,
              fontSize: 11.5,
              fontStyle: 'italic',
              marginTop: 4,
            }}
          >
            « {grade.comment} »
          </Text>
        ) : null}
      </View>

      <View style={styles.gradeBlock}>
        <Text style={{
          color: theme.text,
          fontFamily: theme.fonts.black,
          fontSize: 20,
          letterSpacing: -0.5,
        }}>
          {grade.average.toFixed(1)}
        </Text>
        <View style={styles.trendRow}>
          <TrendIcon size={11} color={trendColor} strokeWidth={2.4} />
          <Text style={{
            color: trendColor,
            fontFamily: theme.fonts.semibold,
            fontSize: 10.5,
            marginStart: 3,
          }}>
            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  chips:  { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1,
    marginEnd: 6,
  },
  scroll:  { paddingBottom: 32 },
  section: { paddingHorizontal: 20, marginTop: 22 },
  recapRow: { flexDirection: 'row', alignItems: 'center' },
  rankBadge: {
    width: 76, height: 76, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  honor: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, marginTop: 14,
    alignSelf: 'flex-start',
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       12,
  },
  gradeBlock: {
    alignItems: 'flex-end',
    marginStart: 12,
  },
  trendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
})
