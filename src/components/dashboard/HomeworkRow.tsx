/**
 * HomeworkRow - compact list item for "Recent homework".
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MotiView } from 'moti'
import { BookOpen, Check, FileText, Sparkles } from 'lucide-react-native'
import { useTheme } from '../../contexts/ThemeContext'
import type { HomeworkItem } from '../../utils/mockData'

function dueLabel(iso: string): { text: string; danger: boolean } {
  const d = new Date(iso); d.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (days < 0)  return { text: `En retard (${Math.abs(days)}j)`, danger: true  }
  if (days === 0)return { text: 'Aujourd\'hui',                   danger: true  }
  if (days === 1)return { text: 'Demain',                          danger: false }
  return                 { text: `Dans ${days}j`,                  danger: false }
}

export default function HomeworkRow({
  item, childName, onPress,
}: { item: HomeworkItem; childName?: string; onPress?: () => void }) {
  const theme = useTheme()
  const due = dueLabel(item.dueDate)
  const isSubmitted = item.status === 'submitted' || item.status === 'graded'
  const Icon = isSubmitted ? Check : item.status === 'pending' ? BookOpen : FileText

  const iconBg = due.danger ? theme.brandCoralSoft : isSubmitted ? theme.schoolMintSoft : theme.brandYellowSoft
  const iconFg = due.danger ? theme.brandCoral : isSubmitted ? theme.brandNavy : theme.brandOrange

  const content = (
    <>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Icon size={16} color={iconFg} strokeWidth={1.75} />
      </View>
      <View style={styles.body}>
        <View style={styles.subjectRow}>
          <Sparkles size={10} color={theme.brandYellow} strokeWidth={2} />
          <Text
            numberOfLines={1}
            style={{
              color: theme.textSoft,
              fontFamily: theme.fonts.semibold,
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: 0,
            }}
          >
            {item.subject}{childName ? ` · ${childName}` : ''}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={{
            color: theme.text,
            fontFamily: theme.fonts.bold,
            fontSize: 14,
            marginTop: 3,
          }}
        >
          {item.title}
        </Text>
      </View>
      <View style={[
        styles.pill,
        {
          backgroundColor: due.danger ? theme.brandCoralSoft : theme.paperWarm,
          borderColor: due.danger ? 'rgba(230, 57, 70, 0.20)' : theme.border,
        },
      ]}>
        <Text style={{
          color: due.danger ? theme.brandCoral : theme.textSoft,
          fontFamily: theme.fonts.semibold,
          fontSize: 10.5,
          letterSpacing: 0,
        }}>
          {isSubmitted ? 'Rendu' : due.text}
        </Text>
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
            style={[styles.row, { backgroundColor: theme.paper, borderColor: theme.border }]}
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
      style={[styles.row, { backgroundColor: theme.paper, borderColor: theme.border }]}
    >
      {content}
    </MotiView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       13,
    borderRadius:  18,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom:  9,
  },
  iconWrap: {
    width: 42, height: 42, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    marginEnd: 12,
  },
  body: { flex: 1 },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginStart: 8,
  },
})
