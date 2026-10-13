import React from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../contexts/ThemeContext'

/**
 * Dernier filet : une erreur de rendu dans n'importe quel écran affichait un
 * écran blanc sans issue. Ici la famille voit un message et un bouton, et
 * « Réessayer » remonte toute l'application (session Firebase conservée).
 *
 * Ne dépend d'aucun fournisseur : `useTheme` a une valeur par défaut, donc
 * l'écran s'affiche même si l'erreur vient d'AuthProvider ou de la navigation.
 * N'attrape pas les erreurs hors rendu (gestionnaires d'appui, promesses).
 */
function CrashScreen({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme()
  const { t } = useTranslation()
  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{t('common.crashTitle')}</Text>
      <Text style={[styles.body, { color: theme.textSoft }]}>{t('common.crashBody')}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={[styles.retryBtn, { backgroundColor: theme.primary }]}
      >
        <Text style={styles.retryText}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  )
}

interface State { failed: boolean; attempt: number }

export default class AppErrorBoundary extends React.Component<{ children: ReactNode }, State> {
  state: State = { failed: false, attempt: 0 }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] erreur de rendu', error, info.componentStack)
  }

  // Nouvelle clé : React remonte tout l'arbre au lieu de rejouer l'état fautif.
  retry = () => this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))

  render() {
    if (this.state.failed) return <CrashScreen onRetry={this.retry} />
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { marginTop: 10, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retryBtn: {
    marginTop: 24, height: 50, borderRadius: 25, alignSelf: 'stretch',
    alignItems: 'center', justifyContent: 'center',
  },
  retryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
})
