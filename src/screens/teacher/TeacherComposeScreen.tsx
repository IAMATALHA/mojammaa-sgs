/**
 * TeacherComposeScreen — écrire un message à toutes les classes du prof.
 *
 * UX :
 *   1. Pick des classes (chips multi-select)
 *   2. Champ Sujet (1 ligne)
 *   3. Champ Corps (multiline)
 *   4. Toggle Urgent
 *   5. Bouton Envoyer
 *   6. Résultat : "X parents notifiés"
 *
 * Tous les destinataires sont les parents des élèves dans les classes
 * choisies. Le hook useParentMessages les fera apparaître côté parent.
 */

import React, { useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import {
  ChevronLeft, Send, AlertCircle, Users, Megaphone,
} from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { broadcastToClasses } from '../../services/messagesService'

export default function TeacherComposeScreen() {
  const theme = useTheme()
  const { profile } = useAuth()
  const nav = useNavigation<any>()

  const availableClasses = useMemo(() => {
    if (!profile) return []
    if (Array.isArray((profile as any).classes) && (profile as any).classes.length > 0) {
      return (profile as any).classes as string[]
    }
    if ((profile as any).classe) return [(profile as any).classe as string]
    return []
  }, [profile])

  const [selectedClasses, setSelectedClasses] = useState<string[]>(availableClasses)
  const [subject, setSubject] = useState('')
  const [body,    setBody]    = useState('')
  const [urgent,  setUrgent]  = useState(false)
  const [sending, setSending] = useState(false)

  const toggleClass = (c: string) => {
    setSelectedClasses(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c],
    )
  }

  const canSend =
    !sending &&
    selectedClasses.length > 0 &&
    subject.trim().length > 0 &&
    body.trim().length > 0

  const send = async () => {
    if (!profile || !canSend) return
    setSending(true)
    try {
      const result = await broadcastToClasses({
        classes:  selectedClasses,
        subject:  subject.trim(),
        body:     body.trim(),
        urgent,
        category: 'announcement',
        teacher:  { uid: profile.uid, nom: profile.nom, prenom: profile.prenom },
      })
      Alert.alert(
        'Message envoyé',
        result.parentsTargeted === 0
          ? 'Aucun parent ne correspond à ces classes.'
          : `${result.parentsTargeted} parent${result.parentsTargeted > 1 ? 's' : ''} touché${result.parentsTargeted > 1 ? 's' : ''} ` +
            `· ${result.pushSent} notif${result.pushSent > 1 ? 's' : ''} push envoyée${result.pushSent > 1 ? 's' : ''}.`,
        [{ text: 'OK', onPress: () => nav.goBack() }],
      )
    } catch (e: any) {
      Alert.alert('Échec', e?.message || 'Erreur lors de l\'envoi.')
    } finally {
      setSending(false)
    }
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={10}
          style={[styles.iconBtn, { backgroundColor: theme.surface }]}
        >
          <ChevronLeft size={20} color={theme.text} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1, marginStart: 12 }}>
          <Text style={{
            color: theme.text,
            fontFamily: theme.fonts.black,
            fontSize: theme.fontSize.h3,
          }}>
            Nouveau message
          </Text>
          <Text style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: 12,
            marginTop: 2,
          }}>
            Aux parents des classes sélectionnées
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Classes selector */}
        <Text style={[styles.label, { color: theme.textSoft }]}>Destinataires</Text>
        <View style={styles.chipsRow}>
          {availableClasses.length === 0 ? (
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>
              Aucune classe attribuée à ton compte.
            </Text>
          ) : (
            availableClasses.map(c => {
              const active = selectedClasses.includes(c)
              return (
                <Pressable
                  key={c}
                  onPress={() => toggleClass(c)}
                  android_ripple={{ color: theme.border }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: active ? theme.primary : theme.surface,
                      borderColor:     active ? theme.primary : theme.border,
                    },
                    pressed && { opacity: 0.88 },
                  ]}
                >
                  <Users size={13} color={active ? '#fff' : theme.textSoft} strokeWidth={1.75} />
                  <Text style={{
                    color: active ? '#fff' : theme.text,
                    fontFamily: theme.fonts.semibold,
                    fontSize: 12.5,
                    marginStart: 6,
                  }}>
                    {c}
                  </Text>
                </Pressable>
              )
            })
          )}
        </View>

        {/* Subject */}
        <Text style={[styles.label, { color: theme.textSoft, marginTop: 18 }]}>Sujet</Text>
        <View style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="ex: Rappel devoirs lundi"
            placeholderTextColor={theme.textMuted}
            style={{
              color: theme.text,
              fontFamily: theme.fonts.medium,
              fontSize: 15,
              paddingVertical: 0,
            }}
            maxLength={80}
          />
        </View>

        {/* Body */}
        <Text style={[styles.label, { color: theme.textSoft, marginTop: 18 }]}>Message</Text>
        <View style={[styles.input, styles.inputMulti, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Écrivez votre message ici…"
            placeholderTextColor={theme.textMuted}
            multiline
            textAlignVertical="top"
            style={{
              color: theme.text,
              fontFamily: theme.fonts.regular,
              fontSize: 14,
              lineHeight: 21,
              minHeight: 140,
            }}
            maxLength={1500}
          />
          <Text style={{
            color: theme.textMuted, fontFamily: theme.fonts.regular,
            fontSize: 11, textAlign: 'right', marginTop: 6,
          }}>
            {body.length}/1500
          </Text>
        </View>

        {/* Urgent toggle */}
        <Pressable
          onPress={() => setUrgent(u => !u)}
          android_ripple={{ color: theme.border }}
          style={({ pressed }) => [
            styles.urgentToggle,
            {
              backgroundColor: urgent ? theme.dangerSurface : theme.surface,
              borderColor:     urgent ? theme.primaryBorder : theme.border,
            },
            pressed && { opacity: 0.92 },
          ]}
        >
          <AlertCircle size={16} color={urgent ? theme.danger : theme.textSoft} strokeWidth={2} />
          <View style={{ flex: 1, marginStart: 12 }}>
            <Text style={{
              color: theme.text,
              fontFamily: theme.fonts.bold,
              fontSize: 13.5,
            }}>
              Marquer comme urgent
            </Text>
            <Text style={{
              color: theme.textSoft,
              fontFamily: theme.fonts.regular,
              fontSize: 11.5,
              marginTop: 2,
            }}>
              La notification arrivera avec un préfixe 🚨 et un badge rouge.
            </Text>
          </View>
          <View style={[
            styles.toggleDot,
            {
              backgroundColor: urgent ? theme.danger : theme.borderStrong,
            },
          ]} />
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Send button */}
      <View style={[styles.footer, { backgroundColor: theme.bg, borderTopColor: theme.border }]}>
        <Pressable
          onPress={send}
          disabled={!canSend}
          android_ripple={{ color: '#ffffff20' }}
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: canSend ? theme.primary : theme.surfaceAlt,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Send size={18} color={canSend ? '#fff' : theme.textMuted} strokeWidth={2} />
              <Text style={{
                color: canSend ? '#fff' : theme.textMuted,
                fontFamily: theme.fonts.bold,
                fontSize: 15,
                marginStart: 8,
              }}>
                Envoyer
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 20, paddingTop: 8 },
  label: {
    fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1,
  },
  input: {
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  inputMulti: { paddingVertical: 12 },
  urgentToggle: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 14, borderWidth: 1,
    marginTop: 18,
  },
  toggleDot: {
    width: 18, height: 18, borderRadius: 9,
    marginStart: 8,
  },
  footer: {
    padding: 16, borderTopWidth: StyleSheet.hairlineWidth,
  },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14,
  },
})
