/**
 * DevoirDetailScreen — page ENTIÈRE de consultation d'un devoir, partagée par
 * les trois rôles (parent / prof / admin). Remplace l'ancienne popup parent
 * qui n'affichait pas les pièces jointes.
 *
 * Reçoit le devoir sérialisé en param de route (DevoirDetailParams) :
 * images affichées en grand (tap → plein écran navigateur), autres fichiers
 * en lignes ouvrables (Linking).
 */
import React from 'react'
import {
  View, Text, ScrollView, Pressable, Image, StyleSheet, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import {
  BookOpen, ChevronLeft, Clock, Users, FileText, Paperclip, ExternalLink,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { dirStyle } from '../../utils/arabicText'
import type { DevoirDetailParams } from '../../navigation/types'
import HomeworkParentSubmission from '../../components/homework/HomeworkParentSubmission'
import HomeworkTeacherTracking from '../../components/homework/HomeworkTeacherTracking'

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function fmtSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export default function DevoirDetailScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const { role } = useAuth()
  const navigation = useNavigation()
  const route = useRoute<RouteProp<{ params: DevoirDetailParams }, 'params'>>()
  const devoir = route.params.devoir

  const attachments = devoir.attachments || []
  const images = attachments.filter(a => a.mime?.startsWith('image/'))
  const files = attachments.filter(a => !a.mime?.startsWith('image/'))
  const isPast = !!devoir.dateLimite && devoir.dateLimite < new Date().toISOString().slice(0, 10)

  const open = (url: string) => { Linking.openURL(url).catch(() => { /* URL invalide */ }) }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* En-tête : retour + pastille type */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityRole="button" accessibilityLabel={t('common.close')}
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ChevronLeft size={20} color={theme.text} strokeWidth={2.2} />
        </Pressable>
        <View style={[styles.typePill, { backgroundColor: theme.primarySurface }]}>
          <BookOpen size={12} color={theme.primary} strokeWidth={2.4} />
          <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 11, letterSpacing: 0.4, marginStart: 5 }}>
            {(devoir.type || 'devoir').toUpperCase()}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: isPast ? theme.danger + '12' : theme.primarySurface }]}>
          <View style={[styles.dot, { backgroundColor: isPast ? theme.danger : theme.warning }]} />
          <Text style={{ color: theme.textSoft, fontWeight: '700', fontSize: 11, marginStart: 5 }}>
            {isPast ? t('homeworkTracking.deadlinePassed') : t('homeworkTracking.deadlineOpen')}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[{ color: theme.text, fontWeight: '800', fontSize: 22, letterSpacing: -0.4 }, dirStyle(devoir.titre)]}>
          {devoir.titre}
        </Text>

        {/* Méta : échéance + classe/prof */}
        <View style={[styles.metaCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.metaRow}>
            <Clock size={15} color={theme.accent} strokeWidth={2.2} />
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13.5, marginStart: 8 }}>
              {t('teacher.dueDate', { date: fmtDate(devoir.dateLimite) })}
            </Text>
          </View>
          {(devoir.classeId || devoir.teacherNom) ? (
            <View style={[styles.metaRow, { marginTop: 8 }]}>
              <Users size={15} color={theme.info} strokeWidth={2.2} />
              <Text style={{ color: theme.textSoft, fontWeight: '600', fontSize: 13, marginStart: 8 }}>
                {[devoir.classeId, devoir.teacherNom].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Description complète */}
        {devoir.description ? (
          <Text style={[{ color: theme.text, fontSize: 15, lineHeight: 23, marginTop: 16 }, dirStyle(devoir.description)]}>
            {devoir.description}
          </Text>
        ) : null}

        {/* Pièces jointes */}
        {attachments.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Paperclip size={14} color={theme.textSoft} strokeWidth={2.2} />
              <Text style={{ color: theme.textSoft, fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginStart: 6 }}>
                {t('teacher.attachments')} ({attachments.length})
              </Text>
            </View>

            {/* Images : en grand, tap → plein écran */}
            {images.map(a => (
              <Pressable key={a.url} onPress={() => open(a.url)}
                accessibilityRole="imagebutton" accessibilityLabel={a.name}>
                <Image source={{ uri: a.url }} resizeMode="cover"
                  style={[styles.image, { backgroundColor: theme.surface, borderColor: theme.border }]} />
                <View style={styles.imageCaption}>
                  <Text numberOfLines={1} style={{ color: theme.textSoft, fontSize: 11.5, flex: 1 }}>{a.name}</Text>
                  <ExternalLink size={12} color={theme.textSoft} strokeWidth={2} />
                </View>
              </Pressable>
            ))}

            {/* Autres fichiers (PDF…) : lignes ouvrables */}
            {files.map(a => (
              <Pressable key={a.url} onPress={() => open(a.url)}
                accessibilityRole="button" accessibilityLabel={a.name}
                style={[styles.fileRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.fileIcon, { backgroundColor: theme.primarySurface }]}>
                  <FileText size={17} color={theme.primary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, marginStart: 10, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '700', fontSize: 13.5 }}>{a.name}</Text>
                  {a.size ? <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 1 }}>{fmtSize(a.size)}</Text> : null}
                </View>
                <ExternalLink size={15} color={theme.textSoft} strokeWidth={2} />
              </Pressable>
            ))}
          </View>
        )}

        {role === 'student' && devoir.eleveId ? (
          <HomeworkParentSubmission homework={devoir} />
        ) : null}
        {role === 'teacher' ? (
          <HomeworkTeacherTracking homework={devoir} />
        ) : null}
        {role === 'admin' ? (
          <HomeworkTeacherTracking homework={devoir} readOnly />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  typePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginStart: 'auto' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  metaCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  image: { width: '100%', height: 260, borderRadius: 14, borderWidth: 1, marginBottom: 4 },
  imageCaption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, marginBottom: 12 },
  fileRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  fileIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
})
