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
import { sendMessage } from '../../services/messagesService'
import { getAbsenceRequestsForClassDate, decideAbsenceRequest, type AbsenceRequestDoc } from '../../services/absenceRequestsService'
import { Ionicons } from '@expo/vector-icons'
import ScreenLayout from '../../components/ScreenLayout'
import BehaviorSheet from '../../components/BehaviorSheet'
import { useTranslation } from 'react-i18next'
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

interface TeacherInfo {
  uid:    string
  nom:    string
  prenom: string
}

/**
 * Pour chaque élève absent ayant un parent enregistré, écrit un doc dans
 * `messages` (historique permanent côté parent). Le push est envoyé
 * SERVEUR par la Cloud Function `onMessageCreated` — surtout ne pas le
 * faire ici : un prof n'a pas le droit de lire users/{parent} (rules),
 * et un push client doublerait celui de la CF.
 *
 * Retourne le nombre de parents notifiés.
 */
async function notifyParentsOfAbsents(
  absents: EleveLite[],
  classe:  string,
  date:    string,
  seance:  string,
  teacher: TeacherInfo,
): Promise<number> {
  if (absents.length === 0) return 0

  // 1. Lit les eleves docs des absents pour trouver leur parentUid.
  const absentIds = absents.map(e => e.id)
  const elevesSnap = await getDocs(
    query(collection(db, 'eleves'), where(documentId(), 'in', absentIds.slice(0, 10))),
  )
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

  const fromNom = `${teacher.prenom} ${teacher.nom}`.trim()

  // 2. Pour chaque absent : écrire un message (la CF fait le push)
  const writes: Promise<any>[] = []
  let notified = 0

  for (const eleve of absents) {
    const link = eleveToParent.get(eleve.id)
    if (!link) continue
    const body = `${link.prenom} ${link.nom} a été marqué(e) absent(e) en ${classe} (${seance}, ${date}).`

    // 3.a — message Firestore (historique permanent)
    writes.push(sendMessage({
      type:     'attendance',
      subject:  'Absence signalée',
      body,
      fromId:   teacher.uid,
      fromNom,
      fromRole: 'professeur',
      toType:   'user',
      toIds:    [link.parentUid],
      category: 'attendance',
      priority: 'urgent',
      eleveId:  eleve.id,
      classe,
    }))
    notified++
  }

  await Promise.all(writes)
  return notified
}

