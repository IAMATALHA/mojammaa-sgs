/**
 * ParentRessourcesScreen — supports de cours des classes des enfants.
 * Ouvrir une pièce jointe marque la ressource comme vue (viewedBy,
 * append-only — le prof voit son compteur de vues monter).
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import { FolderOpen, Paperclip, Eye, ChevronLeft } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { Card, EmptyState, SectionHeader } from '../../components/dashboard'
import { useParentData } from '../../hooks/useParentData'
import { useAuth } from '../../contexts/AuthContext'
import {
  markRessourceViewed, subscribeRessourcesForClasses, type RessourceDoc,
} from '../../services/ressourcesService'
import ScreenBackground from '../../components/ScreenBackground'
import MessagesErrorBanner from '../../components/MessagesErrorBanner'
import { formatTimestamp } from '../../utils/format'
import { dirStyle } from '../../utils/arabicText'

export default function ParentRessourcesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const nav = useNavigation<any>()
  const parent = useParentData()
  const { profile } = useAuth()
  const [ressources, setRessources] = useState<RessourceDoc[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedClasse, setSelectedClasse] = useState<string>('all')

  const classes = useMemo(
    () => [...new Set(parent.children.map(c => c.classe).filter(Boolean))],
    [parent.children],
  )

  useEffect(() => {
    if (classes.length === 0) { setRessources([]); return }
    return subscribeRessourcesForClasses(
      classes,
      list => { setRessources(list); setError(null) },
      err  => setError(err.message),
    )
  }, [classes.join('|')])

  const filtered = useMemo(
    () => selectedClasse === 'all'
      ? ressources
      : ressources.filter(r => r.classeId === selectedClasse),
    [ressources, selectedClasse],
  )

  const openAttachment = (item: RessourceDoc, url: string) => {
    // Vue comptée à l'OUVERTURE d'une PJ (pas au simple scroll de la liste).
    if (item.id && profile?.uid && !(item.viewedBy || []).includes(profile.uid)) {
      markRessourceViewed(item.id, profile.uid).catch(() => {})
    }
    Linking.openURL(url).catch(() => {})
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />
      <ScreenBackground />

      <View style={styles.header}>
        <Pressable
          onPress={() => nav.goBack()}
          hitSlop={8}
          style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <ChevronLeft size={20} color={theme.primary} strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1, marginStart: 12 }}>
          <Text style={{
            color: theme.text,
            fontFamily: theme.fonts.black,
            fontSize: theme.fontSize.h2,
            letterSpacing: -0.5,
          }}>
            {t('resources.title')}
          </Text>
          <Text style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: theme.fontSize.small,
            marginTop: 2,
          }}>
            {t('resources.parentSubtitle')}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {error && ressources.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <MessagesErrorBanner messageKey="common.dataLoadError" />
          </View>
        ) : null}

        {/* Filtre par classe (utile avec plusieurs enfants) */}
        {classes.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.chips}
          >
            <Chip label={t('parent.allFilter')} active={selectedClasse === 'all'}
              onPress={() => setSelectedClasse('all')} theme={theme} />
            {classes.map(c => (
              <Chip key={c} label={c} active={selectedClasse === c}
                onPress={() => setSelectedClasse(c)} theme={theme} />
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title={t('resources.title')} subtitle={t('parent.recentFirst')} />
          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={FolderOpen}
                title={t('resources.empty')}
                message={t('resources.parentEmptyMsg')}
              />
            </Card>
          ) : (
            filtered.map(r => (
              <Card key={r.id} padding={14} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {r.matiere ? (
                    <View style={[styles.subjectTag, { backgroundColor: theme.primarySurface }]}>
                      <Text style={{ color: theme.primary, fontSize: 10.5, fontFamily: theme.fonts.bold }}>{r.matiere}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.subjectTag, { backgroundColor: theme.surface }]}>
                    <Text style={{ color: theme.textSoft, fontSize: 10.5, fontFamily: theme.fonts.semibold }}>{r.classeId}</Text>
                  </View>
                  <Text style={{ flex: 1, textAlign: 'right', color: theme.textMuted, fontFamily: theme.fonts.regular, fontSize: 11 }}>
                    {formatTimestamp(r.createdAt)}
                  </Text>
                </View>
                <Text style={[{ color: theme.text, fontFamily: theme.fonts.bold, fontSize: 15, marginTop: 8 }, dirStyle(r.titre)]}>
                  {r.titre}
                </Text>
                {r.description ? (
                  <Text style={[{ color: theme.textSoft, fontFamily: theme.fonts.regular, fontSize: 12.5, lineHeight: 18, marginTop: 4 }, dirStyle(r.description)]}>
                    {r.description}
                  </Text>
                ) : null}
                {r.attachments.map(a => (
                  <Pressable key={a.url}
                    onPress={() => openAttachment(r, a.url)}
                    android_ripple={{ color: theme.border }}
                    style={({ pressed }) => [
                      styles.attachRow,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                      pressed && { opacity: 0.85 },
                    ]}>
                    <Paperclip size={14} color={theme.primary} strokeWidth={2.2} />
                    <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontFamily: theme.fonts.semibold, fontSize: 12.5, marginStart: 8 }}>
                      {a.name}
                    </Text>
                  </Pressable>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                  <Text style={{ color: theme.textMuted, fontFamily: theme.fonts.medium, fontSize: 11 }}>
                    {r.teacherNom}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Eye size={12} color={theme.textMuted} strokeWidth={2} />
                  <Text style={{ color: theme.textMuted, fontFamily: theme.fonts.medium, fontSize: 11, marginStart: 4 }}>
                    {t('resources.viewsCount', { count: (r.viewedBy || []).length })}
                  </Text>
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Chip({
  label, active, onPress, theme,
}: { label: string; active: boolean; onPress: () => void; theme: Theme }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: theme.border }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.primary : theme.surface,
          borderColor:     active ? theme.primary : theme.border,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={{
        color: active ? '#fff' : theme.text,
        fontFamily: theme.fonts.semibold,
        fontSize: 12.5,
      }}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { paddingBottom: 32 },
  chips:  { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, gap: 8 },
  chip:   { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, marginEnd: 6 },
  section: { paddingHorizontal: 20, marginTop: 12 },
  subjectTag: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, marginEnd: 6 },
  attachRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, marginTop: 8 },
})
