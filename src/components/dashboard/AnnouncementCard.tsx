/**
 * AnnouncementCard — warm feed entry with school-category iconography.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { AlertCircle, Calendar, ChevronRight, Megaphone, School, ShieldCheck } from 'lucide-react-native'
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
  const tint = isUrgent ? theme.brandCoral : theme.brandNavy
  const tintSurface = isUrgent ? theme.brandCoralSoft : theme.schoolSkySoft

  const content = (
    <>
      <View style={[styles.rail, { backgroundColor: isUrgent ? theme.brandCoral : theme.brandYellow }]} />
      <View style={[styles.iconWrap, { backgroundColor: tintSurface }]}>
        <Icon size={17} color={tint} strokeWidth={2} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: theme.text,
              fontFamily: theme.fonts.bold,
              fontSize: 14.5,
            }}
          >
            {item.title}
          </Text>
          {isUrgent ? (
            <View style={[styles.badge, { backgroundColor: theme.brandCoral }]}>
              <AlertCircle size={9} color="#fff" strokeWidth={2} />
              <Text style={[styles.badgeText, { fontFamily: theme.fonts.black }]}>URGENT</Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={2}
          style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: 12.2,
            lineHeight: 18,
            marginTop: 5,
          }}
        >
          {item.body}
        </Text>
        <View style={styles.metaRow}>
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              color: theme.textMuted,
              fontFamily: theme.fonts.semibold,
              fontSize: 10.5,
            }}
          >
            {item.author}
          </Text>
          <View style={[styles.dot, { backgroundColor: theme.brandYellow }]} />
          <Text style={{
            color: theme.textMuted,
            fontFamily: theme.fonts.medium,
            fontSize: 10.5,
          }}>
            {formatRelative(item.date)}
          </Text>
        </View>
      </View>

      <View style={[styles.arrow, { backgroundColor: theme.paperWarm }]}>
        <ChevronRight size={15} color={theme.textMuted} strokeWidth={2} />
      </View>
    </>
  )

  const rowStyle = [
    styles.row,
    {
      backgroundColor: isUrgent ? '#FFF6F2' : theme.paper,
      borderColor: isUrgent ? 'rgba(230, 57, 70, 0.18)' : theme.border,
      shadowColor: theme.brandNavy,
    },
    theme.shadows.xs,
  ]

  if (onPress) {
    return (
      <Pressable onPress={onPress} android_ripple={{ color: theme.border }}>
        {({ pressed }) => (
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ scale: pressed ? 0.985 : 1, opacity: pressed ? 0.95 : 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 210 }}
            style={rowStyle}
          >
            {content}
          </MotiView>
        )}
      </Pressable>
    )
  }

  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 210 }}
      style={rowStyle}
    >
      {content}
    </MotiView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
    marginBottom: 11,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  rail: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  body: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    color: '#fff',
    fontSize: 8.5,
    letterSpacing: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
    gap: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  arrow: {
    width: 28,
    height: 28,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 8,
  },
})
