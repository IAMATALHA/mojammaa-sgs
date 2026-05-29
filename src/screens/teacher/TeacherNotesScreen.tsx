/**
 * Saisie de notes par le prof.
 *
 * V1 : on filtre la collection 'eleves' sur la classe du prof, on liste
 * les notes existantes pour la matière+semestre sélectionnés, et on
 * permet d'ajouter / mettre à jour une note pour un élève via un modal.
 *
 * Schéma Firestore (cohérent avec mojammaa-admin) :
 *   notes/{docId}  où docId = `${eleveId}_${semestre}_${matiere}`
 *   fields: eleveId, eleveNom, elevePrenom, codeMassar, classe, cycle,
 *           semestre, matiere, matiereLabel, note, importedAt, importedBy
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, ScrollView, Alert, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import {
  collection, getDocs, query, where, setDoc, doc, serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import ScreenLayout from '../../components/ScreenLayout';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import { parseNotesFile, matchToEleve, type ParsedNoteRow } from '../../services/NotesImport';

const MATIERES = [
  'Mathématiques', 'Français', 'Langue Arabe', 'Anglais', 'SVT',
  'Physique-Chimie', 'Histoire-Géo', 'Éducation Islamique', 'EPS', 'Informatique',
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
  semestre:  string
}

export default function TeacherNotesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const route = useRoute()
  const { profile } = useAuth()
  // Si la classe est fournie via les params (drill-down depuis le folder),
  // on l'utilise — sinon on prend la classe assignée au profil du prof.
  const routeClasse = (route.params as { classe?: string } | undefined)?.classe
  const classe = (routeClasse || profile?.classe || '').trim()

  const [eleves,    setEleves]    = useState<EleveLite[]>([])
  const [notes,     setNotes]     = useState<Map<string, NoteEntry>>(new Map())
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [matiere,   setMatiere]   = useState(MATIERES[0])
  const [semestre,  setSemestre]  = useState(SEMESTRES[0])
  const [editEleve, setEditEleve] = useState<EleveLite | null>(null)

  const load = useCallback(async () => {
    if (!classe) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      // 1. Les élèves de la classe du prof
      const elevesSnap = await getDocs(
        query(collection(db, 'eleves'), where('classe', '==', classe))
      )
      const list: EleveLite[] = elevesSnap.docs.map(d => {
        const data = d.data() as any
        return {
          id:         d.id,
          nom:        data.nom        || '',
          prenom:     data.prenom     || '',
          codeMassar: data.codeMassar || '',
          classe:     data.classe     || '',
        }
      }).sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
      setEleves(list)

      // 2. Les notes existantes pour la matière+semestre+classe
      const notesSnap = await getDocs(query(
        collection(db, 'notes'),
        where('classe',   '==', classe),
        where('semestre', '==', semestre),
        where('matiere',  '==', matiere),
      ))
      const map = new Map<string, NoteEntry>()
      notesSnap.forEach(d => {
        const data = d.data() as any
        map.set(data.eleveId, {
          id:       d.id,
          eleveId:  data.eleveId,
          note:     data.note ?? '',
          matiere:  data.matiere,
          semestre: data.semestre,
        })
      })
      setNotes(map)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les notes.')
    } finally {
      setLoading(false)
    }
  }, [classe, matiere, semestre])

  useEffect(() => { load() }, [load])

  const handleImportExcel = useCallback(async () => {
    if (!profile || !classe) return
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
      const parsed: ParsedNoteRow[] = await parseNotesFile(a.uri, a.mimeType || '')

      if (parsed.length === 0) {
        Alert.alert(t('common.noData'), t('teacher.noNotes'))
        return
      }

      // Charge les élèves de la classe pour le matching
      const elevesSnap = await getDocs(query(collection(db, 'eleves'), where('classe', '==', classe)))
      const elevesData = elevesSnap.docs.map(d => {
        const data = d.data() as any
        return { id: d.id, nom: data.nom || '', prenom: data.prenom || '', codeMassar: data.codeMassar || '' }
      })

      const matched: { row: ParsedNoteRow; eleve: typeof elevesData[number] }[] = []
      const unmatched: ParsedNoteRow[] = []
      parsed.forEach(row => {
        const e = matchToEleve(row, elevesData)
        if (e) matched.push({ row, eleve: e })
        else unmatched.push(row)
      })

      Alert.alert(
        t('teacher.confirmImport'),
        t('teacher.notesReady', { count: matched.length, subject: matiere, semester: semestre }) +
        (unmatched.length > 0
          ? '\n' + t('teacher.linesIgnored', { count: unmatched.length })
          : ''),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('teacher.import'),
            onPress: async () => {
              try {
                const batch = writeBatch(db)
                matched.forEach(({ row, eleve }) => {
                  const docId = `${eleve.id}_${semestre}_${matiere}`
                  batch.set(doc(db, 'notes', docId), {
                    eleveId:      eleve.id,
                    eleveNom:     eleve.nom,
                    elevePrenom:  eleve.prenom,
                    codeMassar:   eleve.codeMassar || row.codeMassar || '',
                    classe,
                    semestre,
                    matiere,
                    matiereLabel: matiere,
                    note:         row.note,
                    importedAt:   serverTimestamp(),
                    importedBy:   profile.uid,
                  }, { merge: true })
                })
                await batch.commit()
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
  }, [profile, classe, matiere, semestre, load])

  const Chip = ({ value, active, onPress }: { value: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress}
      style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primarySurface : 'transparent' }]}>
      <Text style={{ color: active ? theme.primary : theme.textSoft, fontWeight: active ? '700' : '500', fontSize: 12 }}>{value}</Text>
    </TouchableOpacity>
  )

  const renderEleve = ({ item }: { item: EleveLite }) => {
    const noteEntry = notes.get(item.id)
    const hasNote = noteEntry != null && noteEntry.note !== '' && noteEntry.note !== null && noteEntry.note !== undefined
    return (
      <TouchableOpacity
        onPress={() => setEditEleve(item)}
        style={[styles.eleveRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.eleveName, { color: theme.text }]}>
            {item.prenom} {item.nom}
          </Text>
          {item.codeMassar ? (
            <Text style={[styles.eleveSub, { color: theme.textSoft }]}>{item.codeMassar}</Text>
          ) : null}
        </View>
        {hasNote ? (
          <View style={[styles.noteBox, { backgroundColor: theme.primarySurface }]}>
            <Text style={[styles.noteValue, { color: theme.primary }]}>
              {String(noteEntry!.note)}<Text style={{ fontSize: 11, fontWeight: '600' }}>/20</Text>
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

      <Text style={[styles.label, { color: theme.textSoft }]}>{t('teacher.subject')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
        {MATIERES.map(m => <Chip key={m} value={m} active={matiere === m} onPress={() => setMatiere(m)} />)}
      </ScrollView>

      <Text style={[styles.label, { color: theme.textSoft, marginTop: 10 }]}>{t('teacher.semester')}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {SEMESTRES.map(s => <Chip key={s} value={s} active={semestre === s} onPress={() => setSemestre(s)} />)}
      </View>

      <View style={[styles.context, { backgroundColor: theme.primarySurface }]}>
        <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
          Classe {classe} · {matiere} · {semestre}
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleImportExcel}
        style={[styles.importBtn, { borderColor: theme.primary, backgroundColor: theme.white }]}
        activeOpacity={0.85}
      >
        <Ionicons name="cloud-upload-outline" size={18} color={theme.primary} />
        <Text style={{ color: theme.primary, fontWeight: '700', marginStart: 8, fontSize: 13 }}>
          {t('teacher.importExcel')}
        </Text>
      </TouchableOpacity>

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
        semestre={semestre}
        classe={classe}
        teacherUid={profile?.uid || ''}
        onClose={() => setEditEleve(null)}
        onSaved={() => { setEditEleve(null); load() }}
      />
    </ScreenLayout>
  )
}

// ─── Edit note modal ─────────────────────────────────────────────────────────
function EditNoteModal({
  visible, eleve, existing, matiere, semestre, classe, teacherUid, onClose, onSaved,
}: {
  visible:    boolean
  eleve:      EleveLite | null
  existing?:  NoteEntry
  matiere:    string
  semestre:   string
  classe:     string
  teacherUid: string
  onClose:    () => void
  onSaved:    () => void
}) {
  const theme = useTheme()
  const { t } = useTranslation()
  const [value,  setValue]  = useState('')
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  useEffect(() => {
    if (visible && existing) setValue(String(existing.note ?? ''))
    else if (visible) setValue('')
    setErr('')
  }, [visible, existing])

  const submit = async () => {
    if (!eleve) return
    const num = parseFloat(value.replace(',', '.'))
    if (Number.isNaN(num) || num < 0 || num > 20) {
      setErr(t('teacher.invalidNote'))
      return
    }
    setSaving(true); setErr('')
    try {
      const docId = `${eleve.id}_${semestre}_${matiere}`
      await setDoc(doc(db, 'notes', docId), {
        eleveId:     eleve.id,
        eleveNom:    eleve.nom,
        elevePrenom: eleve.prenom,
        codeMassar:  eleve.codeMassar,
        classe,
        semestre,
        matiere,
        matiereLabel: matiere,
        note: num,
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
        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
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

        <ScrollView contentContainerStyle={styles.modalBody}>
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

          <Text style={[styles.label, { color: theme.textSoft }]}>{t('teacher.noteLabel')}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="Ex : 14.5"
            placeholderTextColor={theme.textSoft}
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white, fontSize: 28, textAlign: 'center', fontWeight: '700' }]}
            keyboardType="numeric"
            maxLength={5}
            autoFocus
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  label:    { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  chip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5 },
  context:  { padding: 10, borderRadius: 10, marginBottom: 10 },
  importBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed' as const, marginBottom: 12 },
  eleveRow: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1 },
  eleveName:{ fontSize: 14, fontWeight: '700' },
  eleveSub: { fontSize: 11, marginTop: 2 },
  noteBox:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, minWidth: 56, alignItems: 'center' },
  noteValue:{ fontSize: 16, fontWeight: '800' },
  notePlaceholder: { fontSize: 14 },
  loading:  { paddingVertical: 40, alignItems: 'center' },
  empty:    { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  errorBox: { padding: 12, borderRadius: 10, marginBottom: 12 },

  // Modal
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  modalTitle:  { fontSize: 16, fontWeight: '700' },
  modalBody:   { padding: 20 },
  eleveCard:   { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  eleveTitle:  { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  input:       { borderWidth: 1.5, borderRadius: 12, padding: 16 },
});
