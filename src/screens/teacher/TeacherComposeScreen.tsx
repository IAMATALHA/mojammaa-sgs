import React, { useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, Alert, ActivityIndicator, TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft, Send, AlertCircle, Users,
} from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { broadcastToClasses } from '../../services/messagesService'
import { MESSAGE_TEMPLATES, fillTemplate, type MessageTemplate } from '../../data/messageTemplates'

type Step = 'template' | 'variables' | 'classes' | 'preview'

export default function TeacherComposeScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'fr' | 'ar' | 'en'
  const { profile } = useAuth()
  const nav = useNavigation<any>()

  const availableClasses = useMemo(() => {
    if (!profile) return []
    if (Array.isArray((profile as any).classes) && (profile as any).classes.length > 0) return (profile as any).classes as string[]
    if ((profile as any).classe) return [(profile as any).classe as string]
    return []
  }, [profile])

  const [step, setStep] = useState<Step>('template')
  const [selected, setSelected] = useState<MessageTemplate | null>(null)
  const [vars, setVars] = useState<Record<string, string>>({})
  const [selectedClasses, setSelectedClasses] = useState<string[]>(availableClasses)
  const [urgent, setUrgent] = useState(false)
  const [sending, setSending] = useState(false)
  const [freeSubject, setFreeSubject] = useState('')
  const [freeBody, setFreeBody] = useState('')

  const isFreeMode = selected?.id === 'free'

  const title = (tmpl: MessageTemplate) =>
    lang === 'ar' ? tmpl.title_ar : lang === 'en' ? tmpl.title_en : tmpl.title_fr

  const templateText = useMemo(() => {
    if (!selected || isFreeMode) return freeBody
    const tmpl = lang === 'ar' ? selected.template_ar : lang === 'en' ? selected.template_en : selected.template_fr
    return fillTemplate(tmpl, { ...vars, elevePrenom: '{élève}' })
  }, [selected, vars, lang, freeBody, isFreeMode])

  const subjectText = isFreeMode ? freeSubject : selected ? title(selected) : ''

  const toggleClass = (c: string) => {
    setSelectedClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  const canSend = selectedClasses.length > 0 && (isFreeMode ? freeSubject.trim() && freeBody.trim() : selected != null)

  const handleSend = async () => {
    if (!profile || !canSend) return
    setSending(true)
    try {
      const result = await broadcastToClasses({
        classes: selectedClasses,
        subject: subjectText,
        body: templateText,
        urgent,
        category: 'announcement',
        teacher: { uid: profile.uid, nom: profile.nom, prenom: profile.prenom },
      })
      Alert.alert(
        t('teacher.messageSent'),
        result.parentsTargeted === 0
          ? t('teacher.noParents')
          : `${result.parentsTargeted} parent(s) · ${result.pushSent} push`,
        [{ text: 'OK', onPress: () => nav.goBack() }],
      )
    } catch (e: any) {
      Alert.alert(t('teacher.sendFailed'), e?.message)
    } finally {
      setSending(false)
    }
  }

  const varLabel = (v: any) =>
    lang === 'ar' ? v.label_ar : lang === 'en' ? v.label_en : v.label_fr

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => step === 'template' ? nav.goBack() : setStep(step === 'preview' ? 'classes' : step === 'classes' ? 'variables' : 'template')} hitSlop={10}
          style={[styles.iconBtn, { backgroundColor: theme.surface }]}>
          <ChevronLeft size={20} color={theme.text} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1, marginStart: 12 }}>
          <Text style={{ color: theme.text, fontFamily: theme.fonts.black, fontSize: 18 }}>
            {t('teacher.newMessage')}
          </Text>
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>
            {step === 'template' ? '1/4' : step === 'variables' ? '2/4' : step === 'classes' ? '3/4' : '4/4'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Step 1: Template selection ───────────────── */}
        {step === 'template' && (
          <>
            {/* Free message option */}
            <Pressable
              onPress={() => { setSelected({ id: 'free', categorie: '', icon: '✏️', color: theme.primary, title_fr: '', title_ar: '', title_en: '', template_fr: '', template_ar: '', template_en: '', variables: [] }); setStep('variables') }}
              style={[styles.templateCard, { borderColor: theme.primary, backgroundColor: theme.primarySurface }]}
            >
              <Text style={{ fontSize: 22 }}>✏️</Text>
              <View style={{ flex: 1, marginStart: 12 }}>
                <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 15 }}>
                  {lang === 'ar' ? 'رسالة حرة' : lang === 'en' ? 'Free message' : 'Message libre'}
                </Text>
                <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>
                  {lang === 'ar' ? 'اكتب رسالتك بنفسك' : lang === 'en' ? 'Write your own message' : 'Écrivez votre propre message'}
                </Text>
              </View>
            </Pressable>

            {MESSAGE_TEMPLATES.map(tmpl => (
              <Pressable
                key={tmpl.id}
                onPress={() => { setSelected(tmpl); setVars({}); setStep('variables') }}
                style={[styles.templateCard, { borderColor: tmpl.color + '40', backgroundColor: tmpl.color + '10' }]}
              >
                <View style={[styles.templateIcon, { backgroundColor: tmpl.color }]}>
                  <Text style={{ fontSize: 18 }}>{tmpl.icon}</Text>
                </View>
                <View style={{ flex: 1, marginStart: 12 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{title(tmpl)}</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>{tmpl.categorie}</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}

        {/* ── Step 2: Variables / Free compose ────────── */}
        {step === 'variables' && selected && (
          <>
            {isFreeMode ? (
              <>
                <Text style={[styles.label, { color: theme.textSoft }]}>{t('compose.subject')}</Text>
                <TextInput
                  value={freeSubject} onChangeText={setFreeSubject}
                  placeholder="Ex: Rappel devoirs"
                  placeholderTextColor={theme.textMuted}
                  style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
                  maxLength={80}
                />
                <Text style={[styles.label, { color: theme.textSoft, marginTop: 14 }]}>{t('compose.body')}</Text>
                <TextInput
                  value={freeBody} onChangeText={setFreeBody}
                  placeholder={t('teacher.writeMessage')}
                  placeholderTextColor={theme.textMuted}
                  style={[styles.input, styles.textarea, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
                  multiline textAlignVertical="top"
                  maxLength={1500}
                />
              </>
            ) : (
              <>
                <View style={[styles.templateHeader, { backgroundColor: selected.color + '15', borderColor: selected.color + '30' }]}>
                  <Text style={{ fontSize: 20 }}>{selected.icon}</Text>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16, marginStart: 10 }}>{title(selected)}</Text>
                </View>

                {selected.variables.map(v => (
                  <View key={v.key} style={{ marginBottom: 14 }}>
                    <Text style={[styles.label, { color: theme.textSoft }]}>{varLabel(v)}</Text>
                    {v.type === 'select' && v.options ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
                        {v.options.map(opt => {
                          const active = vars[v.key] === opt
                          return (
                            <TouchableOpacity key={opt} onPress={() => setVars(prev => ({ ...prev, [v.key]: opt }))}
                              style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
                              <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '600', fontSize: 12 }}>{opt}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </ScrollView>
                    ) : (
                      <TextInput
                        value={vars[v.key] || ''}
                        onChangeText={val => setVars(prev => ({ ...prev, [v.key]: val }))}
                        placeholder={v.placeholder}
                        placeholderTextColor={theme.textMuted}
                        keyboardType={v.type === 'number' ? 'numeric' : 'default'}
                        style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
                      />
                    )}
                  </View>
                ))}

                {/* Live preview */}
                <View style={[styles.previewBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={{ color: theme.textSoft, fontWeight: '700', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    {lang === 'ar' ? 'معاينة' : lang === 'en' ? 'Preview' : 'Aperçu'}
                  </Text>
                  <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21, writingDirection: lang === 'ar' ? 'rtl' : 'ltr' }}>
                    {templateText}
                  </Text>
                </View>
              </>
            )}
          </>
        )}

        {/* ── Step 3: Class selection ─────────────────── */}
        {step === 'classes' && (
          <>
            <Text style={[styles.label, { color: theme.textSoft }]}>{t('teacher.recipients')}</Text>
            <View style={styles.classGrid}>
              {availableClasses.map(c => {
                const active = selectedClasses.includes(c)
                return (
                  <TouchableOpacity key={c} onPress={() => toggleClass(c)}
                    style={[styles.classChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
                    <Users size={14} color={active ? '#fff' : theme.textSoft} strokeWidth={1.75} />
                    <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '700', fontSize: 13, marginStart: 6 }}>{c}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Urgent toggle */}
            <Pressable onPress={() => setUrgent(u => !u)}
              style={[styles.urgentToggle, { backgroundColor: urgent ? theme.dangerSurface : theme.surface, borderColor: urgent ? theme.danger : theme.border }]}>
              <AlertCircle size={16} color={urgent ? theme.danger : theme.textSoft} strokeWidth={2} />
              <Text style={{ flex: 1, marginStart: 10, color: theme.text, fontWeight: '700', fontSize: 13 }}>{t('teacher.markUrgent')}</Text>
              <View style={[styles.toggleDot, { backgroundColor: urgent ? theme.danger : theme.borderStrong }]} />
            </Pressable>
          </>
        )}

        {/* ── Step 4: Preview & Send ──────────────────── */}
        {step === 'preview' && (
          <>
            <View style={[styles.confirmCard, { backgroundColor: theme.primarySurface, borderColor: theme.primaryBorder }]}>
              <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' }}>{subjectText}</Text>
              <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21, marginTop: 10, writingDirection: lang === 'ar' ? 'rtl' : 'ltr' }}>{templateText}</Text>
              <View style={[styles.divider, { backgroundColor: theme.primaryBorder }]} />
              <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 13 }}>
                → {selectedClasses.join(', ')}
              </Text>
              {urgent && <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 12, marginTop: 4 }}>🚨 {t('compose.urgent')}</Text>}
            </View>
          </>
        )}
      </ScrollView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { borderTopColor: theme.border }]}>
        {step !== 'template' && (
          <TouchableOpacity onPress={() => setStep(step === 'preview' ? 'classes' : step === 'classes' ? 'variables' : 'template')}
            style={[styles.backBtn, { borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{t('common.back')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => {
            if (step === 'template') return
            if (step === 'variables') setStep('classes')
            else if (step === 'classes') setStep('preview')
            else if (step === 'preview') handleSend()
          }}
          disabled={step === 'template' || (step === 'preview' && !canSend) || sending}
          style={[styles.nextBtn, {
            backgroundColor: (step === 'template' || (step === 'preview' && !canSend)) ? theme.surfaceAlt : theme.primary,
            flex: step === 'template' ? 0 : 2,
          }]}
        >
          {sending ? <ActivityIndicator color="#fff" /> : (
            <Text style={{ color: step === 'template' ? theme.textMuted : '#fff', fontWeight: '800', fontSize: 15 }}>
              {step === 'preview' ? t('compose.send') : t('common.confirm')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },

  templateCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 8 },
  templateIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  templateHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },

  label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 15 },
  textarea: { minHeight: 120 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },

  previewBox: { padding: 16, borderRadius: 14, borderWidth: 1, marginTop: 16 },

  classGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  classChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5 },

  urgentToggle: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, marginTop: 18 },
  toggleDot: { width: 18, height: 18, borderRadius: 9, marginStart: 8 },

  confirmCard: { padding: 18, borderRadius: 16, borderWidth: 1 },
  divider: { height: 1, marginVertical: 12 },

  bottomBar: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  backBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5 },
  nextBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
})
