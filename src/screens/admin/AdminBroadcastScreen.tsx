import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
  Pressable, FlatList,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Send, Search, X, Users, GraduationCap, ChevronRight } from 'lucide-react-native'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  broadcast, getRecipientsList,
  type MessageToType, type MessageType,
} from '../../services/messagesService'
import { MESSAGE_TEMPLATES, fillTemplate, type MessageTemplate } from '../../data/messageTemplates'

type Step = 'type' | 'target' | 'compose' | 'confirm'
type MsgType = 'announcement' | 'direct'
type TargetMode = 'all' | 'parents' | 'teachers' | 'class' | 'person'

interface Recipient {
  uid: string
  nom: string
  prenom: string
  email: string
  role: string
  detail: string
}

export default function AdminBroadcastScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'fr' | 'ar' | 'en'
  const { profile } = useAuth()

  const [step, setStep] = useState<Step>('type')
  const [msgType, setMsgType] = useState<MsgType>('announcement')
  const [targetMode, setTargetMode] = useState<TargetMode>('all')
  const [selectedClasses, setSelectedClasses] = useState<string[]>([])
  const [selectedPerson, setSelectedPerson] = useState<Recipient | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [sending, setSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null)
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({})
  const [useTemplate, setUseTemplate] = useState(false)

  const [availableClasses, setAvailableClasses] = useState<string[]>([])
  const [allParents, setAllParents] = useState<Recipient[]>([])
  const [allTeachers, setAllTeachers] = useState<Recipient[]>([])
  const [loadingRecipients, setLoadingRecipients] = useState(false)

  const loadRecipients = useCallback(async () => {
    setLoadingRecipients(true)
    try {
      const data = await getRecipientsList()
      setAvailableClasses(data.classes)
      setAllParents(data.parents.map(p => ({
        uid: p.uid, nom: p.nom, prenom: p.prenom, email: p.email,
        role: 'parent',
        detail: p.children.join(' · ') || '',
      })))
      setAllTeachers(data.teachers.map(p => ({
        uid: p.uid, nom: p.nom, prenom: p.prenom, email: p.email,
        role: 'professeur',
        detail: p.classes.join(', ') || '',
      })))
    } catch {}
    finally { setLoadingRecipients(false) }
  }, [])

  useEffect(() => { loadRecipients() }, [])

  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return []
    const list = targetMode === 'parents' ? allParents
      : targetMode === 'teachers' ? allTeachers
      : [...allParents, ...allTeachers]
    return list.filter(r =>
      `${r.prenom} ${r.nom}`.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.detail.toLowerCase().includes(q)
    ).slice(0, 20)
  }, [searchQuery, targetMode, allParents, allTeachers])

  const toggleClass = (c: string) => {
    setSelectedClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  const targetLabel = useMemo(() => {
    if (targetMode === 'all') return t('admin.everyone')
    if (targetMode === 'parents') return t('admin.parentsBroadcast')
    if (targetMode === 'teachers') return t('admin.teachers')
    if (targetMode === 'class') return selectedClasses.join(', ') || t('tabs.classes')
    if (targetMode === 'person' && selectedPerson) return `${selectedPerson.prenom} ${selectedPerson.nom}`
    return ''
  }, [targetMode, selectedClasses, selectedPerson, t])

  const targetCount = useMemo(() => {
    if (targetMode === 'all') return allParents.length + allTeachers.length
    if (targetMode === 'parents') return allParents.length
    if (targetMode === 'teachers') return allTeachers.length
    if (targetMode === 'class') return selectedClasses.length > 0 ? '~' : 0
    if (targetMode === 'person') return selectedPerson ? 1 : 0
    return 0
  }, [targetMode, allParents, allTeachers, selectedClasses, selectedPerson])

  const canProceed = () => {
    if (step === 'type') return true
    if (step === 'target') {
      if (targetMode === 'class') return selectedClasses.length > 0
      if (targetMode === 'person') return selectedPerson != null
      return true
    }
    if (step === 'compose') return subject.trim().length > 0 && body.trim().length > 0
    return true
  }

  const handleSend = async () => {
    if (!profile) return
    setSending(true)
    try {
      const fromNom = `${profile.prenom} ${profile.nom}`.trim()
      let toType: MessageToType = 'all'
      let toIds: string[] = []

      if (targetMode === 'all') {
        toType = 'all'; toIds = []
      } else if (targetMode === 'parents') {
        toType = 'parents'; toIds = allParents.map(p => p.uid)
      } else if (targetMode === 'teachers') {
        toType = 'teachers'; toIds = allTeachers.map(p => p.uid)
      } else if (targetMode === 'class') {
        toType = 'class'; toIds = selectedClasses
      } else if (targetMode === 'person' && selectedPerson) {
        toType = 'user'; toIds = [selectedPerson.uid]
      }

      const result = await broadcast({
        type:     msgType as MessageType,
        subject:  subject.trim(),
        body:     body.trim(),
        fromId:   profile.uid,
        fromNom,
        fromRole: profile.role || 'admin',
        toType,
        toIds,
        toLabel:  targetLabel,
        priority,
        category: 'announcement',
      })

      Alert.alert(
        t('admin.sent'),
        targetLabel,
        [{ text: 'OK', onPress: () => {
          setStep('type')
          setSubject(''); setBody(''); setPriority('normal')
          setSelectedClasses([]); setSelectedPerson(null)
          setSearchQuery('')
        }}],
      )
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message)
    } finally {
      setSending(false)
    }
  }

  const nextStep = () => {
    if (step === 'type') setStep('target')
    else if (step === 'target') setStep('compose')
    else if (step === 'compose') setStep('confirm')
  }

  const prevStep = () => {
    if (step === 'confirm') setStep('compose')
    else if (step === 'compose') setStep('target')
    else if (step === 'target') setStep('type')
  }

  return (
    <ScreenLayout title={t('admin.broadcast')}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>

          {/* Progress */}
          <View style={styles.progressRow}>
            {['type', 'target', 'compose', 'confirm'].map((s, i) => (
              <View key={s} style={[styles.progressDot, { backgroundColor: ['type', 'target', 'compose', 'confirm'].indexOf(step) >= i ? theme.primary : theme.border }]} />
            ))}
          </View>

          {/* ── Step 1: Type ────────────────────────── */}
          {step === 'type' && (
            <View>
              <Text style={[styles.stepTitle, { color: theme.text }]}>1. {t('compose.subject')}</Text>
              <Pressable
                onPress={() => { setMsgType('announcement'); setTargetMode('all') }}
                style={[styles.typeCard, { backgroundColor: msgType === 'announcement' ? theme.primarySurface : theme.surface, borderColor: msgType === 'announcement' ? theme.primary : theme.border }]}
              >
                <Send size={20} color={msgType === 'announcement' ? theme.primary : theme.textSoft} strokeWidth={1.75} />
                <View style={{ flex: 1, marginStart: 12 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{t('parent.announcementsTitle')}</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>Communication officielle</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => { setMsgType('direct'); setTargetMode('person') }}
                style={[styles.typeCard, { backgroundColor: msgType === 'direct' ? theme.primarySurface : theme.surface, borderColor: msgType === 'direct' ? theme.primary : theme.border }]}
              >
                <Users size={20} color={msgType === 'direct' ? theme.primary : theme.textSoft} strokeWidth={1.75} />
                <View style={{ flex: 1, marginStart: 12 }}>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>Message direct</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>Conversation privée</Text>
                </View>
              </Pressable>
            </View>
          )}

          {/* ── Step 2: Target ──────────────────────── */}
          {step === 'target' && msgType === 'announcement' && (
            <View>
              <Text style={[styles.stepTitle, { color: theme.text }]}>2. {t('teacher.recipients')}</Text>
              {[
                { mode: 'all' as TargetMode, label: t('admin.everyone'), icon: Users },
                { mode: 'parents' as TargetMode, label: t('admin.parentsBroadcast'), icon: Users },
                { mode: 'teachers' as TargetMode, label: t('admin.teachers'), icon: GraduationCap },
                { mode: 'class' as TargetMode, label: t('tabs.classes'), icon: GraduationCap },
              ].map(opt => (
                <Pressable key={opt.mode} onPress={() => setTargetMode(opt.mode)}
                  style={[styles.targetRow, { backgroundColor: targetMode === opt.mode ? theme.primarySurface : theme.surface, borderColor: targetMode === opt.mode ? theme.primary : theme.border }]}>
                  <opt.icon size={16} color={targetMode === opt.mode ? theme.primary : theme.textSoft} strokeWidth={2} />
                  <Text style={{ flex: 1, marginStart: 10, color: theme.text, fontWeight: '600', fontSize: 14 }}>{opt.label}</Text>
                  {targetMode === opt.mode && <ChevronRight size={16} color={theme.primary} strokeWidth={2} />}
                </Pressable>
              ))}

              {targetMode === 'class' && (
                <View style={styles.classChips}>
                  {availableClasses.map(c => {
                    const sel = selectedClasses.includes(c)
                    return (
                      <TouchableOpacity key={c} onPress={() => toggleClass(c)}
                        style={[styles.chip, { borderColor: sel ? theme.primary : theme.border, backgroundColor: sel ? theme.primary : 'transparent' }]}>
                        <Text style={{ color: sel ? '#fff' : theme.text, fontWeight: '700', fontSize: 13 }}>{c}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </View>
          )}

          {step === 'target' && msgType === 'direct' && (
            <View>
              <Text style={[styles.stepTitle, { color: theme.text }]}>2. {t('teacher.recipients')}</Text>

              <View style={styles.targetTabs}>
                {[
                  { mode: 'parents' as TargetMode, label: 'Parents' },
                  { mode: 'teachers' as TargetMode, label: t('admin.teachers') },
                ].map(opt => (
                  <TouchableOpacity key={opt.mode} onPress={() => { setTargetMode(opt.mode === 'parents' ? 'person' : 'person'); setTargetMode(opt.mode) }}
                    style={[styles.chip, { flex: 1, borderColor: targetMode === opt.mode ? theme.primary : theme.border, backgroundColor: targetMode === opt.mode ? theme.primary : 'transparent' }]}>
                    <Text style={{ color: targetMode === opt.mode ? '#fff' : theme.text, fontWeight: '700', fontSize: 13, textAlign: 'center' }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Search size={16} color={theme.textSoft} strokeWidth={2} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t('parent.searchMessages')}
                  placeholderTextColor={theme.textMuted}
                  style={{ flex: 1, color: theme.text, fontSize: 14, marginStart: 8, paddingVertical: 0 }}
                />
                {searchQuery ? (
                  <Pressable onPress={() => setSearchQuery('')}><X size={16} color={theme.textSoft} /></Pressable>
                ) : null}
              </View>

              {loadingRecipients ? (
                <ActivityIndicator color={theme.primary} style={{ marginTop: 20 }} />
              ) : (
                (searchQuery ? searchResults : (targetMode === 'teachers' ? allTeachers : allParents)).map(r => (
                  <Pressable key={r.uid} onPress={() => { setSelectedPerson(r); setTargetMode('person') }}
                    style={[styles.personRow, {
                      backgroundColor: selectedPerson?.uid === r.uid ? theme.primarySurface : theme.surface,
                      borderColor: selectedPerson?.uid === r.uid ? theme.primary : theme.border,
                    }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{r.prenom} {r.nom}</Text>
                      {r.detail ? <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>{r.detail}</Text> : null}
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          )}

          {/* ── Step 3: Compose ─────────────────────── */}
          {step === 'compose' && (
            <View>
              <Text style={[styles.stepTitle, { color: theme.text }]}>3. {t('compose.body')}</Text>

              {/* Template toggle for direct messages */}
              {msgType === 'direct' && !useTemplate && (
                <TouchableOpacity
                  onPress={() => setUseTemplate(true)}
                  style={[styles.templateToggle, { backgroundColor: theme.primarySurface, borderColor: theme.primaryBorder }]}
                >
                  <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>
                    📋 {lang === 'ar' ? 'استخدم نموذج جاهز' : lang === 'en' ? 'Use a template' : 'Utiliser un modèle prédéfini'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Template selection */}
              {useTemplate && !selectedTemplate && (() => {
                const relevantTemplates = MESSAGE_TEMPLATES.filter(tmpl => {
                  if (targetMode === 'teachers') return tmpl.target === 'teachers' || tmpl.target === 'all'
                  if (targetMode === 'parents' || targetMode === 'class' || targetMode === 'person') {
                    if (selectedPerson?.role === 'professeur') return tmpl.target === 'teachers' || tmpl.target === 'all'
                    return tmpl.target === 'parents' || tmpl.target === 'all'
                  }
                  return true
                })
                return (
                <>
                  <TouchableOpacity onPress={() => setUseTemplate(false)} style={{ marginBottom: 10 }}>
                    <Text style={{ color: theme.textSoft, fontSize: 13 }}>← {lang === 'ar' ? 'رسالة حرة' : lang === 'en' ? 'Free message' : 'Message libre'}</Text>
                  </TouchableOpacity>
                  {relevantTemplates.map(tmpl => (
                    <Pressable key={tmpl.id}
                      onPress={() => {
                        setSelectedTemplate(tmpl)
                        setTemplateVars({})
                        const titleKey = lang === 'ar' ? tmpl.title_ar : lang === 'en' ? tmpl.title_en : tmpl.title_fr
                        setSubject(titleKey)
                      }}
                      style={[styles.templateCard, { borderColor: tmpl.color + '40', backgroundColor: tmpl.color + '10' }]}>
                      <View style={[styles.templateIcon, { backgroundColor: tmpl.color }]}>
                        <Text style={{ fontSize: 16 }}>{tmpl.icon}</Text>
                      </View>
                      <View style={{ flex: 1, marginStart: 10 }}>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
                          {lang === 'ar' ? tmpl.title_ar : lang === 'en' ? tmpl.title_en : tmpl.title_fr}
                        </Text>
                        <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 1 }}>{tmpl.categorie}</Text>
                      </View>
                    </Pressable>
                  ))}
                </>
                )
              })()}

              {/* Template variables */}
              {selectedTemplate && (
                <>
                  <View style={[styles.templateHeader, { backgroundColor: selectedTemplate.color + '15', borderColor: selectedTemplate.color + '30' }]}>
                    <Text style={{ fontSize: 18 }}>{selectedTemplate.icon}</Text>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15, marginStart: 8, flex: 1 }}>
                      {lang === 'ar' ? selectedTemplate.title_ar : lang === 'en' ? selectedTemplate.title_en : selectedTemplate.title_fr}
                    </Text>
                    <TouchableOpacity onPress={() => { setSelectedTemplate(null); setBody('') }}>
                      <X size={18} color={theme.textSoft} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                  {selectedTemplate.variables.map(v => (
                    <View key={v.key} style={{ marginBottom: 12 }}>
                      <Text style={[styles.label, { color: theme.textSoft }]}>
                        {lang === 'ar' ? v.label_ar : lang === 'en' ? v.label_en : v.label_fr}
                      </Text>
                      {v.type === 'select' && v.options ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
                          {v.options.map(opt => {
                            const active = templateVars[v.key] === opt
                            return (
                              <TouchableOpacity key={opt} onPress={() => {
                                const nv = { ...templateVars, [v.key]: opt }
                                setTemplateVars(nv)
                                const tmpl = lang === 'ar' ? selectedTemplate.template_ar : lang === 'en' ? selectedTemplate.template_en : selectedTemplate.template_fr
                                setBody(fillTemplate(tmpl, { ...nv, elevePrenom: selectedPerson?.prenom || '{élève}' }))
                              }}
                                style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
                                <Text style={{ color: active ? '#fff' : theme.text, fontWeight: '600', fontSize: 12 }}>{opt}</Text>
                              </TouchableOpacity>
                            )
                          })}
                        </ScrollView>
                      ) : (
                        <TextInput
                          value={templateVars[v.key] || ''}
                          onChangeText={val => {
                            const nv = { ...templateVars, [v.key]: val }
                            setTemplateVars(nv)
                            const tmpl = lang === 'ar' ? selectedTemplate.template_ar : lang === 'en' ? selectedTemplate.template_en : selectedTemplate.template_fr
                            setBody(fillTemplate(tmpl, { ...nv, elevePrenom: selectedPerson?.prenom || '{élève}' }))
                          }}
                          placeholder={v.placeholder}
                          placeholderTextColor={theme.textMuted}
                          keyboardType={v.type === 'number' ? 'numeric' : 'default'}
                          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
                        />
                      )}
                    </View>
                  ))}
                  {/* Preview */}
                  <View style={[styles.previewBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={{ color: theme.textSoft, fontWeight: '700', fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>
                      {lang === 'ar' ? 'معاينة' : lang === 'en' ? 'Preview' : 'Aperçu'}
                    </Text>
                    <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>{body}</Text>
                  </View>
                </>
              )}

              {/* Free compose (no template) */}
              {!useTemplate && (
                <>
                  <Text style={[styles.label, { color: theme.textSoft }]}>{t('compose.subject')}</Text>
                  <TextInput value={subject} onChangeText={setSubject}
                    placeholder="Ex : Réunion parents-profs"
                    placeholderTextColor={theme.textMuted}
                    style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
                    maxLength={120} />

                  <Text style={[styles.label, { color: theme.textSoft, marginTop: 14 }]}>{t('compose.body')}</Text>
                  <TextInput value={body} onChangeText={setBody}
                    placeholder={t('teacher.writeMessage')}
                    placeholderTextColor={theme.textMuted}
                    style={[styles.input, styles.textarea, { borderColor: theme.border, color: theme.text, backgroundColor: theme.white }]}
                    multiline textAlignVertical="top" maxLength={2000} />
                </>
              )}

              <Text style={[styles.label, { color: theme.textSoft, marginTop: 14 }]}>{t('admin.priority')}</Text>
              <View style={styles.priorityRow}>
                {(['normal', 'urgent'] as const).map(p => {
                  const active = priority === p
                  const color = p === 'urgent' ? theme.danger : theme.primary
                  return (
                    <TouchableOpacity key={p} onPress={() => setPriority(p)}
                      style={[styles.chip, { flex: 1, borderColor: active ? color : theme.border, backgroundColor: active ? color : 'transparent' }]}>
                      <Text style={{ color: active ? '#fff' : theme.textSoft, fontWeight: '700', fontSize: 13, textAlign: 'center' }}>
                        {p === 'urgent' ? t('admin.urgentPriority') : t('admin.normal')}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}

          {/* ── Step 4: Confirm ─────────────────────── */}
          {step === 'confirm' && (
            <View>
              <Text style={[styles.stepTitle, { color: theme.text }]}>4. {t('common.confirm')}</Text>

              <View style={[styles.confirmCard, { backgroundColor: theme.primarySurface, borderColor: theme.primaryBorder }]}>
                <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {msgType === 'announcement' ? t('parent.announcementsTitle') : 'Message direct'}
                </Text>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 16, marginTop: 8 }}>{subject}</Text>
                <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 4 }} numberOfLines={3}>{body}</Text>
                <View style={[styles.confirmDivider, { backgroundColor: theme.primaryBorder }]} />
                <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 13 }}>
                  → {targetLabel} ({targetCount} {t('teacher.recipients').toLowerCase()})
                </Text>
                {priority === 'urgent' && (
                  <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 12, marginTop: 4 }}>🚨 {t('compose.urgent')}</Text>
                )}
              </View>
            </View>
          )}

        </ScrollView>

        {/* Bottom buttons */}
        <View style={[styles.bottomBar, { borderTopColor: theme.border }]}>
          {step !== 'type' && (
            <TouchableOpacity onPress={prevStep} style={[styles.backBtn, { borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{t('common.back')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={step === 'confirm' ? handleSend : nextStep}
            disabled={!canProceed() || sending}
            style={[styles.nextBtn, { backgroundColor: canProceed() ? theme.primary : theme.surfaceAlt, flex: step === 'type' ? 1 : undefined }]}
          >
            {sending ? <ActivityIndicator color="#fff" /> : (
              <Text style={{ color: canProceed() ? '#fff' : theme.textMuted, fontWeight: '800', fontSize: 15 }}>
                {step === 'confirm' ? t('compose.send') : step === 'type' ? t('common.confirm') : t('common.confirm')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 20 },
  progressDot: { width: 8, height: 8, borderRadius: 4 },
  stepTitle: { fontWeight: '800', fontSize: 18, marginBottom: 16 },
  typeCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, borderWidth: 1.5, marginBottom: 10 },
  targetRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  targetTabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  classChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  personRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 6 },
  label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 15 },
  textarea: { minHeight: 120 },
  priorityRow: { flexDirection: 'row', gap: 8 },
  templateToggle: { padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginBottom: 14 },
  templateCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 6 },
  templateIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  templateHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  previewBox: { padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  confirmCard: { padding: 18, borderRadius: 16, borderWidth: 1 },
  confirmDivider: { height: 1, marginVertical: 12 },
  bottomBar: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  backBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5 },
  nextBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
})
