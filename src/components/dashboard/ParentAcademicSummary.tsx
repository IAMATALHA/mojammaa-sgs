import React from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import type { Theme } from '../../contexts/ThemeContext'
import type { ChildReportReal, ChildCompetenceReportReal } from '../../hooks/useParentNotes'
import { formatParentAverage } from '../../utils/parentStatistics'

const copy = {
  fr: { title: 'Le suivi scolaire', average: 'Moyenne pondérée', subjects: 'matières évaluées', detail: 'Voir les résultats', empty: 'Les résultats apparaîtront ici dès leur publication.', error: 'Résultats indisponibles pour le moment.', loading: 'Chargement des résultats…', acquired: 'Acquis', progressing: 'En cours', notAcquired: 'Non acquis', competencies: 'Compétences', note: 'Calculée sur les notes publiées, avec les coefficients des matières. Elle peut évoluer.' },
  ar: { title: 'المتابعة الدراسية', average: 'المعدل حسب المعاملات', subjects: 'مواد تم تقييمها', detail: 'عرض النتائج', empty: 'ستظهر النتائج هنا فور نشرها.', error: 'النتائج غير متاحة حالياً.', loading: 'جارٍ تحميل النتائج…', acquired: 'مكتسب', progressing: 'في طور الاكتساب', notAcquired: 'غير مكتسب', competencies: 'الكفايات', note: 'يُحسب من النقط المنشورة ومعاملات المواد، وقد يتغير.' },
  en: { title: 'School progress', average: 'Weighted average', subjects: 'subjects assessed', detail: 'View results', empty: 'Results will appear here once published.', error: 'Results are currently unavailable.', loading: 'Loading results…', acquired: 'Acquired', progressing: 'In progress', notAcquired: 'Not acquired', competencies: 'Skills', note: 'Based on published grades and subject coefficients. This average may change.' },
}

export default function ParentAcademicSummary({ theme, language, childName, period, loading, error, report, competenceReport, onOpen }: {
  theme: Theme; language: string; childName: string; period: string; loading: boolean; error: boolean
  report: ChildReportReal | null; competenceReport: ChildCompetenceReportReal | null; onOpen: () => void
}) {
  const ar = language.startsWith('ar')
  const c = copy[ar ? 'ar' : language.startsWith('en') ? 'en' : 'fr']
  const body = { color: theme.textSoft, fontFamily: ar ? theme.fonts.arabic : theme.fonts.regular, fontSize: 13, lineHeight: ar ? 24 : 20, textAlign: ar ? 'right' as const : 'left' as const }
  const bold = { ...body, color: theme.text, fontFamily: ar ? theme.fonts.arabicBold : theme.fonts.bold }
  return (
    <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 24, padding: 20, gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ ...bold, fontSize: 19, lineHeight: 30 }}>{c.title} · {childName}</Text>
        <Text style={body}>{period}</Text>
      </View>
      {loading ? <View accessibilityRole="progressbar" style={{ gap: 10 }}><ActivityIndicator color={theme.primary} /><Text style={body}>{c.loading}</Text></View>
        : error ? <Text accessibilityRole="alert" style={body}>{c.error}</Text>
        : report ? <>
          <View style={{ backgroundColor: theme.primarySurface, padding: 18, borderRadius: 18, gap: 6 }}>
            <Text style={body}>{c.average}</Text>
            <Text style={{ ...bold, color: theme.primary, fontSize: 34, lineHeight: 44, fontVariant: ['tabular-nums'] }}>{formatParentAverage(report)}</Text>
            <Text style={body}>{report.subjects.length} {c.subjects}</Text>
          </View>
          <Text style={body}>{c.note}</Text>
        </> : competenceReport ? <View style={{ gap: 8 }}>
          <Text style={bold}>{c.competencies}</Text>
          {([[c.acquired, competenceReport.summary.acquis], [c.progressing, competenceReport.summary.encours], [c.notAcquired, competenceReport.summary.nonAcquis]] as const).map(([label, value]) => (
            <View key={label} style={{ flexDirection: ar ? 'row-reverse' : 'row', justifyContent: 'space-between', gap: 12 }}><Text style={body}>{label}</Text><Text style={bold}>{value}</Text></View>
          ))}
        </View> : <Text style={body}>{c.empty}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={`${c.detail} · ${childName}`} onPress={onOpen}
        style={({ pressed }) => ({ minHeight: 48, borderRadius: 14, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', padding: 12, opacity: pressed ? 0.8 : 1 })}>
        <Text style={{ ...bold, color: '#fff' }}>{c.detail}</Text>
      </Pressable>
    </View>
  )
}
