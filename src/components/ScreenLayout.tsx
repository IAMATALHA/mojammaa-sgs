import React from 'react';
import { View, StyleSheet, SafeAreaView, Text, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';

interface ScreenLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function ScreenLayout({ children, title }: ScreenLayoutProps) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle="dark-content" />
      {title && (
        <LinearGradient
          colors={[theme.primarySurface, theme.bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.header}
        >
          <Text style={[styles.headerTitle, { color: theme.primary }]}>{title}</Text>
          <View style={[styles.decorativeLine, { backgroundColor: theme.primary }]} />
        </LinearGradient>
      )}
      <View style={styles.container}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 20,
    alignItems: 'flex-start', // RTL friendly logic: left side in LTR, right in RTL
  },
  headerTitle: {
    fontSize: 28, // Bigger, bolder, modern
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  decorativeLine: {
    height: 4,
    width: 40,
    borderRadius: 2,
    marginTop: 8,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
