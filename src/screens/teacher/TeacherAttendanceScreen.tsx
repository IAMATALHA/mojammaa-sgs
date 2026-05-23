/**
 * Saisie des absences "en 1 clic" :
 *   - tout le monde est PRÉSENT par défaut (carte verte)
 *   - le prof ne tape que les ABSENTS (carte rouge)
 *   - bouton "Sauvegarder" écrit dans Firestore avec un docId déterministe
 *     par séance pour pouvoir reposer son doigt sans dupliquer
 *
 * Schéma absences (consistent avec mojammaa-admin) :
 *   absences/{eleveId_date_seanceKey} = {
 *     eleveId, eleveNom, elevePrenom, classe, date, seance,
 *     statut, professorId, createdAt
 *   }
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, Alert, ActivityIndicator,
} from 'react-native'
import Animated, { FadeInDown, Layout } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useRoute, useNavigation } from '@react-navigation/native'
import PressableScale from '../../components/PressableScale'
import {
  collection, getDocs, query, where, writeBatch, doc, Timestamp,
  documentId,
} from 'firebase/firestore'
import { sendPush } from '../../services/pushService'
import { Ionicons } from '@expo/vector-icons'
import ScreenLayout from '../../components/ScreenLayout'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../config/firebase'

const SEANCES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const

interface EleveLite {
  id:     string
  nom:    string
  prenom: string
}

interface RouteParams {
  classe:  string
  seance?: string
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Pour chaque élève absent, retrouve son parent et envoie un push.
 * Retourne le nombre de pushs réellement envoyés.
 */
async function notifyParentsOfAbsents(
  absents: EleveLite[],
  classe:  string,
  date:    string,
  seance:  string,
): Promise<number> {
  if (absents.length === 0) return 0

  // 1. Récupère les codeMassar (= id) des absents, lit les eleves docs
  //    pour trouver leur parentUid.
  const absentIds = absents.map(e => e.id)
  const elevesSnap = await getDocs(
    query(collection(db, 'eleves'), where(documentId(), 'in', absentIds.slice(0, 10))),
  )
  // Note : Firestore `in` is limited to 10. Pour 1 séance la limite tient.
  const eleveToParent = new Map<string, { parentUid: string; prenom: string; nom: string }>()
  elevesSnap.forEach(d => {
    const data = d.data() as any
    if (data?.parentUid) {
      eleveToParent.set(d.id, {
        parentUid: data.parentUid,
        prenom:    data.prenomLatin || data.prenom || '',
        nom:       data.nomLatin    || data.nom    || '',
      })
    }
  })

  if (eleveToParent.size === 0) return 0

  // 2. Lit les users (parents) pour récupérer leurs expoPushTokens.
  const parentUids = [...new Set([...eleveToParent.values()].map(v => v.parentUid))]
  const usersSnap = await getDocs(
    query(collection(db, 'users'), where(documentId(), 'in', parentUids.slice(0, 10))),
  )
  const parentToToken = new Map<string, string>()
  usersSnap.forEach(d => {
    const data = d.data() as any
    if (data?.expoPushToken) parentToToken.set(d.id, data.expoPushToken)
  })

  // 3. Construit les messages
  const messages = []
  for (const eleve of absents) {
    const link = eleveToParent.get(eleve.id)
    if (!link) continue
    const token = parentToToken.get(link.parentUid)
    if (!token) continue
    messages.push({
      to:    token,
      title: 'Absence signalée',
      body:  `${link.prenom} ${link.nom} a été marqué(e) absent(e) en ${classe} (${seance}, ${date}).`,
      data:  {
        type:    'absence',
        eleveId: eleve.id,
        classe,
        date,
        seance,
      },
    })
  }

  // 4. Envoie via Expo Push API
  if (messages.length === 0) return 0
  await sendPush(messages)
  return messages.length
}

