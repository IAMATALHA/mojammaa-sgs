/**
 * Saisie de notes par le prof.
 *
 * V1 : on filtre la collection 'eleves' sur la classe du prof, on liste
 * les notes existantes pour la matière+semestre sélectionnés, et on
 * permet d'ajouter / mettre à jour une note pour un élève via un modal.
 *
 * Schéma Firestore (cohérent avec mojammaa-admin) :
 *   notes/{docId}  où docId = `${eleveId}_${academicYear}_${semestre}_${matiere}`
 *   fields: eleveId, eleveNom, elevePrenom, codeMassar, classe, cycle,
 *           academicYear, semestre, matiere, matiereLabel, note, controles, importedAt,
 *           importedBy
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, ScrollView, Alert, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { TeacherRoute } from '../../navigation/types';
import { toDoc } from '../../services/firestore';
import { isActiveEleve, type EleveDoc } from '../../services/elevesService';
import {
  collection, getDocs, query, where, setDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import ScreenLayout from '../../components/ScreenLayout';
import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import { parseNotesFile, matchToEleve, type ParsedNoteRow } from '../../services/NotesImport'
import {
  alignControlsWithRule,
  averageControlNotes,
  buildEvaluationComponents,
  calculateCollegeEvaluation,
  formatGrade,
  getEvaluationRule,
  getExpectedControlsForSubject,
  makeControlNotes,
  type ControlNote,
  type EvaluationRule,
  type IntegratedActivityNote,
} from '../../services/notesRules';
import { currentAcademicPeriod } from '../../utils/academicPeriod'
import { commitInChunks } from '../../utils/firestoreBatch'
import { translatedFormula } from '../../utils/evaluationFormula'

// Noms officiels de l'école (collège + primaire). Utilisé seulement comme
// liste de secours : la matière du prof est verrouillée via profile.matiere.
const MATIERES = [
  'Mathématiques', 'Physique et Chimie', 'Sciences de la Vie et de la Terre',
  'Informatique', 'Arabe', 'Français', 'Anglais', 'Histoire Géographie',
  'Éducation Islamique', 'Activité scientifique', 'Éducation artistique',
  'Éducation Physique et Sportive',
]
const SEMESTRES = ['S1', 'S2']

interface EleveLite {
  id:         string
  nom:        string
  prenom:     string
  codeMassar: string
  classe:     string
}
interface NoteEntry {
  id?:       string
  eleveId:   string
  note:      number | string
  matiere:   string
  academicYear: string
  semestre:  string
  controles: ControlNote[]
  controlesCount: number
  controlesExpected: number | null
  controlesIgnored: number
  integratedActivity: IntegratedActivityNote | null
  calculationStatus: 'legacy' | 'provisional' | 'complete'
  completionRate: number | null
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function baremeFromClasse(classe?: string): 10 | 20 {
  return /aep/i.test(classe || '') ? 10 : 20
}

function cycleFromClasse(classe?: string): 'prescolaire' | 'primaire' | 'college' {
  const value = classe || ''
  if (/(^|[^a-z])(ps|gs)([^a-z]|$)/i.test(value)) return 'prescolaire'
  if (/aep/i.test(value)) return 'primaire'
  return 'college'
}

function normalizedOn20(note: number, bareme: number): number {
  return note * (20 / bareme)
}

function gradeTone(note: number, bareme: number, theme: Theme) {
  const value = normalizedOn20(note, bareme)
  if (value >= 14) return { bg: theme.successSurface, border: theme.successSurface, fg: theme.success }
  if (value >= 10) return { bg: theme.primarySurface, border: theme.primaryBorder, fg: theme.primary }
  if (value >= 8) return { bg: theme.warningSurface, border: theme.warningSurface, fg: theme.warning }
  return { bg: theme.dangerSurface, border: theme.dangerSurface, fg: theme.danger }
}

function labelWithBareme(label: string, bareme: number): string {
  return label.replace(/\b20\b/g, String(bareme))
}

function placeholderWithBareme(label: string, bareme: number): string {
  return bareme === 10 ? label.replace('14.5', '8.5') : label
}

function readControlNotes(data: any, bareme: number): ControlNote[] {
  const evaluations = Array.isArray(data?.evaluations)
    ? data.evaluations.filter((item: any) => {
      const category = String(item?.category || item?.type || '')
      return category !== 'integrated' && category !== 'integrated_activity'
    })
    : null
  const raw = evaluations
    || (Array.isArray(data?.controles) ? data.controles : Array.isArray(data?.controls) ? data.controls : [])
  if (raw.length === 0) return []
  if (typeof raw[0] === 'number') {
    const values = raw
      .map((n: unknown) => asNumber(n))
      .filter((n: number | null): n is number => n != null && n >= 0 && n <= bareme)
    return makeControlNotes(values)
  }
  return raw
    .map((item: any, index: number) => {
      const note = asNumber(item?.note)
      if (note == null || note < 0 || note > bareme) return null
      const numero = asNumber(item?.numero) ?? index + 1
      return {
        numero,
        label: String(item?.label || `Contrôle ${numero}`),
        note,
        slot: String(item?.slot || item?.id || '') || undefined,
        kind: String(item?.kind || item?.type || '') || undefined,
        dateEvaluation: String(item?.dateEvaluation || item?.evaluationDate || '') || undefined,
      }
    })
    .filter((item: ControlNote | null): item is ControlNote => item != null)
}

function readIntegratedActivity(data: any, bareme: number): IntegratedActivityNote | null {
  const evaluation = Array.isArray(data?.evaluations)
    ? data.evaluations.find((item: any) => {
      const category = String(item?.category || item?.type || '')
      return category === 'integrated' || category === 'integrated_activity'
    })
    : null
  const raw = evaluation
    || data?.activitesIntegrees
    || data?.integratedActivities
    || data?.integratedActivity
  const note = asNumber(raw && typeof raw === 'object' ? raw.note : raw)
  if (note == null || note < 0 || note > bareme) return null
  return {
    note,
    label: String(raw?.label || 'Activités intégrées'),
    dateEvaluation: String(raw?.dateEvaluation || raw?.evaluationDate || '') || undefined,
  }
}

function parseGradeInput(value: string, bareme: number): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= bareme ? n : null
}

function noteDocId(eleveId: string, academicYear: string, semestre: string, matiere: string): string {
  return `${eleveId}_${academicYear}_${semestre}_${matiere}`.replace(/\//g, '_')
}

function structuredEvaluationPayload({
  rule,
  matiere,
  classe,
  bareme,
  controles,
  integratedActivity,
}: {
  rule: EvaluationRule
  matiere: string
  classe: string
  bareme: 10 | 20
  controles: ControlNote[]
  integratedActivity: IntegratedActivityNote | null
}): Record<string, unknown> {
  const aligned = alignControlsWithRule(controles, rule)
  const calculated = calculateCollegeEvaluation({
    matiere,
    classe,
    controles: aligned,
    integratedActivity,
  })
  if (!calculated || calculated.note == null) {
    throw new Error('Aucune composante valide à enregistrer.')
  }
  return {
    schemaVersion: 2,
    gradeSource: 'structured',
    // Niveau canonique de la politique : les règles refusent explicitement le
    // schéma structuré hors collège et le calculateur peut relire la formule
    // même si le libellé local de classe évolue.
    niveau: rule.level,
    evaluationPolicyVersion: rule.policyVersion,
    subjectKey: rule.policyKey,
    evaluations: buildEvaluationComponents(rule, aligned, integratedActivity, bareme),
    controles: aligned,
    controls: aligned.map(control => control.note),
    controlesCount: calculated.controlsEntered,
    controlesExpected: calculated.controlsExpected,
    activitesIntegrees: integratedActivity,
    note: calculated.note,
    calculation: {
      status: calculated.complete ? 'complete' : 'provisional',
      completed: calculated.componentsEntered,
      expected: calculated.componentsExpected,
      completionRate: calculated.completionRate,
    },
  }
}

export default function TeacherNotesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const route = useRoute<TeacherRoute<'TeacherNotes'>>()
  const { profile } = useAuth()
  // Si la classe est fournie via les params (drill-down depuis le folder),
  // on l'utilise — sinon on prend la classe assignée au profil du prof.
  const routeClasse = route.params?.classe
  const classe = (routeClasse || profile?.classe || '').trim()
  const bareme = useMemo(() => baremeFromClasse(classe), [classe])
  const cycle = useMemo(() => cycleFromClasse(classe), [classe])
  const period = currentAcademicPeriod()

  // Matière VERROUILLÉE sur celle du prof. S'il n'en a pas (ancien compte),
  // on retombe sur le sélecteur libre (compat).
  const teacherMatiere = (profile?.matiere || '').trim()
  const matiereLocked  = teacherMatiere.length > 0

  const [eleves,    setEleves]    = useState<EleveLite[]>([])
  const [notes,     setNotes]     = useState<Map<string, NoteEntry>>(new Map())
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [pickedMatiere, setPickedMatiere] = useState(MATIERES[0])
  const matiere = matiereLocked ? teacherMatiere : pickedMatiere
  const [semestre,  setSemestre]  = useState<string>(period.semestre)
  const [editEleve, setEditEleve] = useState<EleveLite | null>(null)
  const expectedControls = useMemo(
    () => getExpectedControlsForSubject(matiere, classe),
    [matiere, classe],
  )
  const evaluationRule = useMemo(
    () => getEvaluationRule(matiere, classe),
    [matiere, classe],
  )
  const officialFormula = evaluationRule
    ? translatedFormula(evaluationRule.formula, evaluationRule.integratedWeight, t)
    : ''

  const load = useCallback(async () => {
    if (!classe) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      // 1. Les élèves de la classe du prof
      const elevesSnap = await getDocs(
        query(collection(db, 'eleves'), where('classe', '==', classe))
      )
      const list: EleveLite[] = elevesSnap.docs
        .map(d => ({ id: d.id, data: toDoc<EleveDoc>(d) }))
        .filter(({ data }) => isActiveEleve(data))
        .map(({ id, data }) => ({
          id,
          nom:        data.nom        || '',
          prenom:     data.prenom     || '',
          codeMassar: data.codeMassar || '',
          classe:     data.classe     || '',
        }))
        .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
      setEleves(list)

      // 2. Les notes existantes pour la matière+semestre+classe
      const notesSnap = await getDocs(query(
        collection(db, 'notes'),
        where('classe',   '==', classe),
        where('academicYear', '==', period.academicYear),
        where('semestre', '==', semestre),
        where('matiere',  '==', matiere),
      ))
      const map = new Map<string, NoteEntry>()
      notesSnap.forEach(d => {
        const data = toDoc<{
          eleveId:            string
          note?:              unknown
          matiere:            string
          academicYear?:       string
          semestre:           string
          controlesCount?:    unknown
          controlesExpected?: unknown
          controlesIgnored?:  unknown
          schemaVersion?:      unknown
          calculation?:        unknown
          evaluations?:        unknown
          activitesIntegrees?: unknown
        }>(d)
        const controles = alignControlsWithRule(readControlNotes(data, bareme), evaluationRule)
        const integratedActivity = readIntegratedActivity(data, bareme)
        const structured = asNumber(data.schemaVersion) != null && Number(data.schemaVersion) >= 2
        const calculated = structured
          ? calculateCollegeEvaluation({
            matiere,
            classe,
            controles,
            integratedActivity,
          })
          : null
        const rawNote = asNumber(data.note)
        const note = calculated?.note
          ?? (rawNote != null && rawNote >= 0 && rawNote <= bareme
          ? rawNote
          : (controles.length > 0 ? averageControlNotes(controles.map(item => item.note)) : ''))
        map.set(data.eleveId, {
          id:       d.id,
          eleveId:  data.eleveId,
          note,
          matiere:  data.matiere,
          academicYear: data.academicYear || period.academicYear,
          semestre: data.semestre,
          controles,
          controlesCount: asNumber(data.controlesCount) ?? controles.length,
          controlesExpected: asNumber(data.controlesExpected),
          controlesIgnored: asNumber(data.controlesIgnored) ?? 0,
          integratedActivity,
          calculationStatus: structured
            ? (calculated?.complete ? 'complete' : 'provisional')
            : 'legacy',
          completionRate: calculated?.completionRate ?? null,
        })
      })
      setNotes(map)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les notes.')
    } finally {
      setLoading(false)
    }
  }, [bareme, classe, evaluationRule, matiere, period.academicYear, semestre])

  useEffect(() => { load() }, [load])

  const handleImportExcel = useCallback(async () => {
    if (!profile || !classe) return
    if (expectedControls === 0) {
      Alert.alert(t('common.noData'), t('teacher.noControlsAllowed'))
      return
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'application/octet-stream',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (res.canceled || !res.assets?.[0]) return
      const a = res.assets[0]
      const parsed: ParsedNoteRow[] = await parseNotesFile(a.uri, a.mimeType || '', {
        maxControls: expectedControls,
        maxGrade: bareme,
        controlSlots: evaluationRule?.controls,
      })

      if (parsed.length === 0) {
        Alert.alert(t('common.noData'), t('teacher.noNotes'))
        return
      }

      // Charge les élèves de la classe pour le matching
      const elevesSnap = await getDocs(query(collection(db, 'eleves'), where('classe', '==', classe)))
      const elevesData = elevesSnap.docs
        .map(d => ({ id: d.id, data: toDoc<EleveDoc>(d) }))
        .filter(({ data }) => isActiveEleve(data))
        .map(({ id, data }) => ({
          id,
          nom: data.nom || '',
          prenom: data.prenom || '',
          codeMassar: data.codeMassar || '',
        }))

      const matched: { row: ParsedNoteRow; eleve: typeof elevesData[number] }[] = []
      const unmatched: ParsedNoteRow[] = []
      parsed.forEach(row => {
        const e = matchToEleve(row, elevesData)
        if (e) matched.push({ row, eleve: e })
        else unmatched.push(row)
      })

      if (matched.length === 0) {
        Alert.alert(t('common.noData'), t('teacher.linesIgnored', { count: unmatched.length }))
        return
      }

      const controlsCount = matched.reduce((sum, item) => sum + item.row.controles.length, 0)
      const ignoredControlsCount = matched.reduce((sum, item) => sum + item.row.ignoredControls.length, 0)

      Alert.alert(
        t('teacher.confirmImport'),
        [
          t('teacher.controlsReady', { students: matched.length, controls: controlsCount, subject: matiere, semester: semestre }),
          expectedControls != null ? t('teacher.controlsLimit', { count: expectedControls }) : '',
          ignoredControlsCount > 0 ? t('teacher.extraControlsIgnored', { count: ignoredControlsCount }) : '',
          unmatched.length > 0 ? t('teacher.linesIgnored', { count: unmatched.length }) : '',
        ].filter(Boolean).join('\n'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('teacher.import'),
            onPress: async () => {
              try {
                // Chunks obligatoires : les règles font un get() par note créée
                // (cohérence élève/classe) et Firestore plafonne à 20 accès
                // règles par batch — l'import d'une classe entière échouerait.
                await commitInChunks(db, matched, (batch, { row, eleve }) => {
                  const docId = notes.get(eleve.id)?.id || noteDocId(eleve.id, period.academicYear, semestre, matiere)
                  const integratedActivity = row.integratedActivity == null
                    ? null
                    : { note: row.integratedActivity, label: 'Activités intégrées' }
                  const gradePayload = evaluationRule
                    ? structuredEvaluationPayload({
                      rule: evaluationRule,
                      matiere,
                      classe,
                      bareme,
                      controles: row.controles,
                      integratedActivity,
                    })
                    : {
                      note: row.note,
                      controles: row.controles,
                      controlesCount: row.controles.length,
                      controlesExpected: expectedControls ?? row.detectedControlsCount,
                    }
                  batch.set(doc(db, 'notes', docId), {
                    eleveId:      eleve.id,
                    eleveNom:     eleve.nom,
                    elevePrenom:  eleve.prenom,
                    codeMassar:   eleve.codeMassar || row.codeMassar || '',
                    classe,
                    cycle,
                    academicYear: period.academicYear,
                    semestre,
                    matiere,
                    matiereLabel: matiere,
                    bareme,
                    ...gradePayload,
                    controlesIgnored: row.ignoredControls.length,
                    importedAt:   serverTimestamp(),
                    importedBy:   profile.uid,
                  }, { merge: true })
                })
                Alert.alert(t('teacher.importDone'), t('teacher.notesImported', { count: matched.length }))
                load()
              } catch (e: any) {
                Alert.alert(t('common.error'), e?.message || t('teacher.saveFailed'))
              }
            },
          },
        ],
      )
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('teacher.readFailed'))
    }
  }, [profile, classe, cycle, bareme, matiere, notes, period.academicYear, semestre, expectedControls, evaluationRule, t, load])

  const Chip = ({ value, active, onPress }: { value: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={value}
      style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primarySurface : 'transparent' }]}>
      <Text style={{ color: active ? theme.primary : theme.textSoft, fontWeight: active ? '700' : '500', fontSize: 12 }}>{value}</Text>
    </TouchableOpacity>
  )

  const renderEleve = ({ item }: { item: EleveLite }) => {
    const noteEntry = notes.get(item.id)
    const noteValue = asNumber(noteEntry?.note)
    const hasNote = noteValue != null
    const tone = hasNote ? gradeTone(noteValue, bareme, theme) : null
    const controlCount = noteEntry?.controlesCount || noteEntry?.controles.length || (hasNote ? 1 : 0)
    const expected = noteEntry?.controlesExpected ?? expectedControls
    const controlsLabel = expected != null
      ? t('teacher.controlsCountExpected', { count: controlCount, expected })
      : t('teacher.controlsCount', { count: controlCount })
    const structuredLabel = noteEntry?.calculationStatus !== 'legacy' && noteEntry?.completionRate != null
      ? t(noteEntry.calculationStatus === 'complete'
        ? 'teacher.evaluationComplete'
        : 'teacher.evaluationProvisional', { percent: noteEntry.completionRate })
      : ''
    return (
      <TouchableOpacity
        onPress={() => setEditEleve(item)}
        style={[styles.eleveRow, { backgroundColor: theme.white, borderColor: theme.border }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.eleveName, { color: theme.text }]}>
            {item.prenom} {item.nom}
          </Text>
          {item.codeMassar ? (
            <Text style={[styles.eleveSub, { color: theme.textSoft }]}>{item.codeMassar}</Text>
          ) : null}
          {hasNote && controlCount > 0 ? (
            <Text style={[styles.eleveSub, { color: theme.textSoft }]}>{controlsLabel}</Text>
          ) : null}
          {structuredLabel ? (
            <Text style={[
              styles.eleveSub,
              { color: noteEntry?.calculationStatus === 'complete' ? theme.success : theme.warning },
            ]}>
              {structuredLabel}
            </Text>
          ) : null}
        </View>
        {hasNote ? (
          <View style={[styles.noteBox, { backgroundColor: tone!.bg, borderColor: tone!.border }]}>
            <Text style={[styles.noteValue, { color: tone!.fg }]}>
              {formatGrade(noteValue)}<Text style={{ fontSize: 11, fontWeight: '600' }}>/{bareme}</Text>
            </Text>
          </View>
        ) : (
          <Text style={[styles.notePlaceholder, { color: theme.textSoft }]}>—</Text>
        )}
      </TouchableOpacity>
    )
  }

  if (!classe) {
    return (
      <ScreenLayout title={t('teacher.notesTitle')}>
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            {t('teacher.noClassProfile')}{'\n'}
            {t('teacher.contactAdmin')}
          </Text>
        </View>
      </ScreenLayout>
    )
  }

  return (
    <ScreenLayout title={t('teacher.notesTitle')}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      <View style={[styles.controlsPanel, { backgroundColor: theme.white, borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSoft }]}>{t('teacher.subject')}</Text>
        {matiereLocked ? (
          <View style={[styles.lockedSubject, { backgroundColor: theme.primarySurface, borderColor: theme.primaryBorder }]}>
            <Ionicons name="lock-closed" size={13} color={theme.primary} />
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13, marginStart: 6 }}>{teacherMatiere}</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {MATIERES.map(m => <Chip key={m} value={m} active={matiere === m} onPress={() => setPickedMatiere(m)} />)}
          </ScrollView>
        )}

        <Text style={[styles.label, { color: theme.textSoft, marginTop: 10 }]}>{t('teacher.semester')}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {SEMESTRES.map(s => <Chip key={s} value={s} active={semestre === s} onPress={() => setSemestre(s)} />)}
        </View>

        <View style={[styles.context, { backgroundColor: theme.surfaceAlt }]}>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>
            Classe {classe} · {matiere} · {semestre}
            {` · /${bareme}`}
            {expectedControls != null ? ` · ${t('teacher.controlsCount', { count: expectedControls })}` : ''}
          </Text>
          {evaluationRule ? (
            <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '600', lineHeight: 16, marginTop: 4 }}>
              {officialFormula}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={handleImportExcel}
          style={[styles.importBtn, { backgroundColor: theme.primary }]}
          activeOpacity={0.9}
        >
          <Ionicons name="cloud-upload-outline" size={18} color={theme.white} />
          <Text style={{ color: theme.white, fontWeight: '800', marginStart: 8, fontSize: 13 }}>
            {t('teacher.importExcel')}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && eleves.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : eleves.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>
            Aucun élève dans cette classe.
          </Text>
        </View>
      ) : (
        <FlatList
          data={eleves}
          keyExtractor={item => item.id}
          renderItem={renderEleve}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        />
      )}

      <EditNoteModal
        visible={editEleve != null}
        eleve={editEleve}
        existing={editEleve ? notes.get(editEleve.id) : undefined}
        matiere={matiere}
        academicYear={period.academicYear}
        semestre={semestre}
        classe={classe}
        bareme={bareme}
        cycle={cycle}
        teacherUid={profile?.uid || ''}
        expectedControls={expectedControls}
        evaluationRule={evaluationRule}
        onClose={() => setEditEleve(null)}
        onSaved={() => { setEditEleve(null); load() }}
      />
    </ScreenLayout>
  )
}

// ─── Edit note modal ─────────────────────────────────────────────────────────
function EditNoteModal({
  visible, eleve, existing, matiere, academicYear, semestre, classe, bareme, cycle, teacherUid,
  expectedControls, evaluationRule, onClose, onSaved,
}: {
  visible:    boolean
  eleve:      EleveLite | null
  existing?:  NoteEntry
  matiere:    string
  academicYear: string
  semestre:   string
  classe:     string
  bareme:     10 | 20
  cycle:      'prescolaire' | 'primaire' | 'college'
  teacherUid: string
  expectedControls?: number | null
  evaluationRule: EvaluationRule | null
  onClose:    () => void
  onSaved:    () => void
}) {
  const theme = useTheme()
  const { t } = useTranslation()
  const officialFormula = evaluationRule
    ? translatedFormula(evaluationRule.formula, evaluationRule.integratedWeight, t)
    : ''
  const [value,  setValue]  = useState('')
  const [controlValues, setControlValues] = useState<Record<string, string>>({})
  const [integratedValue, setIntegratedValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  useEffect(() => {
    if (!visible) return
    if (existing) setValue(String(existing.note ?? ''))
    else setValue('')
    if (evaluationRule) {
      const bySlot = new Map((existing?.controles || []).map(control => [control.slot, control]))
      const values: Record<string, string> = {}
      evaluationRule.controls.forEach((slot, index) => {
        const control = bySlot.get(slot.slot)
          || existing?.controles.find(item => item.numero === index + 1)
        values[slot.slot] = control ? String(control.note) : ''
      })
      setControlValues(values)
      setIntegratedValue(existing?.integratedActivity
        ? String(existing.integratedActivity.note)
        : '')
    } else {
      setControlValues({})
      setIntegratedValue('')
    }
    setErr('')
  }, [visible, existing, evaluationRule])

  const draft = useMemo(() => {
    if (!evaluationRule) return null
    const controles = evaluationRule.controls.flatMap((slot, index) => {
      const note = parseGradeInput(controlValues[slot.slot] || '', bareme)
      if (note == null) return []
      return [{
        numero: index + 1,
        slot: slot.slot,
        kind: slot.kind,
        label: slot.label,
        note,
      }]
    })
    const integratedNote = parseGradeInput(integratedValue, bareme)
    return calculateCollegeEvaluation({
      matiere,
      classe,
      controles,
      integratedActivity: integratedNote == null
        ? null
        : { note: integratedNote, label: 'Activités intégrées' },
    })
  }, [bareme, classe, controlValues, evaluationRule, integratedValue, matiere])

  const submit = async () => {
    if (!eleve) return
    let gradePayload: Record<string, unknown>
    if (evaluationRule) {
      const invalidControl = evaluationRule.controls.find(slot => {
        const raw = controlValues[slot.slot]?.trim() || ''
        return raw.length > 0 && parseGradeInput(raw, bareme) == null
      })
      const integratedRaw = integratedValue.trim()
      if (invalidControl || (integratedRaw && parseGradeInput(integratedRaw, bareme) == null)) {
        setErr(labelWithBareme(t('teacher.invalidNote'), bareme))
        return
      }
      const controles = evaluationRule.controls.flatMap((slot, index) => {
        const note = parseGradeInput(controlValues[slot.slot] || '', bareme)
        if (note == null) return []
        return [{
          numero: index + 1,
          slot: slot.slot,
          kind: slot.kind,
          label: slot.label,
          note,
        }]
      })
      const integratedNote = parseGradeInput(integratedValue, bareme)
      if (controles.length === 0 && integratedNote == null) {
        setErr(t('teacher.enterAtLeastOneComponent'))
        return
      }
      gradePayload = structuredEvaluationPayload({
        rule: evaluationRule,
        matiere,
        classe,
        bareme,
        controles,
        integratedActivity: integratedNote == null
          ? null
          : { note: integratedNote, label: 'Activités intégrées' },
      })
    } else {
      const num = parseGradeInput(value, bareme)
      if (num == null) {
        setErr(labelWithBareme(t('teacher.invalidNote'), bareme))
        return
      }
      gradePayload = {
        gradeSource: 'legacy_summary',
        note: num,
        controles: [{ numero: 1, label: 'Contrôle 1', note: num }],
        controlesCount: 1,
        controlesExpected: expectedControls ?? 1,
        controlesIgnored: 0,
        controls: [num],
      }
    }
    setSaving(true); setErr('')
    try {
      const docId = existing?.id || noteDocId(eleve.id, academicYear, semestre, matiere)
      await setDoc(doc(db, 'notes', docId), {
        eleveId:     eleve.id,
        eleveNom:    eleve.nom,
        elevePrenom: eleve.prenom,
        codeMassar:  eleve.codeMassar,
        classe,
        cycle,
        academicYear,
        semestre,
        matiere,
        matiereLabel: matiere,
        bareme,
        ...gradePayload,
        controlesIgnored: 0,
        importedAt: serverTimestamp(),
        importedBy: teacherUid,
      }, { merge: true })
      onSaved()
    } catch (e: any) {
      setErr(e?.message || t('teacher.saveFailed'))
      Alert.alert(t('common.error'), e?.message || t('teacher.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.border, paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0) + 16 }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: theme.text, fontSize: 16 }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.text }]}>{t('teacher.enterNote')}</Text>
          <TouchableOpacity onPress={submit} disabled={saving}>
            {saving
              ? <ActivityIndicator color={theme.primary} />
              : <Text style={{ color: theme.primary, fontSize: 16, fontWeight: '700' }}>{t('teacher.saveDone')}</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.modalBody}>
          {eleve && (
            <View style={[styles.eleveCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.eleveTitle, { color: theme.text }]}>
                {eleve.prenom} {eleve.nom}
              </Text>
              <Text style={[styles.eleveSub, { color: theme.textSoft }]}>
                {classe} · {matiere} · {semestre}
              </Text>
            </View>
          )}

          {err ? (
            <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
              <Text style={{ color: theme.danger, fontSize: 13 }}>{err}</Text>
            </View>
          ) : null}

          {evaluationRule ? (
            <>
              <View style={[styles.formulaCard, { backgroundColor: theme.primarySurface, borderColor: theme.primaryBorder }]}>
                <Text style={[styles.formulaTitle, { color: theme.primary }]}>
                  {t('teacher.officialCalculation')}
                </Text>
                <Text style={[styles.formulaText, { color: theme.text }]}>
                  {officialFormula}
                </Text>
              </View>

              {evaluationRule.controls.map((slot, index) => (
                <View key={slot.slot} style={styles.componentField}>
                  <Text style={[styles.componentLabel, { color: theme.textSoft }]}>
                    {slot.label} · /{bareme}
                  </Text>
                  <TextInput
                    value={controlValues[slot.slot] || ''}
                    onChangeText={next => setControlValues(current => ({ ...current, [slot.slot]: next }))}
                    accessibilityLabel={`${slot.label} sur ${bareme}`}
                    placeholder="—"
                    placeholderTextColor={theme.textSoft}
                    style={[styles.componentInput, {
                      borderColor: theme.border,
                      color: theme.text,
                      backgroundColor: theme.white,
                    }]}
                    keyboardType="decimal-pad"
                    maxLength={5}
                    autoFocus={index === 0}
                  />
                </View>
              ))}

              {evaluationRule.integratedRequired ? (
                <View style={styles.componentField}>
                  <Text style={[styles.componentLabel, { color: theme.textSoft }]}>
                    {t('teacher.integratedActivities')} · {Math.round(evaluationRule.integratedWeight * 100)} % · /{bareme}
                  </Text>
                  <TextInput
                    value={integratedValue}
                    onChangeText={setIntegratedValue}
                    accessibilityLabel={`${t('teacher.integratedActivities')} sur ${bareme}`}
                    placeholder="—"
                    placeholderTextColor={theme.textSoft}
                    style={[styles.componentInput, {
                      borderColor: theme.border,
                      color: theme.text,
                      backgroundColor: theme.white,
                    }]}
                    keyboardType="decimal-pad"
                    maxLength={5}
                  />
                </View>
              ) : null}

              {draft?.note != null ? (
                <View style={[styles.previewCard, {
                  backgroundColor: draft.complete ? theme.successSurface : theme.warningSurface,
                }]}>
                  <View>
                    <Text style={[styles.previewLabel, {
                      color: draft.complete ? theme.success : theme.warning,
                    }]}>
                      {draft.complete ? t('teacher.finalAverage') : t('teacher.provisionalAverage')}
                    </Text>
                    <Text style={[styles.previewCoverage, { color: theme.textSoft }]}>
                      {t('teacher.componentsCoverage', {
                        completed: draft.componentsEntered,
                        expected: draft.componentsExpected,
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.previewValue, {
                    color: draft.complete ? theme.success : theme.warning,
                  }]}>
                    {formatGrade(draft.note)}/{bareme}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={[styles.label, { color: theme.textSoft }]}>
                {labelWithBareme(t('teacher.noteLabel'), bareme)}
              </Text>
              <TextInput
                value={value}
                onChangeText={setValue}
                accessibilityLabel={labelWithBareme(t('teacher.noteLabel'), bareme)}
                placeholder={placeholderWithBareme(t('teacher.notePlaceholder'), bareme)}
                placeholderTextColor={theme.textSoft}
                style={[styles.input, {
                  borderColor: theme.border,
                  color: theme.text,
                  backgroundColor: theme.white,
                  fontSize: 28,
                  textAlign: 'center',
                  fontWeight: '700',
                }]}
                keyboardType="decimal-pad"
                maxLength={5}
                autoFocus
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  controlsPanel: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 12 },
  label:    { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  chip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  lockedSubject: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginBottom: 4 },
  context:  { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, marginBottom: 10 },
  importBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 14, borderRadius: 8 },
  eleveRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, marginBottom: 7, borderRadius: 8, borderWidth: 1 },
  eleveName:{ fontSize: 14, fontWeight: '700' },
  eleveSub: { fontSize: 11, marginTop: 2 },
  noteBox:  { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, minWidth: 58, alignItems: 'center' },
  noteValue:{ fontSize: 16, fontWeight: '800' },
  notePlaceholder: { fontSize: 14 },
  loading:  { paddingVertical: 40, alignItems: 'center' },
  empty:    { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  errorBox: { padding: 12, borderRadius: 10, marginBottom: 12 },

  // Modal
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  modalTitle:  { fontSize: 16, fontWeight: '700' },
  modalBody:   { padding: 20, paddingBottom: 40 },
  eleveCard:   { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  eleveTitle:  { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  input:       { borderWidth: 1, borderRadius: 10, padding: 16 },
  formulaCard: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16, gap: 4 },
  formulaTitle: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  formulaText: { fontSize: 12, fontWeight: '700', lineHeight: 18 },
  componentField: { marginBottom: 12, gap: 6 },
  componentLabel: { fontSize: 11, fontWeight: '800' },
  componentInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, minHeight: 48,
    fontSize: 20, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'],
  },
  previewCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4,
  },
  previewLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  previewCoverage: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  previewValue: { fontSize: 21, fontWeight: '900', fontVariant: ['tabular-nums'] },
});
