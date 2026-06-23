/**
 * AnnouncementCard — single feed entry.
 * Urgent items get a left red bar + small badge.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet, Image } from 'react-native'
import { MotiView } from 'moti'
import { useTranslation } from 'react-i18next'
import { Megaphone, AlertCircle, Calendar, School, ShieldCheck } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { formatRelative } from '../../utils/format'
import type { Announcement } from '../../utils/dashboardTypes'
import { dirStyle } from '../../utils/arabicText'

const CATEGORY_ICON = {
  school: School,
  staff:  ShieldCheck,
  event:  Calendar,
  admin:  Megaphone,
}

export default function AnnouncementCard({
  item, onPress,
}: { item: Announcement; onPress?: () => void }) {
  const theme = useTheme()
  const { t } = useTranslation()
  const isUrgent = item.priority === 'urgent'
  const Icon = CATEGORY_ICON[item.category] ?? Megaphone

  const baseStyle = {
    backgroundColor: isUrgent ? theme.dangerSurface : theme.card,
    borderColor:     isUrgent ? theme.accentSurface : theme.border,
  }

  const content = (
    <>
      <View style={[
        styles.iconWrap,
        { backgroundColor: isUrgent ? theme.accent : theme.surface },
      ]}>
        <Icon size={16} color={isUrgent ? '#fff' : theme.textSoft} strokeWidth={1.75} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            numberOfLines={1}
            style={[{
              flex: 1,
              color: theme.text,
              fontFamily: theme.fonts.semibold,
              fontSize: 14,
            }, dirStyle(item.title)]}
          >
            {item.title}
          </Text>
          {isUrgent ? (
            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
              <AlertCircle size={9} color="#fff" strokeWidth={1.75} />
              <Text style={[styles.badgeText, { fontFamily: theme.fonts.black }]}>{t('compose.urgent').toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={2}
          style={[{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: 12,
            lineHeight: 17,
            marginTop: 3,
          }, dirStyle(item.body)]}
        >
          {item.body}
        </Text>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            accessibilityLabel={item.title || t('common.attachment')}
            style={[styles.poster, { backgroundColor: theme.surface }]}
            resizeMode="cover"
          />
        ) : null}
        <View style={styles.metaRow}>
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: 10.5,
          }}>
            {item.author}
          </Text>
          <View style={[styles.dot, { backgroundColor: theme.textMuted }]} />
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.regular,
            fontSize: 10.5,
          }}>
            {formatRelative(item.date)}
          </Text>
        </View>
      </View>
    </>
  )

  if (onPress) {
    return (
      <Pressable onPress={onPress} android_ripple={{ color: theme.border }}>
        {({ pressed }) => (
          <MotiView
            from={{ opacity: 0 }}
            animate={{ scale: pressed ? 0.98 : 1, opacity: pressed ? 0.96 : 1 }}
            transition={{ type: 'timing', duration: 200 }}
            style={[styles.row, baseStyle, theme.shadows.clay]}
          >
            {content}
          </MotiView>
        )}
      </Pressable>
    )
  }

  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: 'timing', duration: 200 }}
      style={[styles.row, baseStyle, theme.shadows.clay]}
    >
      {content}
    </MotiView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 24,
    marginBottom: 12,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginEnd: 12,
  },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
  },
  badgeText: { color: '#fff', fontSize: 8.5, letterSpacing: 0.4 },
  poster: { width: '100%', height: 150, borderRadius: 14, marginTop: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  dot: { width: 2.5, height: 2.5, borderRadius: 2 },
})
