/**
 * ChildCard — friendly profile tile for one child.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { BookMarked, CalendarCheck, ChevronRight, GraduationCap } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import type { Child } from '../../utils/mockData'

interface ChildCardProps {
  child: Child
  onPress?: () => void
}

function initialsOf(c: Child): string {
  return `${c.firstName[0] ?? ''}${c.lastName[0] ?? ''}`.toUpperCase()
}

export default function ChildCard({ child, onPress }: ChildCardProps) {
  const theme = useTheme()
  const avatarColor = child.avatarColor || theme.brandCoral

  return (
    <Pressable onPress={onPress} android_ripple={{ color: theme.border }}>
      {({ pressed }) => (
        <MotiView
          from={{ opacity: 0, translateY: 10 }}
          animate={{
            opacity: pressed ? 0.94 : 1,
            scale: pressed ? 0.985 : 1,
            translateY: 0,
          }}
          transition={{ type: 'timing', duration: 220 }}
          style={[
            styles.card,
            {
              backgroundColor: theme.paper,
              borderColor: 'rgba(29, 53, 87, 0.12)',
              shadowColor: theme.brandNavy,
            },
            theme.shadows.xs,
          ]}
        >
          <View style={[styles.wash, { backgroundColor: theme.brandYellowSoft }]} />
          <View style={[styles.washSmall, { backgroundColor: theme.schoolSkySoft }]} />

          <View style={[styles.avatarShell, { backgroundColor: avatarColor }]}>
            <View style={[styles.avatarInner, { backgroundColor: theme.white }]}>
              <Text style={{
                color: theme.brandNavy,
                fontFamily: theme.fonts.black,
                fontSize: 19,
              }}>
                {initialsOf(child)}
              </Text>
            </View>
          </View>

          <View style={styles.body}>
            <View style={styles.nameRow}>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: theme.text,
                  fontFamily: theme.fonts.bold,
                  fontSize: 16,
                }}
              >
                {child.firstName} {child.lastName}
              </Text>
              <View style={[styles.chevronWrap, { backgroundColor: theme.brandNavySoft }]}>
                <ChevronRight size={17} color={theme.brandNavy} strokeWidth={2.1} />
              </View>
            </View>

            <View style={styles.classRow}>
              <GraduationCap size={13} color={theme.textSoft} strokeWidth={2} />
              <Text
                numberOfLines={1}
                style={{
                  color: theme.textSoft,
                  fontFamily: theme.fonts.medium,
                  fontSize: 12,
                }}
              >
                {child.classe} · {child.level}
              </Text>
            </View>

            <View style={styles.badgesRow}>
              <Metric
                icon={<CalendarCheck size={12} color={theme.brandNavy} strokeWidth={2} />}
                value={`${Math.round(child.attendance)}%`}
                label="Présence"
                tone={theme.schoolMintSoft}
                theme={theme}
              />
              <Metric
                icon={<BookMarked size={12} color={theme.brandOrange} strokeWidth={2} />}
                value={String(child.pendingHomework)}
                label="Devoirs"
                tone={theme.brandOrangeSoft}
                theme={theme}
              />
            </View>
          </View>
        </MotiView>
      )}
    </Pressable>
  )
}

function Metric({
  icon, value, label, tone, theme,
}: {
  icon: React.ReactNode
  value: string
  label: string
  tone: string
  theme: any
}) {
  return (
    <View style={[styles.metric, { backgroundColor: tone }]}>
      {icon}
      <Text style={{
        color: theme.text,
        fontFamily: theme.fonts.black,
        fontSize: 12,
        fontVariant: ['tabular-nums'],
      }}>
        {value}
      </Text>
      <Text style={{
        color: theme.textSoft,
        fontFamily: theme.fonts.medium,
        fontSize: 10.5,
      }}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    overflow: 'hidden',
  },
  wash: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 999,
    top: -50,
    right: -20,
  },
  washSmall: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 999,
    bottom: -28,
    left: 42,
  },
  avatarShell: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  avatarInner: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chevronWrap: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