export default function TeacherAttendanceScreen() {
  const theme = useTheme()
  const navigation = useNavigation<any>()
  const route = useRoute()
  const { classe, seance: initialSeance } = (route.params || {}) as RouteParams
  const { profile } = useAuth()

  const [eleves,  setEleves]  = useState<EleveLite[]>([])
  const [absent,  setAbsent]  = useState<Set<string>>(new Set())  // ids des absents
  const [seance,  setSeance]  = useState<string>(initialSeance || 'S1')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const date = todayISO()

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [elevesSnap, absentsSnap] = await Promise.all([
        getDocs(query(collection(db, 'eleves'), where('classe', '==', classe))),
        getDocs(query(
          collection(db, 'absences'),
          where('classe', '==', classe),
          where('date',   '==', date),
          where('seance', '==', seance),
          where('statut', '==', 'absent'),
        )),
      ])
      const list: EleveLite[] = elevesSnap.docs.map(d => {
        const data = d.data() as any
        return { id: d.id, nom: data.nom || '', prenom: data.prenom || '' }
      }).sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
      setEleves(list)
      const set = new Set<string>()
      absentsSnap.forEach(d => set.add((d.data() as any).eleveId))
      setAbsent(set)
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger.')
    } finally {
      setLoading(false)
    }
  }, [classe, date, seance])

  useEffect(() => { load() }, [load])

  const toggleAbsent = (id: string) => {
    // Vibration impact moyen = signal clair "j'ai marqué un absent"
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    setAbsent(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const save = async () => {
    if (!profile) { setError('Profil non chargé.'); return }
    setSaving(true); setError(null)
    try {
      const batch = writeBatch(db)
      // Pour chaque élève, on écrit son statut. Le docId est déterministe
      // pour qu'un rappel sur l'appel mette à jour l'enregistrement au lieu
      // de dupliquer.
      eleves.forEach(e => {
        const docId = `${e.id}_${date}_${seance}`
        const ref = doc(db, 'absences', docId)
        batch.set(ref, {
          eleveId:     e.id,
          eleveNom:    e.nom,
          elevePrenom: e.prenom,
          classe,
          date,
          seance,
          statut:      absent.has(e.id) ? 'absent' : 'present',
          professorId: profile.uid,
          createdAt:   Timestamp.now(),
        }, { merge: true })
      })
      await batch.commit()

      // ── Notifier les parents des absents ──────────────────────────────
      let notifSent = 0
      if (absent.size > 0) {
        try {
          notifSent = await notifyParentsOfAbsents(
            eleves.filter(e => absent.has(e.id)),
            classe, date, seance,
          )
        } catch (e) {
          // Erreur de notif non-bloquante : l'appel est déjà sauvegardé
          console.warn('Push notification failed:', e)
        }
      }

      const count = absent.size
      Alert.alert(
        'Appel sauvegardé',
        count === 0
          ? `Tous les élèves de ${classe} sont présents pour ${seance}.`
          : `${count} absent${count > 1 ? 's' : ''} enregistré${count > 1 ? 's' : ''} pour ${classe} · ${seance}.` +
            (notifSent > 0 ? `\n\n${notifSent} parent${notifSent > 1 ? 's' : ''} notifié${notifSent > 1 ? 's' : ''}.` : ''),
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      )
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  const SeanceChip = ({ value }: { value: string }) => {
    const active = seance === value
    return (
      <PressableScale
        onPress={() => setSeance(value)}
        scaleDown={0.92}
        style={[
          styles.chip,
          { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primarySurface : 'transparent' },
        ]}
      >
        <Text style={{ color: active ? theme.primary : theme.textSoft, fontFamily: active ? theme.fonts.black : theme.fonts.medium, fontSize: 13 }}>
          {value}
        </Text>
      </PressableScale>
    )
  }

  const renderEleve = ({ item, index }: { item: EleveLite; index: number }) => {
    const isAbsent = absent.has(item.id)
    return (
      <Animated.View
        entering={FadeInDown.delay(index * 30).springify().damping(18)}
        layout={Layout.springify()}
      >
        <PressableScale
          onPress={() => toggleAbsent(item.id)}
          scaleDown={0.97}
          haptic={false}  // on a déjà un impact dans toggleAbsent
          style={[
            styles.card,
            {
              backgroundColor: isAbsent ? theme.danger + '15' : theme.success + '15',
              borderColor:     isAbsent ? theme.danger        : theme.success,
            },
          ]}
        >
          <View style={[styles.initials, { backgroundColor: isAbsent ? theme.danger : theme.success }]}>
            <Text style={{ color: '#fff', fontSize: 15, fontFamily: theme.fonts.black }}>
              {(item.prenom[0] || '?').toUpperCase()}{(item.nom[0] || '').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, marginStart: 14 }}>
            <Text style={[styles.eleveName, { color: theme.text, fontFamily: theme.fonts.bold }]}>
              {item.prenom} {item.nom}
            </Text>
            <Text style={[styles.eleveStatus, { color: isAbsent ? theme.danger : theme.success, fontFamily: theme.fonts.semibold }]}>
              {isAbsent ? '🚫 ABSENT — tap pour annuler' : '✓ Présent'}
            </Text>
          </View>
        </PressableScale>
      </Animated.View>
    )
  }

  return (
    <ScreenLayout title={`Appel · ${classe}`}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      <Text style={[styles.label, { color: theme.textSoft }]}>Séance</Text>
      <View style={styles.chipRow}>
        {SEANCES.map(s => <SeanceChip key={s} value={s} />)}
      </View>

      <View style={[styles.summary, { backgroundColor: theme.primarySurface }]}>
        <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '700' }}>
          {date} · {seance} · {eleves.length} élèves · {absent.size} absent{absent.size > 1 ? 's' : ''}
        </Text>
        <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
          Tape les absents (deviennent rouges). Tout le monde est présent par défaut.
        </Text>
      </View>

      {loading && eleves.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : eleves.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>
            Aucun élève dans cette classe.
          </Text>
        </View>
      ) : (
        <FlatList
          data={eleves}
          keyExtractor={item => item.id}
          renderItem={renderEleve}
          contentContainerStyle={{ paddingBottom: 90 }}
        />
      )}

      {/* Bouton sauvegarder sticky */}
      <View style={[styles.footer, { backgroundColor: theme.bg, borderTopColor: theme.border }]}>
        <PressableScale
          onPress={save}
          disabled={saving}
          style={[styles.saveBtn, {
            backgroundColor: theme.primary,
            opacity:         saving ? 0.7 : 1,
            shadowColor:     theme.primary,
            shadowOpacity:   0.30,
            shadowRadius:    14,
            shadowOffset:    { width: 0, height: 6 },
            elevation:       4,
          }]}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Ionicons name="save" size={18} color="#fff" />
                <Text style={[styles.saveBtnText, { fontFamily: theme.fonts.black }]}>Sauvegarder l'appel</Text>
              </>
            )}
        </PressableScale>
      </View>
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  label:        { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, minWidth: 50, alignItems: 'center' },
  summary:      { padding: 10, borderRadius: 10, marginBottom: 12 },
  card:         { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10, borderRadius: 14, borderWidth: 2 },
  initials:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  eleveName:    { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  eleveStatus:  { fontSize: 12, fontWeight: '600' },
  loading:      { paddingVertical: 40, alignItems: 'center' },
  empty:        { paddingVertical: 60, alignItems: 'center' },
  errorBox:     { padding: 12, borderRadius: 10, marginBottom: 12 },
  footer:       { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, borderTopWidth: 1 },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 14 },
  saveBtnText:  { color: '#fff', fontSize: 16, fontWeight: '800' },
})
