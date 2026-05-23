/**
 * AnnouncementCard — single feed entry.
 * Urgent items get a left red bar + small badge.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Megaphone, AlertCircle, Calendar, School, ShieldCheck } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import type { Announcement } from '../../utils/mockData'

const CATEGORY_ICON = {
  school: School,
  staff:  ShieldCheck,
  event:  Calendar,
  admin:  Megaphone,
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (mins < 1)  return 'À l\'instant'
  if (mins < 60) return `Il y a ${mins} min`
  if (hours < 24)return `Il y a ${hours}h`
  if (days < 7)  return `Il y a ${days}j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function AnnouncementCard({
  item, onPress,
}: { item: Announcement; onPress?: () => void }) {
  const theme = useTheme()
  const isUrgent = item.priority === 'urgent'
  const Icon = CATEGORY_ICON[item.category] ?? Megaphone

  const baseStyle = {
    backgroundColor: isUrgent ? theme.dangerSurface : theme.surface,
    borderColor:     isUrgent ? theme.primaryBorder : 'transparent',
  }
  const Wrapper: any = onPress ? Pressable : View
  const wrapperProps = onPress
    ? {
        onPress,
        android_ripple: { color: theme.border },
        style: ({ pressed }: { pressed: boolean }) => [
          styles.row,
          baseStyle,
          pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] },
        ],
      }
    : { style: [styles.row, baseStyle] }

  return (
    <Wrapper {...wrapperProps}>
      <View style={[
        styles.iconWrap,
        { backgroundColor: isUrgent ? theme.primary : theme.white },
      ]}>
        <Icon size={16} color={isUrgent ? '#fff' : theme.text} strokeWidth={2} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: theme.text,
              fontFamily: theme.fonts.semibold,
              fontSize: 14,
            }}
          >
            {item.title}
          </Text>
          {isUrgent ? (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <AlertCircle size={9} color="#fff" strokeWidth={2.5} />
              <Text style={styles.badgeText}>URGENT</Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={2}
          style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: 12,
            lineHeight: 17,
            marginTop: 3,
          }}
        >
          {item.body}
        </Text>
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
    </Wrapper>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginEnd: 12,
  },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
  },
  badgeText: { color: '#fff', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  dot: { width: 2.5, height: 2.5, borderRadius: 2 },
})
