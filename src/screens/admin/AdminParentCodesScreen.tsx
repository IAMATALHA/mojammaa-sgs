/**
 * Codes d'activation parents depuis l'app (même fonction serveur que la page
 * « Codes parents » du site : createParentInvitations, réservée à
 * l'administration). Un code par élève sans parent lié ; le message se
 * prépare dans WhatsApp (numéro du parent connu) ou par le partage du
 * téléphone : rien n'est envoyé automatiquement.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { CheckSquare, MessageCircle, Share2, Square, Ticket } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { listEleves, type EleveDoc } from '../../services/elevesService'
import { AdminActionError, createParentInvitations } from '../../services/adminAccessService'
import { parentCodeMessage, whatsAppUrl, type ParentCode } from '../../utils/admin-access'
import { hexWithAlpha } from '../../utils/format'

type Student = EleveDoc & { parentTel?: string }

const MAX_PER_BATCH = 100
// Les anciens dossiers peuvent avoir un ID Firestore différent du code Massar.
const studentId = (student: Student) => student.id || student.codeMassar

export default function AdminParentCodesScreen() {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  // Écran de pile sans barre d'onglets : le bouton flottant doit rester
  // au-dessus de la barre de navigation Android (bord à bord) et de la barre d'accueil iOS.
  const insets = useSafeAreaInsets()
  const floatingBottom = Math.max(insets.bottom, 12) + 12
  const rtl = i18n.language.startsWith('ar')
  const row = { flexDirection: rtl ? 'row-reverse' as const : 'row' as const }
  const text = { color: theme.text, textAlign: rtl ? 'right' as const : 'left' as const }
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [classe, setClasse] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [codes, setCodes] = useState<ParentCode[]>([])
  const [prepared, setPrepared] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const generatingRef = useRef(false)

  const load = useCallback(async () => {
    if (generatingRef.current) return
    setLoading(true); setError('')
    try {
      const fresh = await listEleves() as Student[]
      setStudents(fresh)
      const eligible = new Set(fresh.filter(student => !student.parentUid).map(studentId))
      setSelected(current => new Set([...current].filter(id => eligible.has(id))))
      setCodes(current => current.filter(item => eligible.has(item.studentId)))
    } catch {
      setError(t('adminCodes.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])
  useEffect(() => { void load() }, [load])

  const classes = useMemo(() => [...new Set(students.map(student => student.classe).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [students])
  const visible = useMemo(() => students
    .filter(student => student.classe === classe)
    .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)), [students, classe])
  const parentTelById = useMemo(() => new Map(students.map(student => [studentId(student), (student.parentTel || '').trim()])), [students])
  const withoutParent = visible.filter(student => !student.parentUid)

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const generate = async () => {
    if (!selected.size || loading || generatingRef.current) return
    generatingRef.current = true
    setGenerating(true); setError('')
    try {
      const fresh = await createParentInvitations([...selected].slice(0, MAX_PER_BATCH))
      // Une nouvelle génération pour un même élève remplace l'affichage de l'ancienne.
      const ids = new Set(fresh.map(item => item.studentId))
      setCodes(current => [...fresh, ...current.filter(item => !ids.has(item.studentId))])
      // Les élèves au-delà de la limite serveur restent sélectionnés pour le lot suivant.
      setSelected(current => new Set([...current].filter(id => !ids.has(id))))
    } catch (failure) {
      setError(failure instanceof AdminActionError && failure.reason === 'already-exists'
        ? t('adminCodes.alreadyLinked')
        : failure instanceof AdminActionError && failure.reason === 'permission-denied'
          ? t('adminCodes.notAllowed')
          : t('adminCodes.generateError'))
    } finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  const shareCode = async (item: ParentCode, phone?: string) => {
    setError('')
    try {
      const message = parentCodeMessage(item)
      if (phone) await Linking.openURL(whatsAppUrl(phone, message))
      else if ((await Share.share({ message })).action !== Share.sharedAction) return
      // État attaché au CODE : une régénération ou une réponse tardive ne valide
      // jamais le nouveau code avec le partage de l'ancien.
      setPrepared(current => new Set(current).add(item.code))
    } catch {
      setError(t('common.shareError'))
    }
  }

  return (
    <ScreenLayout title={t('adminCodes.title')}>
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: floatingBottom + 86 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading && students.length > 0} onRefresh={() => { void load() }} enabled={!generating} tintColor={theme.primary} />}>
        <Text style={[text, styles.intro, { color: theme.textSoft, fontFamily: theme.fonts.regular }]}>{t('adminCodes.intro')}</Text>

        {codes.length ? (
          <View style={styles.block}>
            <Text style={[text, styles.blockTitle, { fontFamily: theme.fonts.bold }]}>{t('adminCodes.generated', { count: codes.length })}</Text>
            {codes.map(item => {
              const tel = parentTelById.get(item.studentId) || ''
              const done = prepared.has(item.code)
              return (
                <View key={item.studentId} style={[styles.codeCard, { backgroundColor: theme.card, borderColor: done ? hexWithAlpha(theme.success, 0.4) : theme.border }, theme.shadows.xs]}>
                  <View style={[row, styles.codeHead]}>
                    <View style={styles.flex}>
                      <Text style={[text, { fontFamily: theme.fonts.bold, fontSize: 15 }]}>{item.studentName}</Text>
                      <Text style={[text, { color: theme.textSoft, fontSize: 12.5, fontFamily: theme.fonts.regular }]}>{item.classe}</Text>
                    </View>
                    {done ? <Text style={{ color: theme.success, fontSize: 12, fontFamily: theme.fonts.semibold }}>{t('adminCodes.prepared')}</Text> : null}
                  </View>
                  <Text selectable style={[styles.code, { color: theme.text, fontFamily: theme.fonts.bold }]}>{item.code}</Text>
                  <View style={[row, styles.actions]}>
                    {tel ? (
                      <Pressable accessibilityRole="button" disabled={generating} onPress={() => { void shareCode(item, tel) }}
                        style={({ pressed }) => [styles.action, styles.whatsapp, row, pressed && styles.pressed]}>
                        <MessageCircle size={16} color="#FFFFFF" />
                        <Text style={[styles.actionText, { color: '#FFFFFF', fontFamily: theme.fonts.bold }]}>{t('adminCodes.whatsapp')}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable accessibilityRole="button" disabled={generating} onPress={() => { void shareCode(item) }}
                      style={({ pressed }) => [styles.action, row, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.borderStrong }, pressed && styles.pressed]}>
                      <Share2 size={16} color={theme.text} />
                      <Text style={[styles.actionText, { color: theme.text, fontFamily: theme.fonts.bold }]}>{t('adminCodes.share')}</Text>
                    </Pressable>
                  </View>
                  {!tel ? <Text style={[text, { color: theme.textMuted, fontSize: 12, fontFamily: theme.fonts.regular }]}>{t('adminCodes.noParentPhone')}</Text> : null}
                </View>
              )
            })}
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={[text, styles.blockTitle, { fontFamily: theme.fonts.bold }]}>{t('adminCodes.chooseClass')}</Text>
          {loading ? <ActivityIndicator color={theme.primary} style={styles.loader} /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, row]}>
              {classes.map(name => {
                const active = name === classe
                return (
                  <Pressable key={name} accessibilityRole="button" disabled={generating} accessibilityState={{ selected: active, disabled: generating }}
                    onPress={() => { setClasse(name); setSelected(new Set()) }}
                    style={[styles.chip, { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border }]}>
                    <Text style={{ color: active ? '#FFFFFF' : theme.text, fontFamily: theme.fonts.semibold, fontSize: 13 }}>{name}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          )}
        </View>

        {classe ? (
          <View style={styles.block}>
            <View style={[row, styles.listHead]}>
              <Text style={[text, styles.flex, { color: theme.textSoft, fontSize: 13, fontFamily: theme.fonts.medium }]}>
                {t('adminCodes.withoutParent', { count: withoutParent.length, total: visible.length })}
              </Text>
              {withoutParent.length ? (
                <Pressable accessibilityRole="button" disabled={generating || loading} hitSlop={8} onPress={() => setSelected(new Set(withoutParent.map(studentId)))}>
                  <Text style={{ color: theme.primary, fontFamily: theme.fonts.semibold, fontSize: 13 }}>{t('adminCodes.selectAll')}</Text>
                </Pressable>
              ) : null}
            </View>
            {visible.map(student => {
              const id = studentId(student)
              const linked = Boolean(student.parentUid)
              const checked = selected.has(id)
              return (
                <Pressable key={id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: linked || generating || loading }} disabled={linked || generating || loading}
                  onPress={() => toggle(id)}
                  style={[row, styles.student, { backgroundColor: theme.card, borderColor: checked ? hexWithAlpha(theme.primary, 0.4) : theme.border, opacity: linked ? 0.55 : 1 }]}>
                  {checked ? <CheckSquare size={21} color={theme.primary} /> : <Square size={21} color={theme.textMuted} />}
                  <View style={styles.flex}>
                    <Text style={[text, { fontFamily: theme.fonts.semibold, fontSize: 14 }]}>{student.prenom} {student.nom}</Text>
                    {student.prenomLatin || student.nomLatin ? (
                      <Text style={[text, { color: theme.textSoft, fontSize: 12, fontFamily: theme.fonts.regular }]}>{[student.prenomLatin, student.nomLatin].filter(Boolean).join(' ')}</Text>
                    ) : null}
                  </View>
                  {linked ? <Text style={{ color: theme.success, fontSize: 12, fontFamily: theme.fonts.semibold }}>{t('adminCodes.linked')}</Text> : null}
                </Pressable>
              )
            })}
          </View>
        ) : null}

        {error ? (
          <View accessibilityLiveRegion="polite" style={[styles.error, { backgroundColor: theme.dangerSurface }]}>
            <Text style={[text, { color: theme.danger, fontFamily: theme.fonts.semibold, fontSize: 13.5 }]}>{error}</Text>
            <Pressable accessibilityRole="button" disabled={loading || generating} onPress={() => { void load() }} style={styles.retry}>
              <Text style={[text, { color: theme.danger, fontFamily: theme.fonts.bold }]}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {selected.size ? (
        <Pressable accessibilityRole="button" disabled={generating || loading} accessibilityState={{ busy: generating, disabled: generating || loading }} onPress={() => { void generate() }}
          style={({ pressed }) => [styles.generate, row, { backgroundColor: theme.primary, bottom: floatingBottom }, theme.shadows.md, (pressed || generating) && styles.pressed]}>
          {generating ? <ActivityIndicator color="#FFFFFF" /> : <Ticket size={18} color="#FFFFFF" />}
          <Text style={{ color: '#FFFFFF', fontFamily: theme.fonts.bold, fontSize: 15 }}>{t('adminCodes.generate', { count: Math.min(selected.size, MAX_PER_BATCH) })}</Text>
        </Pressable>
      ) : null}
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  page: { gap: 18 },
  flex: { flex: 1, minWidth: 0 },
  intro: { fontSize: 14, lineHeight: 21 },
  block: { gap: 10 },
  blockTitle: { fontSize: 15 },
  loader: { paddingVertical: 20 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  listHead: { alignItems: 'center', gap: 10 },
  student: { alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, minHeight: 56 },
  codeCard: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 8 },
  codeHead: { alignItems: 'center', gap: 10 },
  code: { fontSize: 24, letterSpacing: 3, textAlign: 'center', marginVertical: 2 },
  actions: { gap: 8, flexWrap: 'wrap' },
  action: { flexGrow: 1, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  actionText: { fontSize: 13.5 },
  whatsapp: { backgroundColor: '#1F8F4E' },
  pressed: { opacity: 0.75 },
  error: { borderRadius: 12, padding: 12 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  generate: { position: 'absolute', left: 20, right: 20, minHeight: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', gap: 10 },
})
