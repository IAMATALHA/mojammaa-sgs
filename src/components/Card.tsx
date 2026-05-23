/**
 * Carte avec radius + ombre subtile cohérents partout. Plutôt que de
 * dupliquer dans 12 écrans le même `padding/borderRadius/border` :
 * ce composant est la source de vérité visuelle des cartes.
 */
import React from 'react'
import { View, type ViewStyle, type StyleProp } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

interface Props {
  children:  React.ReactNode
  elevated?: boolean   // ajoute une ombre marquée (pour cartes primaires)
  primary?:  boolean   // fond = primary (utile pour CTA / hero)
  style?:    StyleProp<ViewStyle>
}

export default function Card({ children, elevated, primary, style }: Props) {
  const theme = useTheme()
  return (
    <View
      style={[
        {
          backgroundColor: primary ? theme.primary : theme.surface,
          borderRadius:    16,
          padding:         16,
          borderWidth:     primary ? 0 : 1,
          borderColor:     theme.border,
          ...(elevated || primary
            ? {
                shadowColor:   primary ? theme.primary : '#000',
                shadowOpacity: primary ? 0.25 : 0.06,
                shadowRadius:  primary ? 14 : 8,
                shadowOffset:  { width: 0, height: primary ? 6 : 3 },
                elevation:     primary ? 4 : 2,
              }
            : null),
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}
