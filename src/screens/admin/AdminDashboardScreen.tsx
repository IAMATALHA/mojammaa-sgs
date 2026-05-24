import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ScreenLayout from '../../components/ScreenLayout';
import AnimatedCard from '../../components/AnimatedCard';
import { useTheme } from '../../contexts/ThemeContext';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { Users, BookOpen, GraduationCap, Percent } from 'lucide-react-native';

export default function AdminDashboardScreen() {
  const theme = useTheme();
  const { stats, loading, error, refresh } = useDashboardStats();
  const nav = useNavigation<any>();

  return (
    <ScreenLayout title="Dashboard">
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.primary} />
        }
      >
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
            <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        {loading && !stats ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : (
          <>
            <View style={styles.row}>
              <AnimatedCard style={styles.statBox} delay={100} onPress={() => nav.navigate('AdminUsers')}>
                <Users color={theme.geminiBlue} size={28} style={styles.icon} />
                <Text style={[styles.statValue, { color: theme.text }]}>{stats?.totalEleves ?? 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textSoft }]}>Élèves</Text>
              </AnimatedCard>

              <AnimatedCard style={styles.statBox} delay={200} onPress={() => nav.navigate('AdminUsers')}>
                <BookOpen color={theme.geminiPurple} size={28} style={styles.icon} />
                <Text style={[styles.statValue, { color: theme.text }]}>{stats?.totalProfs ?? 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textSoft }]}>Profs</Text>
              </AnimatedCard>
            </View>

            <View style={styles.row}>
              <AnimatedCard style={styles.statBox} delay={300} onPress={() => nav.navigate('AdminClasses')}>
                <GraduationCap color={theme.geminiCyan} size={28} style={styles.icon} />
                <Text style={[styles.statValue, { color: theme.text }]}>{stats?.totalClasses ?? 0}</Text>
                <Text style={[styles.statLabel, { color: theme.textSoft }]}>Classes</Text>
              </AnimatedCard>

              <AnimatedCard style={styles.statBox} delay={400} onPress={() => nav.navigate('AdminStats')}>
                <Percent color={theme.text} size={28} style={styles.icon} />
                <Text style={[styles.statValue, { color: theme.text }]}>{stats?.attendanceRate ?? 0}%</Text>
                <Text style={[styles.statLabel, { color: theme.textSoft }]}>Présence</Text>
              </AnimatedCard>
            </View>
          </>
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    marginHorizontal: 6,
    alignItems: 'flex-start',
  },
  icon: {
    marginBottom: 12,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 2,
    letterSpacing: -1,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
});