export default function TeacherAttendanceScreen() {
  const theme = useTheme()
  const { t } = useTranslation()
  const navigation = useNavigation<any>()
  const route = useRoute()
  const { classe, seance: initialSeance } = (route.params || {}) as RouteParams
  const { profile } = useAuth()

  const [eleves,  setEleves]  = useState<EleveLite[]>([])
  const [absent,  setAbsent]  = useState<Set<string>>(new Set())  // ids des absents
  const [seance,  setSeance]  = useState<string>(initialSeance || 'S1')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [requests, setRequests] = useState<AbsenceRequestDoc[]>([])  // déclarations parents (classe+date)
  const [error,   setError]   = useState<string | null>(null)
  const [behaviorFor, setBehaviorFor] = useState<EleveLite | null>(null)  // élève de la fiche comportement

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
      // Déclarations d'absence des parents pour cette date (best-effort)
      getAbsenceRequestsForClassDate(classe, date)
        .then(setRequests)
        .catch(() => setRequests([]))
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
          // Absence déclarée par le parent → justifiée d'office avec son motif.
          ...(absent.has(e.id) && declaredFor(e.id)
            ? { justified: true, raison: declaredFor(e.id)!.reason }
            : {}),
        }, { merge: true })
      })
      await batch.commit()

      // Les déclarations couvertes par cet appel passent à 'approved'.
      await Promise.all(
        requests
          .filter(r => r.id && r.status === 'pending' && absent.has(r.eleveId))
          .map(r => decideAbsenceRequest(r.id!, 'approved', profile.uid).catch(() => {})),
      )

      // ── Notifier les parents des absents ──────────────────────────────
      let notifSent = 0
      if (absent.size > 0 && profile) {
        try {
          notifSent = await notifyParentsOfAbsents(
            eleves.filter(e => absent.has(e.id)),
            classe, date, seance,
            { uid: profile.uid, nom: profile.nom, prenom: profile.prenom },
          )
        } catch (e) {
          // Erreur de notif non-bloquante : l'appel est déjà sauvegardé
          console.warn('Notification failed:', e)
        }
      }

      const count = absent.size
      Alert.alert(
        t('teacher.attendanceSaved'),
        count === 0
          ? t('teacher.allPresent', { classe, seance })
          : t('teacher.absentsRecorded', { count, classe, seance }) +
            (notifSent > 0 ? `\n\n${t('teacher.parentsNotified', { count: notifSent })}` : ''),
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      )
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  const declaredFor = (eleveId: string): AbsenceRequestDoc | undefined =>
    requests.find(r => r.eleveId === eleveId && r.status !== 'declined')

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
              backgroundColor: theme.white,
              borderColor:     isAbsent ? theme.danger : theme.border,
            },
          ]}
        >
          <View style={[styles.statusStripe, { backgroundColor: isAbsent ? theme.danger : theme.success }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.eleveName, { color: theme.text, fontFamily: theme.fonts.bold }]}>
              {item.prenom} {item.nom}
            </Text>
            <Text style={[styles.eleveStatus, { color: isAbsent ? theme.danger : theme.success, fontFamily: theme.fonts.semibold }]}>
              {isAbsent ? t('teacher.absentTapCancel') : t('teacher.presentLabel')}
            </Text>
            {declaredFor(item.id) ? (
              <Text style={{ color: theme.warning, fontFamily: theme.fonts.semibold, fontSize: 10.5, marginTop: 2 }}>
                ⚑ {t('absenceRequest.declaredBadge')} · {declaredFor(item.id)!.reason}
              </Text>
            ) : null}
          </View>
          {/* Mérite / avertissement sans quitter l'appel (Pressable imbriqué :
              le tap sur le smiley ne doit PAS basculer l'absence). */}
          <PressableScale
            onPress={() => setBehaviorFor(item)}
            scaleDown={0.88}
            style={[styles.behaviorBtn, { borderColor: theme.border, backgroundColor: theme.white }]}
          >
            <Ionicons name="happy-outline" size={20} color={theme.primary} />
          </PressableScale>
        </PressableScale>
      </Animated.View>
    )
  }

  return (
    <ScreenLayout title={t('teacher.attendanceTitle', { classe })}>
      {error ? (
        <View style={[styles.errorBox, { backgroundColor: theme.danger + '12' }]}>
          <Text style={{ color: theme.danger, fontSize: 13 }}>{error}</Text>
        </View>
      ) : null}

      <Text style={[styles.label, { color: theme.textSoft }]}>{t('teacher.session')}</Text>
      <View style={styles.chipRow}>
        {SEANCES.map(s => <SeanceChip key={s} value={s} />)}
      </View>

      <View style={[styles.summary, { backgroundColor: theme.white, borderColor: theme.border }]}>
        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>
          {date} · {seance} · {t('teacher.studentsCount', { count: eleves.length })} · {t('teacher.absentCount', { count: absent.size })}
        </Text>
        <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
          {t('teacher.tapAbsent')}
        </Text>
      </View>

      {requests.filter(r => r.status !== 'declined').length > 0 && (
        <View style={[styles.summary, { backgroundColor: theme.warning + '14', borderColor: theme.warning }]}>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>
            ⚑ {t('absenceRequest.declaredByParents')}
          </Text>
          {requests.filter(r => r.status !== 'declined').map(r => (
            <Text key={r.id} style={{ color: theme.textSoft, fontSize: 11.5, marginTop: 3 }}>
              • {r.elevePrenom} {r.eleveNom} — {r.reason}
            </Text>
          ))}
        </View>
      )}

      {loading && eleves.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={theme.primary} /></View>
      ) : eleves.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>
            {t('teacher.noStudentsInClass')}
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
          }]}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : (
              <>
                <Ionicons name="save" size={18} color="#fff" />
                <Text style={[styles.saveBtnText, { fontFamily: theme.fonts.black }]}>{t('teacher.saveAttendance')}</Text>
              </>
            )}
        </PressableScale>
      </View>

      <BehaviorSheet
        visible={!!behaviorFor}
        onClose={() => setBehaviorFor(null)}
        eleve={behaviorFor}
        classe={classe}
        date={date}
        seance={seance}
        teacher={profile ? { uid: profile.uid, nom: profile.nom, prenom: profile.prenom } : null}
      />
    </ScreenLayout>
  )
}

const styles = StyleSheet.create({
  label:        { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, minWidth: 50, alignItems: 'center' },
  summary:      { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  card:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  statusStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  eleveName:    { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  eleveStatus:  { fontSize: 12, fontWeight: '600' },
  behaviorBtn:  { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginStart: 10 },
  loading:      { paddingVertical: 40, alignItems: 'center' },
  empty:        { paddingVertical: 60, alignItems: 'center' },
  errorBox:     { padding: 12, borderRadius: 10, marginBottom: 12 },
  footer:       { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, borderTopWidth: 1 },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, borderRadius: 10 },
  saveBtnText:  { color: '#fff', fontSize: 16, fontWeight: '800' },
})
