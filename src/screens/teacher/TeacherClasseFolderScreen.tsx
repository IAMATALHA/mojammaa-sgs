/**
 * "Dossier de classe" — page d'atterrissage quand le prof tape une classe.
 * Affiche les sous-actions : Faire l'appel, Voir les élèves, Devoirs,
 * Notes. Tout est filtré sur la classe choisie pour éviter au prof de
 * répéter le filtre 5 fois.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Ionicons } from '@expo/vector-icons'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { db } from '../../config/firebase'

interface RouteParams {
  classe:          string
  seance?:         string  // si on arrive depuis Today
  openAttendance?: boolean // auto-naviguer vers l'attendance
}

export default function TeacherClasseFolderScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const route = useRoute()
  const { classe, seance, openAttendance } = (route.params || {}) as RouteParams

  const [eleveCount,   setEleveCount]   = useState<number | null>(null)
  const [devoirsCount, setDevoirsCount] = useState<number | null>(null)
  const [notesCount,   setNotesCount]   = useState<number | null>(null)
  const [loading,      setLoading]      = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [elevesSnap, devoirsSnap, notesSnap] = await Promise.all([
        getDocs(query(collection(db, 'eleves'),  where('classe',   '==', classe))),
        getDocs(query(collection(db, 'devoirs'), where('classeId', '==', classe))),
        getDocs(query(collection(db, 'notes'),   where('classe',   '==', classe))),
      ])
      setEleveCount(elevesSnap.size)
      setDevoirsCount(devoirsSnap.size)
      setNotesCount(notesSnap.size)
    } catch {
      // Une rule qui rate ne doit pas casser l'écran.
    } finally {
      setLoading(false)
    }
  }, [classe])

  useEffect(() => { load() }, [load])

  // Auto-redirige vers l'attendance si on vient du bouton "Faire l'appel"
  useEffect(() => {
    if (openAttendance && classe) {
      // Petit délai pour éviter une transition saccadée
      const id = setTimeout(() => {
        navigation.navigate('Attendance', { classe, seance })
      }, 250)
      return () => clearTimeout(id)
    }
    return undefined
  }, [openAttendance, classe, seance, navigation])

  const Action = ({
    icon, label, sub, onPress, color,
  }: { icon: any; label: string; sub: string; onPress: () => void; color?: string }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.action, { backgroundColor: theme.surface, borderColor: theme.border }]}
      activeOpacity={0.85}
    >
      <View style={[styles.actionIcon, { backgroundColor: (color || theme.primary) + '20' }]}>
        <Ionicons name={icon} size={22} color={color || theme.primary} />
      </View>
      <View style={{ flex: 1, marginStart: 14 }}>
        <Text style={[styles.actionLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.actionSub, { color: theme.textSoft }]}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSoft} />
    </TouchableOpacity>
  )

  return (
    <ScreenLayout title={`Classe ${classe}`}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.primary }]}>
          <Text style={styles.headerClasse}>{classe}</Text>
          {loading ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />
          ) : (
            <Text style={styles.headerMeta}>
              {eleveCount ?? '?'} élèves · {devoirsCount ?? 0} devoirs · {notesCount ?? 0} notes
            </Text>
          )}
        </View>

        {/* Action grosse : appel */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Attendance', { classe, seance })}
          style={[styles.bigBtn, { backgroundColor: theme.primary }]}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-circle" size={26} color="#fff" />
          <Text style={styles.bigBtnText}>Faire l'appel</Text>
        </TouchableOpacity>

        {/* Autres actions */}
        <Action
          icon="people-outline"
          label="Liste des élèves"
          sub={eleveCount != null ? `${eleveCount} élèves` : 'Voir le détail'}
          onPress={() => navigation.navigate('ClasseEleves', { classe })}
        />
        <Action
          icon="book-outline"
          label="Devoirs"
          sub={devoirsCount != null ? `${devoirsCount} devoir(s)` : 'Voir et créer'}
          onPress={() => navigation.navigate('ClasseDevoirs', { classe })}
        />
        <Action
          icon="document-text-outline"
          label="Notes"
          sub={notesCount != null ? `${notesCount} note(s)` : 'Voir et saisir'}
          onPress={() => navigation.navigate('ClasseNotes', { classe })}
        />
      </ScrollView>
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  header:        { padding: 20, borderRadius: 16, marginBottom: 18 },
  headerClasse:  { color: '#fff', fontSize: 28, fontWeight: '800' },
  headerMeta:    { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },
  bigBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, borderRadius: 14, marginBottom: 18 },
  bigBtnText:    { color: '#fff', fontSize: 18, fontWeight: '800' },
  action:        { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  actionIcon:    { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel:   { fontSize: 15, fontWeight: '700' },
  actionSub:     { fontSize: 12, marginTop: 2 },
})
