/**
 * Liste + création de devoirs. Features Phase B :
 *   - Photo du tableau (caméra) ou image galerie → upload Firebase Storage
 *   - PDF joint via document picker → upload Firebase Storage
 *   - "Réutiliser un devoir" : pioche un devoir existant et préremplit le
 *     formulaire (le prof n'a plus qu'à ajuster la date et la classe)
 *
 * Convention `attachments` sur le doc devoir :
 *   attachments: [{ url, name, mime, size }]
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  TextInput, ScrollView, Alert, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import {
  collection, getDocs, query, where, addDoc, serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import ScreenLayout from '../../components/ScreenLayout';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import { uploadAttachment, type Attachment } from '../../services/StorageService';

interface Devoir {
  id:           string
  titre:        string
  description?: string
  type:         string
  classeId:     string
  teacherId:    string
  dateLimite:   string
  attachments?: Attachment[]
  createdAt?:   Timestamp
}

const TYPES = ['Maison', 'Contrôle', 'Révision', 'Projet']

function formatDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-')
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
    return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`
  } catch { return iso }
}

export default function TeacherDevoirsScreen() {
  const theme = useTheme();
  const route = useRoute();
  const { profile } = useAuth();
  const routeClasse = (route.params as { classe?: string } | undefined)?.classe
  const [devoirs, setDevoirs] = useState<Devoir[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [prefill, setPrefill] = useState<Devoir | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true); setError(null)
    try {
      const snap = await getDocs(query(collection(db, 'devoirs'), where('teacherId', '==', profile.uid)))
      let list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Devoir[]
      if (routeClasse) list = list.filter(x => x.classeId === routeClasse)
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      setDevoirs(list)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les devoirs.')
    } finally {
      setLoading(false)
    }
  }, [profile, routeClasse])

  useEffect(() => { load() }, [load])

  const openCreate    = () => { setPrefill(null); setModalOpen(true) }
  const openWithReuse = (d: Devoir) => { setPrefill(d); setModalOpen(true) }

  const renderItem = ({ item }: { item: Devoir }) => (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.title, { color: theme.primary }]} numberOfLines={1}>{item.titre}</Text>
        <View style={[styles.typeTag, { backgroundColor: theme.primarySurface }]}>
          <Text style={{ color: theme.primary, fontSize: 10, fontWeight: '800' }}>{item.type.toUpperCase()}</Text>
        </View>
      </View>
      {item.description ? (
        <Text style={[styles.desc, { color: theme.text }]} numberOfLines={2}>{item.description}</Text>
      ) : null}
      {item.attachments && item.attachments.length > 0 ? (
        <View style={styles.attachRow}>
          <Ionicons name="attach" size={13} color={theme.textSoft} />
          <Text style={{ fontSize: 12, color: theme.textSoft, marginStart: 4 }}>
            {item.attachments.length} pièce{item.attachments.length > 1 ? 's' : ''} jointe{item.attachments.length > 1 ? 's' : ''}
          </Text>
        </View>
      ) : null}
      <View style={styles.metaRow}>
        <Text style={[styles.classText, { color: theme.text }]}>{item.classeId}</Text>
        <Text style={[styles.dueDate, { color: theme.textSoft }]}>À rendre : {formatDate(item.dateLimite)}</Text>
      </View>
      <TouchableOpacity onPress={() => openWithReuse(item)} style={[styles.reuseChip, { backgroundColor: theme.primarySurface }]}>
        <Ionicons name="copy-outline" size={12} color={theme.primary} />
        <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '700', marginStart: 4 }}>
          Réutiliser
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScreenLayout title="Mes devoirs">
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {loading && devoirs.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : devoirs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            Aucun devoir pour l'instant.{'\n'}Touche le bouton + pour en créer un.
          </Text>
        </View>
      ) : (
        <FlatList
          data={devoirs}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={openCreate}
        accessibilityLabel="Créer un devoir"
      >
        <Text style={[styles.fabText, { color: theme.white }]}>+</Text>
      </TouchableOpacity>

      <CreateDevoirModal
        visible={modalOpen}
        defaultClasse={routeClasse || profile?.classe}
        prefill={prefill}
        onClose={() => setModalOpen(false)}
        onCreated={() => { setModalOpen(false); load() }}
      />
    </ScreenLayout>
  );
}

// ─── Create devoir modal ─────────────────────────────────────────────────────
function CreateDevoirModal({
  visible, defaultClasse, prefill, onClose, onCreated,
}: {
  visible:       boolean
  defaultClasse?: string
  prefill?:      Devoir | null
  onClose:       () => void
  onCreated:     () => void
}) {
  const theme = useTheme();
  const { profile } = useAuth();
  const [titre,       setTitre]       = useState('');
  const [description, setDescription] = useState('');
  const [type,        setType]        = useState<string>(TYPES[0]);
  const [classeId,    setClasseId]    = useState(defaultClasse || '');
  const [dateLimite,  setDateLimite]  = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading,   setUploading]   = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');

  // Init form quand le modal s'ouvre (prefill éventuel)
  useEffect(() => {
    if (!visible) return
    if (prefill) {
      setTitre(prefill.titre)
      setDescription(prefill.description || '')
      setType(prefill.type || TYPES[0])
      setClasseId(prefill.classeId || defaultClasse || '')
      // On laisse dateLimite VIDE volontairement : le prof doit choisir
      // une nouvelle date pour le devoir réutilisé.
      setDateLimite('')
      setAttachments(prefill.attachments ? [...prefill.attachments] : [])
    } else {
      setTitre(''); setDescription(''); setType(TYPES[0])
      setClasseId(defaultClasse || ''); setDateLimite(''); setAttachments([])
    }
    setErr('')
  }, [visible, prefill, defaultClasse])

  const pickPhoto = async (fromCamera: boolean) => {
    if (!profile) return
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (perm.status !== 'granted') {
        Alert.alert('Permission refusée', 'Impossible d\'accéder à la caméra / galerie.')
        return
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({  mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
      if (result.canceled || !result.assets?.[0]) return
      const a = result.assets[0]
      const name = a.fileName || `photo_${Date.now()}.jpg`
      setUploading(true)
      try {
        const att = await uploadAttachment(a.uri, 'devoirs', profile.uid, name, a.mimeType || 'image/jpeg')
        setAttachments(prev => [...prev, att])
      } catch (e: any) {
        Alert.alert('Erreur', e?.message || 'Upload échoué.')
      } finally {
        setUploading(false)
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Sélection d\'image impossible.')
    }
  }

  const pickPdf = async () => {
    if (!profile) return
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (result.canceled || !result.assets?.[0]) return
      const a = result.assets[0]
      setUploading(true)
      try {
        const att = await uploadAttachment(a.uri, 'devoirs', profile.uid, a.name, a.mimeType || 'application/octet-stream')
        setAttachments(prev => [...prev, att])
      } catch (e: any) {
        Alert.alert('Erreur', e?.message || 'Upload échoué.')
      } finally {
        setUploading(false)
      }
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Sélection de fichier impossible.')
    }
  }

  const removeAttachment = (i: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== i))
  }

  const submit = async () => {
    if (!profile) { setErr('Profil non chargé.'); return }
    if (!titre.trim())    { setErr('Le titre est requis.'); return }
    if (!classeId.trim()) { setErr('La classe cible est requise.'); return }
    if (!dateLimite.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dateLimite)) {
      setErr('Date limite invalide (format YYYY-MM-DD).'); return
    }
    setSaving(true); setErr('');
    try {
      await addDoc(collection(db, 'devoirs'), {
        titre:       titre.trim(),
        description: description.trim(),
        type,
        classeId:    classeId.trim(),
        teacherId:   profile.uid,
        teacherNom:  `${profile.prenom} ${profile.nom}`,
        dateLimite,
        attachments,
        createdAt:   serverTimestamp(),
      })
      onCreated()
    } catch (e: any) {
      setErr(e?.message || 'Erreur lors de la création.')
      Alert.alert('Erreur', e?.message || 'Impossible de créer le devoir.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: theme.text, fontSize: 16 }}>Annuler</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            {prefill ? 'Réutiliser un devoir' : 'Nouveau devoir'}
          </Text>
          <TouchableOpacity onPress={submit} disabled={saving || uploading}>
            {saving
              ? <ActivityIndicator color={theme.primary} />
              : <Text style={{ color: theme.primary, fontSize: 16, fontWeight: '700' }}>Créer</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
          {prefill ? (
            <View style={[styles.prefillBanner, { backgroundColor: theme.primarySurface }]}>
              <Ionicons name="copy-outline" size={14} color={theme.primary} />
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600', marginStart: 6, flex: 1 }}>
                Brouillon basé sur "{prefill.titre}". Ajuste les champs au besoin.
              </Text>
            </View>
          ) : null}

          {err ? (
            <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
              <Text style={{ color: theme.danger, fontSize: 13 }}>{err}</Text>
            </View>
          ) : null}

          <Text style={[styles.label, { color: theme.textSoft }]}>Titre *</Text>
          <TextInput
            value={titre} onChangeText={setTitre}
            placeholder="Ex : Exercices Chapitre 3"
            placeholderTextColor={theme.textSoft}
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
            maxLength={100}
          />

          <Text style={[styles.label, { color: theme.textSoft, marginTop: 12 }]}>Description</Text>
          <TextInput
            value={description} onChangeText={setDescription}
            placeholder="Détails, consignes…"
            placeholderTextColor={theme.textSoft}
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white, minHeight: 90 }]}
            multiline textAlignVertical="top"
            maxLength={1000}
          />

          <Text style={[styles.label, { color: theme.textSoft, marginTop: 12 }]}>Type</Text>
          <View style={styles.chipRow}>
            {TYPES.map(t => {
              const active = type === t
              return (
                <TouchableOpacity key={t}
                  onPress={() => setType(t)}
                  style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primarySurface : 'transparent' }]}
                >
                  <Text style={{ color: active ? theme.primary : theme.textSoft, fontWeight: active ? '700' : '500', fontSize: 12 }}>{t}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={[styles.label, { color: theme.textSoft, marginTop: 12 }]}>Classe cible *</Text>
          <TextInput
            value={classeId} onChangeText={setClasseId}
            placeholder="Ex : 1APIC-3"
            placeholderTextColor={theme.textSoft}
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
            autoCapitalize="characters"
            maxLength={20}
          />

          <Text style={[styles.label, { color: theme.textSoft, marginTop: 12 }]}>
            Date limite * <Text style={{ fontWeight: '400', textTransform: 'none' }}>(YYYY-MM-DD)</Text>
          </Text>
          <TextInput
            value={dateLimite} onChangeText={setDateLimite}
            placeholder="2026-05-30"
            placeholderTextColor={theme.textSoft}
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white, fontFamily: 'monospace' }]}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />

          {/* Pièces jointes */}
          <Text style={[styles.label, { color: theme.textSoft, marginTop: 14 }]}>Pièces jointes</Text>
          <View style={styles.attachBtnRow}>
            <TouchableOpacity
              style={[styles.attachBtn, { borderColor: theme.border, backgroundColor: theme.white }]}
              onPress={() => pickPhoto(true)}
              disabled={uploading}
            >
              <Ionicons name="camera-outline" size={18} color={theme.primary} />
              <Text style={[styles.attachBtnText, { color: theme.text }]}>Photo du tableau</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.attachBtn, { borderColor: theme.border, backgroundColor: theme.white }]}
              onPress={() => pickPhoto(false)}
              disabled={uploading}
            >
              <Ionicons name="image-outline" size={18} color={theme.primary} />
              <Text style={[styles.attachBtnText, { color: theme.text }]}>Galerie</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.attachBtn, { borderColor: theme.border, backgroundColor: theme.white }]}
              onPress={pickPdf}
              disabled={uploading}
            >
              <Ionicons name="document-outline" size={18} color={theme.primary} />
              <Text style={[styles.attachBtnText, { color: theme.text }]}>PDF / Fichier</Text>
            </TouchableOpacity>
          </View>

          {uploading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <ActivityIndicator color={theme.primary} />
              <Text style={{ color: theme.textSoft, fontSize: 13 }}>Téléversement en cours…</Text>
            </View>
          ) : null}

          {attachments.length > 0 && (
            <View style={{ marginTop: 12 }}>
              {attachments.map((a, i) => (
                <View key={a.url + i} style={[styles.attachItem, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  {a.mime.startsWith('image/') ? (
                    <Image source={{ uri: a.url }} style={styles.attachThumb} />
                  ) : (
                    <View style={[styles.attachThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primarySurface }]}>
                      <Ionicons name="document" size={22} color={theme.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1, marginStart: 10 }}>
                    <Text style={[styles.attachName, { color: theme.text }]} numberOfLines={1}>{a.name}</Text>
                    <Text style={[styles.attachMeta, { color: theme.textSoft }]} numberOfLines={1}>
                      {a.mime}{a.size ? ` · ${Math.round(a.size / 1024)} KB` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeAttachment(i)}>
                    <Ionicons name="close-circle" size={22} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  listContainer: { paddingBottom: 100 },
  card:          { padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1 },
  cardHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title:         { fontSize: 15, fontWeight: '800', flex: 1, marginEnd: 8 },
  typeTag:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  desc:          { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  attachRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  metaRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  classText:     { fontSize: 13, fontWeight: '600' },
  dueDate:       { fontSize: 12 },
  reuseChip:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 4 },
  loading:       { paddingVertical: 40, alignItems: 'center' },
  empty:         { paddingVertical: 60, alignItems: 'center' },
  errorBox:      { padding: 12, borderRadius: 10, marginBottom: 12 },
  fab: {
    position: 'absolute', bottom: 24, end: 24,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 }, shadowRadius: 6,
  },
  fabText: { fontSize: 32, fontWeight: '700', lineHeight: 36, marginTop: -2 },

  // Modal
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  modalTitle:  { fontSize: 16, fontWeight: '700' },
  modalBody:   { padding: 16, paddingBottom: 60 },
  label:       { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input:       { borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 15 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },

  prefillBanner: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 12 },

  attachBtnRow:  { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  attachBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, flexGrow: 1 },
  attachBtnText: { fontSize: 13, fontWeight: '600' },

  attachItem:    { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  attachThumb:   { width: 44, height: 44, borderRadius: 8 },
  attachName:    { fontSize: 13, fontWeight: '600' },
  attachMeta:    { fontSize: 11, marginTop: 2 },
});
