import React from 'react'
import {
  View, Text, StyleSheet, Modal, Pressable, Alert,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Globe, Check } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../contexts/ThemeContext'
import { changeLanguage, type AppLanguage } from '../i18n'

const LANGS: { code: AppLanguage; label: string; native: string }[] = [
  { code: 'fr', label: 'Français', native: 'Français' },
  { code: 'ar', label: 'العربية', native: 'العربية' },
  { code: 'en', label: 'English', native: 'English' },
]

interface Props {
  visible: boolean
  onClose: () => void
}

export default function LanguagePicker({ visible, onClose }: Props) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const current = i18n.language as AppLanguage

  const pick = async (lang: AppLanguage) => {
    if (lang === current) {
      onClose()
      return
    }
    onClose()
    await changeLanguage(lang)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 200 }}
        >
          <Pressable style={[styles.card, { backgroundColor: theme.card }]}>
            <View style={styles.header}>
              <Globe size={20} color={theme.primary} strokeWidth={1.75} />
              <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.bold }]}>
                {t('langPicker.title')}
              </Text>
            </View>

            {LANGS.map(({ code, native }) => {
              const active = code === current
              return (
                <Pressable
                  key={code}
                  onPress={() => pick(code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={native}
                  style={[
                    styles.row,
                    {
                      backgroundColor: active ? theme.primarySurface : theme.surface,
                      borderColor: active ? theme.primaryBorder : theme.border,
                    },
                  ]}
                >
                  <Text style={[
                    styles.langText,
                    {
                      color: active ? theme.primary : theme.text,
                      fontFamily: active ? theme.fonts.bold : theme.fonts.medium,
                    },
                  ]}>
                    {native}
                  </Text>
                  {active && <Check size={18} color={theme.primary} strokeWidth={2.5} />}
                </Pressable>
              )
            })}
          </Pressable>
        </MotiView>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  card: {
    borderRadius: 22,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  langText: {
    fontSize: 16,
  },
})
