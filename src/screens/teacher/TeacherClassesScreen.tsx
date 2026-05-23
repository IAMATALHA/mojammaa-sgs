/**
 * Liste UNIQUEMENT les classes que ce prof enseigne (pas toutes les
 * classes de l'école). On déduit ça depuis `emploiDuTemps` :
 *   classes distinctes des cours dont professeurNom == nom complet
 * Union avec `users/{uid}.classe` (la classe attribuée principale) pour
 * couvrir les cas où l'emploi du temps n'est pas encore renseigné.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Ionicons } from '@expo/vector-icons'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../config/firebase'

interface ClasseRow {
  name:         string
  studentCount: number
  matieres:     string[]  // matières que ce prof y enseigne
}

export default function TeacherClassesScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const { profile } = useAuth()
  const [classes, setClasses] = useState<ClasseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true); setError(null)
    try {
      const fullName = `${profile.prenom} ${profile.nom}`.trim()
      // 1. Classes via emploiDuTemps
      const edtSnap = await getDocs(query(
        collection(db, 'emploiDuTemps'),
        where('professeurNom', '==', fullName),
      ))
      const matieresByClasse = new Map<string, Set<string>>()
      edtSnap.forEach(d => {
        const data = d.data() as any
        const c = String(data.classeId || '')
        if (!c) return
        const m = String(data.matiere || '')
        const set = matieresByClasse.get(c) || new Set<string>()
        if (m) set.add(m)
        matieresByClasse.set(c, set)
      })
      // 2. Ajouter la classe assignée du profil si pas déjà présente
      if (profile.classe && !matieresByClasse.has(profile.classe)) {
        matieresByClasse.set(profile.classe, new Set<string>())
      }

      // 3. Compter les élèves de ces classes
      const rows: ClasseRow[] = []
      const classeNames = [...matieresByClasse.keys()]
      for (const c of classeNames) {
        const elevesSnap = await getDocs(query(collection(db, 'eleves'), where('classe', '==', c)))
        rows.push({
          name:         c,
          studentCount: elevesSnap.size,
          matieres:     [...matieresByClasse.get(c)!],
        })
      }
      rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      setClasses(rows)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les classes.')
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { load() }, [load])

  const renderItem = ({ item }: { item: ClasseRow }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('ClasseFolder', { classe: item.name })}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      activeOpacity={0.85}
    >
      <View style={[styles.iconBox, { backgroundColor: theme.primarySurface }]}>
        <Text style={[styles.iconText, { color: theme.primary }]}>
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, marginStart: 14 }}>
        <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
        <Text style={[styles.meta, { color: theme.textSoft }]}>
          {item.studentCount} élève{item.studentCount > 1 ? 's' : ''}
          {item.matieres.length > 0 ? ` · ${item.matieres.join(', ')}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSoft} />
    </TouchableOpacity>
  )

  return (
    <ScreenLayout title="Mes classes">
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      {loading && classes.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : classes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            Aucune classe assignée pour l'instant.{'\n'}
            <Text style={{ fontSize: 12 }}>
              L'administration doit ajouter vos cours dans l'emploi du temps.
            </Text>
          </Text>
        </View>
      ) : (
        <FlatList
          data={classes}
          keyExtractor={item => item.name}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        />
      )}
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  card:      { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1 },
  iconBox:   { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconText:  { fontSize: 20, fontWeight: '800' },
  name:      { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  meta:      { fontSize: 12 },
  loading:   { paddingVertical: 40, alignItems: 'center' },
  empty:     { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  errorBox:  { padding: 12, borderRadius: 10, marginBottom: 12 },
})
