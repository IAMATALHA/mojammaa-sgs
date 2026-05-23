import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import ScreenLayout from '../../components/ScreenLayout';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';

type Audience = 'all' | 'admins' | 'teachers' | 'parents';

const AUDIENCES: { key: Audience; label: string; toId: string }[] = [
  { key: 'all',      label: 'Tout le monde',      toId: 'all' },
  { key: 'admins',   label: 'Administrateurs',    toId: 'admin' },
  { key: 'teachers', label: 'Professeurs',        toId: 'teachers' },
  { key: 'parents',  label: 'Parents (broadcast)', toId: 'all' }, // 'all' inclut les parents
];

export default function AdminBroadcastScreen() {
  const theme = useTheme();
  const { profile } = useAuth();
  const [subject,  setSubject]  = useState('');
  const [body,     setBody]     = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSend = async () => {
    if (!subject.trim()) { setError("L'objet est requis."); return }
    if (!body.trim())    { setError('Le message est requis.'); return }
    if (!profile)        { setError('Profil non chargé.'); return }
    setSending(true); setError('');
    try {
      const target = AUDIENCES.find(a => a.key === audience)!
      await addDoc(collection(db, 'messages'), {
        fromId:   profile.uid,
        fromNom:  `${profile.prenom} ${profile.nom}`,
        fromRole: profile.role,
        toId:     target.toId,
        toNom:    target.label,
        destinataireType:  audience,
        destinataireLabel: target.label,
        subject:  subject.trim(),
        body:     body.trim(),
        priority,
        priorite: priority,
        canal:    'interne',
        read:     false,
        lu:       false,
        createdAt: serverTimestamp(),
      })
      Alert.alert('Envoyé', `Annonce envoyée à : ${target.label}.`)
      setSubject(''); setBody(''); setPriority('normal')
    } catch (e: any) {
      setError(e?.message || "Erreur lors de l'envoi.")
    } finally {
      setSending(false)
    }
  };

  return (
    <ScreenLayout title="Messagerie">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
              <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          {/* Audience */}
          <Text style={[styles.label, { color: theme.textSoft }]}>Destinataires</Text>
          <View style={styles.row}>
            {AUDIENCES.map(a => {
              const active = audience === a.key
              return (
                <TouchableOpacity
                  key={a.key}
                  onPress={() => setAudience(a.key)}
                  style={[
                    styles.chip,
                    { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primarySurface : 'transparent' },
                  ]}
                >
                  <Text style={{ color: active ? theme.primary : theme.textSoft, fontWeight: active ? '700' : '500', fontSize: 12 }}>
                    {a.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Subject */}
          <Text style={[styles.label, { color: theme.textSoft, marginTop: 16 }]}>Objet</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Ex : Réunion parents-profs"
            placeholderTextColor={theme.textSoft}
            style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
            maxLength={120}
          />

          {/* Body */}
          <Text style={[styles.label, { color: theme.textSoft, marginTop: 12 }]}>Message</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Saisissez votre annonce…"
            placeholderTextColor={theme.textSoft}
            style={[styles.input, styles.textarea, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />

          {/* Priority */}
          <Text style={[styles.label, { color: theme.textSoft, marginTop: 12 }]}>Priorité</Text>
          <View style={styles.row}>
            {(['normal', 'urgent'] as const).map(p => {
              const active = priority === p
              const color  = p === 'urgent' ? theme.danger : theme.primary
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => setPriority(p)}
                  style={[
                    styles.chip,
                    { borderColor: active ? color : theme.border, backgroundColor: active ? color + '15' : 'transparent' },
                  ]}
                >
                  <Text style={{ color: active ? color : theme.textSoft, fontWeight: active ? '700' : '500', fontSize: 12 }}>
                    {p === 'urgent' ? '🚨 Urgent' : 'Normale'}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.primary, opacity: sending ? 0.7 : 1 }]}
            onPress={handleSend}
            disabled={sending}
          >
            {sending
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: theme.white, fontSize: 15, fontWeight: '800' }}>Envoyer l'annonce</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  label:     { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  row:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  input:     { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 15 },
  textarea:  { minHeight: 140 },
  btn:       { marginTop: 20, padding: 16, borderRadius: 14, alignItems: 'center' },
  errorBox:  { padding: 12, borderRadius: 10, marginBottom: 12 },
});
