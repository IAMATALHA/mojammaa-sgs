import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import { Check, RotateCcw } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'

type ChecklistSection = {
  id: string
  title: string
  items: { id: string; label: string }[]
}

const STORAGE_KEY = '@mojammaa/checklist/rentree-2026-2027'

const SECTIONS: ChecklistSection[] = [
  {
    id: 'administration',
    title: 'Administration',
    items: [
      { id: 'school-year', label: "Créer l'année scolaire 2026-2027" },
      { id: 'classes', label: 'Définir les niveaux, classes et groupes' },
      { id: 'school-profile', label: "Mettre à jour les informations de l'établissement" },
      { id: 'students-import', label: 'Importer les élèves et leurs responsables' },
      { id: 'incomplete-files', label: 'Vérifier les dossiers incomplets' },
      { id: 'class-placement', label: 'Affecter chaque élève à une classe' },
      { id: 'teachers-subjects', label: 'Ajouter les enseignants et leurs matières' },
      { id: 'fees', label: 'Définir les frais de scolarité et échéances' },
      { id: 'admin-documents', label: 'Préparer les documents administratifs' },
    ],
  },
  {
    id: 'pedagogy',
    title: 'Pédagogie',
    items: [
      { id: 'subjects', label: 'Créer les matières par niveau' },
      { id: 'coefficients', label: 'Vérifier les coefficients par niveau' },
      { id: 'teacher-assignments', label: 'Affecter les enseignants aux classes' },
      { id: 'schedule', label: 'Préparer les emplois du temps' },
      { id: 'hours', label: "Définir les horaires d'ouverture et de sortie" },
      { id: 'progressions', label: 'Préparer les progressions et objectifs' },
      { id: 'pedagogy-meetings', label: 'Organiser les réunions pédagogiques' },
    ],
  },
  {
    id: 'communication',
    title: 'Communication',
    items: [
      { id: 'welcome', label: 'Envoyer le message de bienvenue' },
      { id: 'key-dates', label: 'Informer les parents des dates importantes' },
      { id: 'supplies', label: 'Communiquer les horaires et listes de fournitures' },
      { id: 'announcements', label: 'Préparer les annonces de rentrée' },
      { id: 'notifications', label: 'Vérifier les canaux de notification' },
    ],
  },
  {
    id: 'logistics',
    title: 'Logistique',
    items: [
      { id: 'rooms', label: 'Préparer les salles et équipements' },
      { id: 'school-supplies', label: 'Vérifier les fournitures scolaires' },
      { id: 'welcome-flow', label: "Organiser l'accueil des élèves" },
      { id: 'badges', label: 'Préparer les badges ou cartes' },
      { id: 'security', label: 'Vérifier la sécurité et les accès' },
      { id: 'absence-process', label: 'Prévoir la gestion des absences' },
    ],
  },
  {
    id: 'mojammaa-checks',
    title: 'Vérification dans Mojammaa',
    items: [
      { id: 'admin-account', label: 'Tester les comptes administrateur' },
      { id: 'teacher-account', label: 'Tester les comptes enseignants' },
      { id: 'parent-access', label: "Tester l'accès parent" },
      { id: 'class-display', label: 'Vérifier les classes et élèves affichés' },
      { id: 'message-send', label: "Tester l'envoi d'un message" },
      { id: 'absence-entry', label: "Tester l'enregistrement d'une absence" },
      { id: 'grade-entry', label: "Tester l'ajout d'une note" },
      { id: 'payments', label: 'Vérifier les paiements et reçus' },
      { id: 'backup', label: 'Faire une sauvegarde avant la rentrée' },
    ],
  },
  {
    id: 'first-day',
    title: 'Jour de rentrée',
    items: [
      { id: 'teacher-presence', label: 'Confirmer la présence des enseignants' },
      { id: 'welcome-day', label: 'Accueillir les élèves et parents' },
      { id: 'class-lists', label: 'Vérifier les listes de classe' },
      { id: 'attendance-day', label: 'Enregistrer les absences' },
      { id: 'urgent-requests', label: 'Traiter les demandes urgentes' },
      { id: 'first-day-report', label: 'Envoyer un bilan de la première journée' },
    ],
  },
]

const VALID_TASK_IDS = new Set(SECTIONS.flatMap(section => section.items.map(item => item.id)))
const TOTAL_TASKS = VALID_TASK_IDS.size

function playSelectionHaptic() {
  Haptics.selectionAsync().catch(() => {})
}

export default function AdminBackToSchoolChecklistScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        const storedIds: unknown = raw ? JSON.parse(raw) : []
        if (mounted && Array.isArray(storedIds)) {
          setCompleted(new Set(storedIds.filter((id): id is string => typeof id === 'string' && VALID_TASK_IDS.has(id))))
        }
      } catch (error) {
        console.warn('[back-to-school-checklist] unable to load progress', error)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void load()
    return () => { mounted = false }
  }, [])

  const completion = Math.round((completed.size / TOTAL_TASKS) * 100)
  const completedBySection = useMemo(() => new Map(
    SECTIONS.map(section => [
      section.id,
      section.items.filter(item => completed.has(item.id)).length,
    ]),
  ), [completed])

  const save = async (next: Set<string>) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
    } catch (error) {
      console.warn('[back-to-school-checklist] unable to save progress', error)
    }
  }

  const toggleTask = (taskId: string) => {
    playSelectionHaptic()
    const next = new Set(completed)
    if (next.has(taskId)) next.delete(taskId)
    else next.add(taskId)
    setCompleted(next)
    void save(next)
  }

  const clearAll = () => {
    if (completed.size === 0) return
    playSelectionHaptic()
    const next = new Set<string>()
    setCompleted(next)
    void save(next)
  }

  return (
    <ScreenLayout title={t('checklist.navTitle')}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.eyebrow, { color: theme.textMuted, fontFamily: theme.fonts.bold }]}>MOJAMMAA · ANNÉE 2026-2027</Text>
        <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.black }]}>
          Checklist de préparation{`\n`}de la rentrée scolaire
        </Text>

        <View style={styles.progressRow}>
          <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: TOTAL_TASKS, now: completed.size }}>
            <View style={[styles.progressFill, { width: `${completion}%`, backgroundColor: theme.accent }]} />
          </View>
          <Text selectable style={[styles.progressCount, { color: theme.text, fontFamily: theme.fonts.bold }]}>{completed.size} / {TOTAL_TASKS}</Text>
          <Pressable
            disabled={completed.size === 0}
            onPress={clearAll}
            accessibilityRole="button"
            accessibilityLabel={t('checklist.clearAll')}
            style={({ pressed }) => [
              styles.clearButton,
              {
                backgroundColor: pressed ? theme.surfaceAlt : theme.surface,
                borderColor: theme.border,
                opacity: completed.size === 0 ? 0.45 : 1,
              },
            ]}
          >
            <RotateCcw size={14} color={theme.textMuted} strokeWidth={2.2} />
            <Text style={[styles.clearText, { color: theme.textMuted, fontFamily: theme.fonts.bold }]}>{t('checklist.clearAll')}</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
        ) : SECTIONS.map((section, sectionIndex) => {
          const done = completedBySection.get(section.id) ?? 0
          return (
            <View key={section.id} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Text style={[styles.sectionNumber, { color: theme.primary, fontFamily: theme.fonts.black }]}>{String(sectionIndex + 1).padStart(2, '0')}</Text>
                  <Text style={[styles.sectionTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>{section.title}</Text>
                </View>
                <Text selectable style={[styles.sectionCount, { color: theme.textMuted, fontFamily: theme.fonts.bold }]}>{done}/{section.items.length}</Text>
              </View>
              <View style={[styles.sectionRule, { backgroundColor: theme.text }]} />

              {section.items.map(item => {
                const checked = completed.has(item.id)
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleTask(item.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={item.label}
                    style={({ pressed }) => [
                      styles.taskRow,
                      { borderBottomColor: theme.border, backgroundColor: pressed ? theme.surfaceAlt : 'transparent' },
                    ]}
                  >
                    <View style={[
                      styles.checkbox,
                      { borderColor: checked ? theme.success : theme.textMuted, backgroundColor: checked ? theme.success : 'transparent' },
                    ]}>
                      {checked ? <Check size={15} color="#fff" strokeWidth={3} /> : null}
                    </View>
                    <Text selectable style={[
                      styles.taskLabel,
                      { color: checked ? theme.textMuted : theme.text, fontFamily: theme.fonts.medium },
                      checked && styles.taskLabelDone,
                    ]}>{item.label}</Text>
                  </Pressable>
                )
              })}
            </View>
          )
        })}

        <Text style={[styles.footer, { color: theme.textMuted, fontFamily: theme.fonts.medium }]}>Mojammaa Connect · Rentrée 2026-2027</Text>
      </ScrollView>
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 20,
    paddingBottom: 108,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2.1,
    marginBottom: 14,
  },
  title: {
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -1.15,
  },
  progressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 26,
    marginBottom: 32,
  },
  progressTrack: {
    borderRadius: 999,
    flex: 1,
    height: 6,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 999,
    height: '100%',
  },
  progressCount: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.6,
  },
  clearButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 10,
  },
  clearText: {
    fontSize: 10,
    letterSpacing: 0.8,
  },
  loading: {
    alignItems: 'center',
    height: 180,
    justifyContent: 'center',
  },
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 13,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  sectionNumber: {
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 19,
    letterSpacing: -0.25,
  },
  sectionCount: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  sectionRule: {
    height: 2,
    opacity: 0.86,
  },
  taskRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 14,
    minHeight: 60,
    paddingHorizontal: 1,
    paddingVertical: 10,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1.5,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  taskLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  taskLabelDone: {
    textDecorationLine: 'line-through',
  },
  footer: {
    alignSelf: 'center',
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 2,
  },
})
