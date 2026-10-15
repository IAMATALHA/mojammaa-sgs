/**
 * Affichage de la remarque du professeur sur un rendu : remarques rapides
 * (vert = positives, orange = à travailler) puis texte libre. Utilisé par le
 * suivi du professeur et par la carte « Rendre ce devoir » de la famille.
 */
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MessageSquare } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import { dirStyle } from '../../utils/arabicText'
import { POSITIVE_REMARK_TAGS, hasRemark, type HomeworkRemark } from '../../utils/homeworkRemarks'

export default function HomeworkRemarkView({ remark, showTitle = false }: { remark: HomeworkRemark; showTitle?: boolean }) {
  const theme = useTheme()
  const { t } = useTranslation()
  if (!hasRemark(remark)) return null
  return (
    <View style={[styles.box, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
      {showTitle ? (
        <View style={styles.titleRow}>
          <MessageSquare size={13} color={theme.primary} />
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{t('homeworkTracking.remark.title')}</Text>
        </View>
      ) : null}
      {remark.tags.length ? (
        <View style={styles.tags}>
          {remark.tags.map(tag => {
            const color = POSITIVE_REMARK_TAGS.includes(tag) ? theme.success : theme.warning
            return (
              <View key={tag} style={[styles.tag, { borderColor: color + '66', backgroundColor: color + '14' }]}>
                <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{t(`homeworkTracking.remark.tags.${tag}`)}</Text>
              </View>
            )
          })}
        </View>
      ) : null}
      {remark.comment ? (
        <Text style={[{ color: theme.text, fontSize: 12, lineHeight: 17 }, dirStyle(remark.comment)]}>{remark.comment}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 9, marginTop: 8, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
})
