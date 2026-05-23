/**
 * HomeworkRow — compact list item for "Recent homework".
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { BookOpen, Check, FileText } from 'lucide-react-native'
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

  const iconBg =
    isSubmitted ? theme.successSurface :
    due.danger  ? theme.dangerSurface  :
    theme.surface

  const iconFg =
    isSubmitted ? theme.success :
    due.danger  ? theme.primary :
    theme.text

  const Wrapper: any = onPress ? Pressable : View
  const wrapperProps = onPress
    ? {
        onPress,
        android_ripple: { color: theme.border },
        style: ({ pressed }: { pressed: boolean }) => [
          styles.row,
          { backgroundColor: theme.surface },
          pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
        ],
      }
    : { style: [styles.row, { backgroundColor: theme.surface }] }

  return (
    <Wrapper {...wrapperProps}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Icon size={16} color={iconFg} strokeWidth={2} />
      </View>
      <View style={styles.body}>
        <Text
          numberOfLines={1}
          style={{
            color: theme.text,
            fontFamily: theme.fonts.semibold,
            fontSize: 13.5,
          }}
        >
          {item.title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.textSoft,
            fontFamily: theme.fonts.regular,
            fontSize: 11.5,
            marginTop: 2,
          }}
        >
          {item.subject}{childName ? ` · ${childName}` : ''}
        </Text>
      </View>
      <View style={[
        styles.pill,
        {
          backgroundColor:
            isSubmitted ? theme.successSurface :
            due.danger  ? theme.dangerSurface  :
            theme.surfaceAlt,
        },
      ]}>
        <Text style={{
          color:
            isSubmitted ? theme.success :
            due.danger  ? theme.primary :
            theme.textSoft,
          fontFamily: theme.fonts.semibold,
          fontSize: 10.5,
          letterSpacing: 0.2,
        }}>
          {isSubmitted ? 'Rendu' : due.text}
        </Text>
      </View>
    </Wrapper>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       12,
    borderRadius:  12,
    marginBottom:  8,
  },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginEnd: 12,
  },
  body: { flex: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginStart: 8 },
})
