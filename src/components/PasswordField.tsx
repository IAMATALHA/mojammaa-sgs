/**
 * Champ « mot de passe » avec œil pour afficher ou masquer la saisie.
 *
 * L'affichage est tenu par l'écran (`visible`, `onToggleVisible`), pas par le
 * champ : un mot de passe et sa confirmation partagent un seul réglage, un
 * appui sur l'un des deux yeux montre les deux saisies à comparer.
 */
import React from 'react'
import {
  Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react-native'
import { useTheme } from '../contexts/ThemeContext'

interface Props {
  value: string
  onChangeText: (value: string) => void
  visible: boolean
  onToggleVisible: () => void
  /** Mot de passe à choisir (activation) ou mot de passe du compte (connexion). */
  kind: 'new' | 'current'
  label?: string
  placeholder?: string
  /** Saisie refusée par l'écran : bordure rouge. */
  invalid?: boolean
  shape?: 'pill' | 'rounded'
  style?: StyleProp<ViewStyle>
  inputStyle?: StyleProp<TextStyle>
}

export default function PasswordField({
  value, onChangeText, visible, onToggleVisible, kind, label, placeholder, invalid = false,
  shape = 'rounded', style, inputStyle,
}: Props) {
  const theme = useTheme()
  const { t } = useTranslation()
  const pill = shape === 'pill'
  const Icon = visible ? EyeOff : Eye

  return (
    <View style={style}>
      {label ? (
        <Text style={[styles.label, { color: theme.textSoft, fontFamily: theme.fonts.semibold }]}>{label}</Text>
      ) : null}
      <View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          // `autoComplete` seul : s'il est accompagné de `textContentType`,
          // c'est ce dernier qui l'emporte (doc React Native 0.81, TextInput).
          autoComplete={kind === 'new' ? 'new-password' : 'current-password'}
          accessibilityLabel={label || placeholder}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          style={[
            styles.input,
            pill ? styles.pill : styles.rounded,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.card, fontFamily: theme.fonts.regular },
            inputStyle,
            invalid && { borderColor: theme.danger },
          ]}
        />
        <Pressable
          onPress={onToggleVisible}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t(visible ? 'common.hidePassword' : 'common.showPassword')}
          style={[styles.eye, pill && styles.eyePill]}
        >
          <Icon size={20} color={theme.textMuted} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 13, marginBottom: 6, marginStart: 4 },
  // La place de l'œil est réservée du côté « fin » : à droite en français, à gauche en arabe.
  input: { borderWidth: 1, paddingEnd: 52 },
  rounded: { height: 52, borderRadius: 14, paddingStart: 16, fontSize: 16 },
  pill: { height: 54, borderRadius: 28, paddingStart: 20, fontSize: 15 },
  eye: { position: 'absolute', end: 6, top: 0, bottom: 0, width: 40, alignItems: 'center', justifyContent: 'center' },
  eyePill: { end: 10 },
})
