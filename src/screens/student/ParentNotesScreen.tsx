import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import {
  FileText,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { AcademicReportCard, Card, EmptyState } from '../../components/dashboard'
import CompetenceReportCard from '../../components/dashboard/CompetenceReportCard'
import { useParentData } from '../../hooks/useParentData'
import { useParentNotes } from '../../hooks/useParentNotes'
import ScreenBackground from '../../components/ScreenBackground'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'

export default function ParentNotesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()

  const parent = useParentData()
  const [selectedChildId, setSelectedChildId] = useState<string>('')
  const [scope, setScope] = useState<'semester' | 'academicYear'>('semester')

  useEffect(() => {
    // Sélection invalide (enfant délié/retiré en cours de session) → rabat sur
    // le premier enfant, sinon la requête notes devient interdite (rules) et
    // l'écran affiche à tort « erreur de connexion / pas de notes ».
    if (parent.children.length > 0 && (!selectedChildId || !parent.children.some(c => c.id === selectedChildId))) {
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

  const { loading, error, report, competenceReport } = useParentNotes(selectedChildId, selectedEleve?.classe, scope)

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
          {report?.semestre ? `Semestre ${report.semestre}` : competenceReport ? 'Compétences' : '—'}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // flexShrink: 0 — sinon Yoga écrase cette rangée (hors du scroll
        // vertical) et les noms des enfants sont coupés à mi-hauteur.
        style={styles.chipScroll}
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

      <View style={styles.scopeRow}>
        <Pressable
          onPress={() => setScope('semester')}
          accessibilityRole="button"
          accessibilityState={{ selected: scope === 'semester' }}
          style={[styles.scopeChip, { backgroundColor: scope === 'semester' ? theme.primary : theme.surface, borderColor: scope === 'semester' ? theme.primary : theme.border }]}
        >
          <Text style={{ color: scope === 'semester' ? '#fff' : theme.text, fontFamily: theme.fonts.semibold, fontSize: 12 }}>
            {t('parent.currentSemester')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setScope('academicYear')}
          accessibilityRole="button"
          accessibilityState={{ selected: scope === 'academicYear' }}
          style={[styles.scopeChip, { backgroundColor: scope === 'academicYear' ? theme.primary : theme.surface, borderColor: scope === 'academicYear' ? theme.primary : theme.border }]}
        >
          <Text style={{ color: scope === 'academicYear' ? '#fff' : theme.text, fontFamily: theme.fonts.semibold, fontSize: 12 }}>
            {t('parent.viewAcademicYear')}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {(error || parent.error) && !report && !competenceReport ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <MessagesErrorBanner messageKey="common.dataLoadError" />
          </View>
        ) : null}
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : !report && !competenceReport ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Card>
              <EmptyState
                icon={FileText}
                title={t('parent.noBulletin')}
                message={t('parent.bulletinAvailable')}
              />
            </Card>
          </View>
        ) : competenceReport && !report ? (
          <CompetenceReportCard report={competenceReport} />
        ) : (
          <AcademicReportCard report={report!} />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  chipScroll: { flexGrow: 0, flexShrink: 0, minHeight: 58 },
  chips: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 14, gap: 8, alignItems: 'center' },
  chip: { minHeight: 38, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1, marginEnd: 6 },
  scopeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  scopeChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  scroll: { paddingBottom: 32 },
})
