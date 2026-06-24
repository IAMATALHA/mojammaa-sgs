import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRoute } from '@react-navigation/native'
import type { TeacherRoute } from '../../navigation/types'
import { collection, getDocs, query, where } from 'firebase/firestore'
import ScreenLayout from '../../components/ScreenLayout'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { db } from '../../config/firebase'
import { toDoc } from '../../services/firestore'
import type { EleveDoc } from '../../services/elevesService'

interface Eleve {
  id:         string
  nom:        string
  prenom:     string
  codeMassar: string
}

export default function TeacherClasseElevesScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const route = useRoute<TeacherRoute<'TeacherClasseEleves'>>()
  const { classe } = route.params ?? { classe: '' }
  const [eleves,  setEleves]  = useState<Eleve[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const snap = await getDocs(query(collection(db, 'eleves'), where('classe', '==', classe)))
      const list = snap.docs.map(d => {
        const data = toDoc<EleveDoc>(d)
        return {
          id:         d.id,
          nom:        data.nom        || '',
          prenom:     data.prenom     || '',
          codeMassar: data.codeMassar || '',
        }
      }).sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
      setEleves(list)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger.')
    } finally { setLoading(false) }
  }, [classe])

  useEffect(() => { load() }, [load])

  return (
    <ScreenLayout title={t('teacher.studentsOf', { classe })}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}
      {loading && eleves.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={eleves}
          keyExtractor={item => item.id}
          ListHeaderComponent={
            <Text style={[styles.count, { color: theme.textSoft }]}>
              {t('teacher.studentCount', { count: eleves.length })}
            </Text>
          }
          renderItem={({ item, index }) => (
            <View style={[styles.row, { borderBottomColor: theme.border }]}>
              <Text style={[styles.idx, { color: theme.textSoft }]}>{index + 1}.</Text>
              <View style={{ flex: 1, marginStart: 10 }}>
                <Text style={[styles.name, { color: theme.text }]}>{item.prenom} {item.nom}</Text>
                {item.codeMassar ? (
                  <Text style={[styles.massar, { color: theme.textSoft }]}>{item.codeMassar}</Text>
                ) : null}
              </View>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        />
      )}
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  count:    { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  row:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  idx:      { fontSize: 12, fontWeight: '600', minWidth: 24 },
  name:     { fontSize: 15, fontWeight: '600' },
  massar:   { fontSize: 11, marginTop: 2 },
  loading:  { paddingVertical: 40, alignItems: 'center' },
  errorBox: { padding: 12, borderRadius: 10, marginBottom: 12 },
})
