import React from 'react'
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg'
import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileText,
  Home,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  Star,
  User,
} from 'lucide-react-native'
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter'
import {
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins'
import {
  Cairo_600SemiBold,
  Cairo_700Bold,
} from '@expo-google-fonts/cairo'

const LOGO_URI = 'https://www.genspark.ai/api/files/s/WpSIoNoy'

const colors = {
  cream: '#FAF8F5',
  cream2: '#FAF7F2',
  card: '#FFFFFF',
  hero: '#FFF4E7',
  navy: '#1D3557',
  blue: '#4A90E2',
  orange: '#FF8C42',
  gold: '#FFD23F',
  green: '#52B788',
  pink: '#FFB3C1',
  purple: '#B8B8FF',
  gray: '#6C757D',
  paleLine: '#EFE9DF',
  teal: '#20B2AA',
}

type IconComponent = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number; fill?: string }>

type QuickItem = {
  label: string
  color: string
  icon: IconComponent
}

function BackgroundTexture() {
  const speckles = [
    { left: 24, top: 66, size: 5, color: '#F0D4B6' },
    { right: 42, top: 110, size: 4, color: '#D7E6F7' },
    { left: 62, top: 210, size: 3, color: '#F7C8D1' },
    { right: 30, top: 324, size: 6, color: '#F2DFA5' },
    { left: 35, top: 445, size: 4, color: '#CFEFE6' },
    { right: 82, top: 520, size: 3, color: '#E8DCF8' },
    { left: 96, bottom: 260, size: 5, color: '#F3D4B8' },
    { right: 48, bottom: 180, size: 4, color: '#D7E6F7' },
    { left: 18, bottom: 88, size: 3, color: '#F7C8D1' },
  ]

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View style={[styles.wash, styles.washOne]} />
      <View style={[styles.wash, styles.washTwo]} />
      <View style={[styles.paperStroke, { top: 132, left: -26, transform: [{ rotate: '-10deg' }] }]} />
      <View style={[styles.paperStroke, { bottom: 198, right: -40, transform: [{ rotate: '14deg' }] }]} />
      {speckles.map((dot, index) => (
        <View
          key={index}
          style={[
            styles.speckle,
            dot,
            { width: dot.size, height: dot.size, borderRadius: dot.size / 2 },
          ]}
        />
      ))}
    </View>
  )
}

function AdminIllustration() {
  return (
    <Svg width={140} height={150} viewBox="0 0 140 150">
      <Ellipse cx="78" cy="136" rx="48" ry="8" fill="#E8D8C7" opacity="0.45" />
      <Rect x="76" y="62" width="42" height="58" rx="13" fill="#B8D8FF" stroke="#1D3557" strokeWidth="2" />
      <Path d="M86 78c9 6 17 6 25 0v42H86z" fill="#FFF4E7" opacity="0.5" />
      <Circle cx="96" cy="43" r="20" fill="#FFD8C7" stroke="#1D3557" strokeWidth="2" />
      <Path d="M78 42c4-21 34-26 41-3-12-3-21-6-34 2" fill="#5E4B43" stroke="#1D3557" strokeWidth="2" />
      <Path d="M88 49c5 5 12 5 17 0" stroke="#1D3557" strokeWidth="2" strokeLinecap="round" fill="none" />
      <Circle cx="89" cy="43" r="2" fill="#1D3557" />
      <Circle cx="105" cy="43" r="2" fill="#1D3557" />
      <Path d="M76 76c-13 7-21 16-22 30" stroke="#1D3557" strokeWidth="5" strokeLinecap="round" fill="none" />
      <Path d="M116 76c10 7 16 17 18 30" stroke="#1D3557" strokeWidth="5" strokeLinecap="round" fill="none" />
      <Rect x="16" y="91" width="76" height="44" rx="7" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2" />
      <Rect x="21" y="98" width="66" height="30" rx="4" fill="#EAF4FF" />
      <Circle cx="54" cy="113" r="7" fill="#FFB3C1" opacity="0.9" />
      <Path d="M26 135h74" stroke="#1D3557" strokeWidth="4" strokeLinecap="round" />
      <Rect x="103" y="104" width="24" height="30" rx="3" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2" />
      <Line x1="108" y1="112" x2="122" y2="112" stroke="#FF8C42" strokeWidth="2" strokeLinecap="round" />
      <Line x1="108" y1="120" x2="119" y2="120" stroke="#4A90E2" strokeWidth="2" strokeLinecap="round" />
      <Line x1="108" y1="128" x2="124" y2="128" stroke="#52B788" strokeWidth="2" strokeLinecap="round" />
      <Circle cx="24" cy="78" r="10" fill="#FFD23F" stroke="#1D3557" strokeWidth="2" />
      <Path d="M19 79l4 4 7-9" stroke="#1D3557" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  )
}

function StudentsIllustration() {
  return (
    <Svg width={122} height={104} viewBox="0 0 122 104">
      <Ellipse cx="60" cy="94" rx="45" ry="7" fill="#EAD9CA" opacity="0.5" />
      <G>
        <Circle cx="26" cy="42" r="13" fill="#FFD8C7" stroke="#1D3557" strokeWidth="2" />
        <Path d="M13 43c2-19 28-19 29-2-9-3-18-4-29 2" fill="#463C35" />
        <Rect x="10" y="55" width="31" height="35" rx="11" fill="#4A90E2" stroke="#1D3557" strokeWidth="2" />
      </G>
      <G>
        <Circle cx="50" cy="34" r="14" fill="#F6C9B6" stroke="#1D3557" strokeWidth="2" />
        <Path d="M37 35c2-17 23-21 29-4-8-2-17-3-29 4" fill="#795548" />
        <Rect x="35" y="48" width="34" height="41" rx="12" fill="#FFB3C1" stroke="#1D3557" strokeWidth="2" />
      </G>
      <G>
        <Circle cx="77" cy="40" r="13" fill="#DEB195" stroke="#1D3557" strokeWidth="2" />
        <Path d="M65 38c1-18 25-18 26 1-7-7-18-7-26-1" fill="#2F3542" />
        <Rect x="62" y="53" width="33" height="36" rx="11" fill="#52B788" stroke="#1D3557" strokeWidth="2" />
      </G>
      <G>
        <Path d="M93 29c14 1 22 13 18 29-3 12-21 14-30 4-7-9-4-27 12-33z" fill="#EEDFD0" stroke="#1D3557" strokeWidth="2" />
        <Circle cx="95" cy="43" r="12" fill="#C98E70" stroke="#1D3557" strokeWidth="2" />
        <Path d="M82 42c6-17 25-17 30 2-10-5-19-5-30-2" fill="#FFFFFF" opacity="0.85" />
        <Rect x="79" y="56" width="33" height="34" rx="11" fill="#B8B8FF" stroke="#1D3557" strokeWidth="2" />
      </G>
      <Circle cx="15" cy="20" r="4" fill="#FFD23F" />
      <Circle cx="106" cy="20" r="4" fill="#FF8C42" />
    </Svg>
  )
}

function TeacherIllustration() {
  return (
    <Svg width={122} height={104} viewBox="0 0 122 104">
      <Ellipse cx="62" cy="93" rx="43" ry="8" fill="#EAD9CA" opacity="0.55" />
      <Rect x="17" y="55" width="62" height="34" rx="9" fill="#EAF4FF" stroke="#1D3557" strokeWidth="2" />
      <Rect x="25" y="62" width="46" height="5" rx="2.5" fill="#4A90E2" />
      <Rect x="25" y="73" width="34" height="5" rx="2.5" fill="#FFB3C1" />
      <Circle cx="82" cy="35" r="17" fill="#FFD8C7" stroke="#1D3557" strokeWidth="2" />
      <Path d="M65 33c2-19 29-22 36-4-10-4-22-3-36 4" fill="#5A463D" />
      <Path d="M74 42c5 5 11 5 16 0" stroke="#1D3557" strokeWidth="2" fill="none" strokeLinecap="round" />
      <Rect x="63" y="52" width="39" height="38" rx="12" fill="#52B788" stroke="#1D3557" strokeWidth="2" />
      <Path d="M60 60l-25-9" stroke="#1D3557" strokeWidth="5" strokeLinecap="round" />
      <Rect x="26" y="38" width="18" height="29" rx="3" fill="#FFD23F" stroke="#1D3557" strokeWidth="2" />
      <Rect x="35" y="43" width="18" height="29" rx="3" fill="#FF8C42" stroke="#1D3557" strokeWidth="2" />
      <Path d="M103 63l10-8" stroke="#1D3557" strokeWidth="5" strokeLinecap="round" />
    </Svg>
  )
}

function ClassroomIllustration() {
  return (
    <Svg width={122} height={104} viewBox="0 0 122 104">
      <Ellipse cx="61" cy="94" rx="44" ry="7" fill="#EAD9CA" opacity="0.5" />
      <Rect x="22" y="18" width="78" height="39" rx="7" fill="#E7F3EA" stroke="#1D3557" strokeWidth="2" />
      <Line x1="34" y1="31" x2="87" y2="31" stroke="#52B788" strokeWidth="3" strokeLinecap="round" />
      <Line x1="34" y1="43" x2="74" y2="43" stroke="#4A90E2" strokeWidth="3" strokeLinecap="round" />
      <Rect x="24" y="63" width="28" height="18" rx="4" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2" />
      <Rect x="70" y="63" width="28" height="18" rx="4" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2" />
      <Line x1="31" y1="81" x2="26" y2="93" stroke="#1D3557" strokeWidth="2" strokeLinecap="round" />
      <Line x1="47" y1="81" x2="52" y2="93" stroke="#1D3557" strokeWidth="2" strokeLinecap="round" />
      <Line x1="77" y1="81" x2="72" y2="93" stroke="#1D3557" strokeWidth="2" strokeLinecap="round" />
      <Line x1="93" y1="81" x2="98" y2="93" stroke="#1D3557" strokeWidth="2" strokeLinecap="round" />
      <Circle cx="105" cy="21" r="9" fill="#FFD23F" stroke="#1D3557" strokeWidth="2" />
      <Path d="M101 21l3 3 6-7" stroke="#1D3557" strokeWidth="2" fill="none" strokeLinecap="round" />
      <Circle cx="17" cy="38" r="6" fill="#B8B8FF" />
    </Svg>
  )
}

function EventIllustration() {
  return (
    <Svg width={92} height={78} viewBox="0 0 92 78">
      <Ellipse cx="44" cy="70" rx="31" ry="5" fill="#EAD9CA" opacity="0.5" />
      <Rect x="16" y="14" width="58" height="49" rx="9" fill="#FFFFFF" stroke="#1D3557" strokeWidth="2" />
      <Rect x="16" y="14" width="58" height="14" rx="8" fill="#FF8C42" stroke="#1D3557" strokeWidth="2" />
      <Line x1="28" y1="10" x2="28" y2="20" stroke="#1D3557" strokeWidth="3" strokeLinecap="round" />
      <Line x1="62" y1="10" x2="62" y2="20" stroke="#1D3557" strokeWidth="3" strokeLinecap="round" />
      <Circle cx="31" cy="40" r="5" fill="#4A90E2" />
      <Circle cx="46" cy="40" r="5" fill="#FFD23F" />
      <Circle cx="61" cy="40" r="5" fill="#FFB3C1" />
      <Path d="M28 53h32" stroke="#52B788" strokeWidth="4" strokeLinecap="round" />
      <Circle cx="75" cy="18" r="10" fill="#B8B8FF" opacity="0.8" />
    </Svg>
  )
}

function Header() {
  return (
    <View style={[styles.cardShadow, styles.headerCard]}>
      <Image source={{ uri: LOGO_URI }} style={styles.logo} resizeMode="contain" />
      <View style={styles.headerTextWrap}>
        <Text style={styles.arabicName} numberOfLines={1}>مدرسة مجمع المعرفة للتعليم العصري</Text>
        <Text style={styles.frenchSubtitle} numberOfLines={1}>Complexe Al Maarifa • Système scolaire</Text>
      </View>
      <Pressable style={styles.headerIcon}>
        <Bell size={21} color={colors.navy} strokeWidth={2.1} />
        <View style={styles.badge} />
      </Pressable>
      <View style={styles.avatar}>
        <User size={20} color={colors.navy} strokeWidth={2.2} />
      </View>
    </View>
  )
}

function HeroGreeting() {
  return (
    <View style={[styles.cardShadow, styles.heroCard]}>
      <View style={styles.heroCopy}>
        <Text style={styles.greeting}>Bonjour, Nadia!</Text>
        <Text style={styles.greetingSub}>Prêt à gérer votre école efficacement?</Text>
      </View>
      <View style={styles.heroArt}>
        <AdminIllustration />
      </View>
    </View>
  )
}

function StatColumn({
  iconBg,
  icon,
  title,
  primary,
  secondary,
}: {
  iconBg: string
  icon: React.ReactNode
  title: string
  primary: string
  secondary: string
}) {
  return (
    <View style={styles.statColumn}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={styles.statPrimary}>{primary}</Text>
      <Text style={[styles.statSecondary, secondary.includes('compléter') && { color: colors.orange }]}>{secondary}</Text>
    </View>
  )
}

function StatsSummary() {
  return (
    <View style={[styles.cardShadow, styles.statsCard]}>
      <StatColumn
        iconBg={colors.navy}
        icon={<CalendarDays size={18} color="#fff" strokeWidth={2.2} />}
        title="Aujourd'hui"
        primary="15 mai 2024"
        secondary="Journée A"
      />
      <View style={styles.divider} />
      <StatColumn
        iconBg={colors.gold}
        icon={<Star size={18} color={colors.navy} fill={colors.navy} strokeWidth={2} />}
        title="Statistiques"
        primary="342 élèves"
        secondary="18 classes"
      />
      <View style={styles.divider} />
      <StatColumn
        iconBg={colors.green}
        icon={<Check size={19} color="#fff" strokeWidth={2.5} />}
        title="Tâches"
        primary="12 suivies"
        secondary="5 à compléter"
      />
    </View>
  )
}

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  )
}

function ModuleCard({
  children,
  title,
  subtitle,
  metric,
  progress,
  color,
}: {
  children: React.ReactNode
  title: string
  subtitle: string
  metric: string
  progress: number
  color: string
}) {
  return (
    <View style={[styles.cardShadow, styles.moduleCard]}>
      <View style={styles.moduleArt}>{children}</View>
      <View style={styles.moduleText}>
        <Text style={styles.moduleTitle}>{title}</Text>
        <Text style={styles.moduleSubtitle}>{subtitle}</Text>
        <View style={styles.progressHeader}>
          <Text style={styles.metric}>{metric}</Text>
          <Text style={styles.percent}>{Math.round(progress * 100)}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  )
}

function DashboardModules() {
  return (
    <View style={styles.modulesBlock}>
      <SectionTitle title="Tableau de bord" action="Voir tout" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modulesScroller}>
        <ModuleCard title="Élèves" subtitle="Gestion des élèves" metric="342 inscrits" progress={0.85} color={colors.navy}>
          <StudentsIllustration />
        </ModuleCard>
        <ModuleCard title="Enseignants" subtitle="Gestion pédagogique" metric="28 actifs" progress={0.72} color={colors.green}>
          <TeacherIllustration />
        </ModuleCard>
        <ModuleCard title="Classes" subtitle="Salles et niveaux" metric="18 classes" progress={0.64} color={colors.purple}>
          <ClassroomIllustration />
        </ModuleCard>
      </ScrollView>
    </View>
  )
}

function UpcomingEvent() {
  return (
    <View style={[styles.cardShadow, styles.eventCard]}>
      <EventIllustration />
      <View style={styles.eventCopy}>
        <Text style={styles.eventTitle}>Réunion à venir</Text>
        <Text style={styles.eventSubtitle}>Réunion parents-enseignants ce vendredi</Text>
      </View>
      <View style={styles.eventArrow}>
        <ChevronRight size={20} color="#fff" strokeWidth={2.4} />
      </View>
    </View>
  )
}

const quickItems: QuickItem[] = [
  { label: 'Présence', color: colors.orange, icon: ClipboardCheck },
  { label: 'Notes', color: colors.blue, icon: FileText },
  { label: 'Messages', color: colors.teal, icon: MessageCircle },
  { label: 'Paiements', color: colors.gold, icon: CreditCard },
  { label: 'Rapports', color: colors.navy, icon: FileText },
  { label: 'Plus', color: '#EDE7DE', icon: MoreHorizontal },
]

function QuickAccess() {
  return (
    <View style={styles.quickBlock}>
      <SectionTitle title="Accès rapide" />
      <View style={styles.quickGrid}>
        {quickItems.map(({ label, color, icon: Icon }) => (
          <Pressable key={label} style={[styles.cardShadow, styles.quickCard]}>
            <View style={[styles.quickIcon, { backgroundColor: color }]}>
              <Icon
                size={23}
                color={label === 'Plus' || label === 'Paiements' ? colors.navy : '#fff'}
                strokeWidth={2.15}
              />
            </View>
            <Text style={styles.quickLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function BottomNavigation() {
  const inactive = '#8B929A'
  return (
    <View style={styles.bottomNav}>
      <View style={styles.navItem}>
        <Home size={23} color={colors.navy} fill={colors.navy} strokeWidth={2.1} />
        <Text style={[styles.navLabel, { color: colors.navy }]}>Accueil</Text>
      </View>
      <View style={styles.navItem}>
        <LayoutGrid size={22} color={inactive} strokeWidth={2} />
        <Text style={styles.navLabel}>Gestion</Text>
      </View>
      <View style={styles.navCenterWrap}>
        <LinearGradient colors={[colors.navy, colors.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.navCenterButton}>
          <BarChart3 size={28} color="#fff" strokeWidth={2.3} />
        </LinearGradient>
        <Text style={[styles.navLabel, { color: colors.navy }]}>Dashboard</Text>
      </View>
      <View style={styles.navItem}>
        <View>
          <MessageCircle size={22} color={inactive} strokeWidth={2} />
          <View style={styles.navDot} />
        </View>
        <Text style={styles.navLabel}>Messages</Text>
      </View>
      <View style={styles.navItem}>
        <User size={22} color={inactive} strokeWidth={2} />
        <Text style={styles.navLabel}>Profil</Text>
      </View>
    </View>
  )
}

function SchoolDashboardMockup() {
  return (
    <LinearGradient colors={[colors.cream, colors.cream2]} style={styles.root}>
      <BackgroundTexture />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Header />
          <HeroGreeting />
          <StatsSummary />
          <DashboardModules />
          <UpcomingEvent />
          <QuickAccess />
        </ScrollView>
        <BottomNavigation />
      </SafeAreaView>
    </LinearGradient>
  )
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Cairo_600SemiBold,
    Cairo_700Bold,
  })

  if (!fontsLoaded) {
    return (
      <View style={[styles.root, styles.loading]}>
        <Text style={styles.loadingText}>Chargement…</Text>
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SchoolDashboardMockup />
    </SafeAreaProvider>
  )
}

const shadow = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  android: { elevation: 4 },
  default: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
})

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.gray,
    fontFamily: 'Inter_600SemiBold',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 130,
  },
  wash: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.34,
  },
  washOne: {
    width: 250,
    height: 250,
    left: -112,
    top: 70,
    backgroundColor: '#FFE4D4',
  },
  washTwo: {
    width: 270,
    height: 270,
    right: -130,
    top: 445,
    backgroundColor: '#DDEBFF',
  },
  paperStroke: {
    position: 'absolute',
    width: 190,
    height: 52,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(224,197,166,0.24)',
  },
  speckle: {
    position: 'absolute',
    opacity: 0.75,
  },
  cardShadow: {
    ...shadow,
  },
  headerCard: {
    minHeight: 86,
    borderRadius: 24,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 18,
  },
  logo: {
    width: 58,
    height: 58,
    marginRight: 12,
  },
  headerTextWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  arabicName: {
    color: colors.navy,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Cairo_700Bold',
    writingDirection: 'rtl',
    textAlign: 'left',
  },
  frenchSubtitle: {
    color: colors.gray,
    fontSize: 11.5,
    fontFamily: 'Inter_500Medium',
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF8EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  badge: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.orange,
    right: 11,
    top: 10,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EAF4FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#D9E9FA',
  },
  heroCard: {
    minHeight: 184,
    borderRadius: 28,
    backgroundColor: colors.hero,
    padding: 20,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 16,
  },
  heroCopy: {
    flex: 1.05,
    justifyContent: 'center',
    zIndex: 2,
  },
  greeting: {
    color: colors.navy,
    fontSize: 33,
    lineHeight: 39,
    letterSpacing: -0.6,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  greetingSub: {
    color: colors.gray,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
    fontFamily: 'Inter_500Medium',
  },
  heroArt: {
    width: 136,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginRight: -8,
  },
  statsCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    minHeight: 142,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 6,
    marginBottom: 20,
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  statIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statTitle: {
    color: colors.gray,
    fontSize: 11.5,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
  },
  statPrimary: {
    color: colors.navy,
    fontSize: 13.5,
    fontFamily: 'Inter_800ExtraBold',
    textAlign: 'center',
  },
  statSecondary: {
    color: colors.gray,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    marginTop: 3,
    textAlign: 'center',
  },
  divider: {
    height: 74,
    width: 1,
    backgroundColor: colors.paleLine,
  },
  modulesBlock: {
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    color: colors.navy,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: 'Inter_800ExtraBold',
    letterSpacing: -0.25,
  },
  sectionAction: {
    color: colors.blue,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  modulesScroller: {
    paddingRight: 18,
    paddingBottom: 3,
    gap: 14,
  },
  moduleCard: {
    width: 292,
    minHeight: 186,
    backgroundColor: colors.card,
    borderRadius: 25,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  moduleArt: {
    width: 122,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleText: {
    flex: 1,
    paddingLeft: 10,
  },
  moduleTitle: {
    color: colors.navy,
    fontSize: 22,
    fontFamily: 'Inter_800ExtraBold',
    marginBottom: 4,
  },
  moduleSubtitle: {
    color: colors.gray,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Inter_500Medium',
    marginBottom: 18,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metric: {
    color: colors.navy,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  percent: {
    color: colors.gray,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#EEECE8',
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 999,
  },
  eventCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    minHeight: 104,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  eventCopy: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 8,
  },
  eventTitle: {
    color: colors.navy,
    fontSize: 18,
    fontFamily: 'Inter_800ExtraBold',
    marginBottom: 6,
  },
  eventSubtitle: {
    color: colors.gray,
    fontSize: 12.8,
    lineHeight: 19,
    fontFamily: 'Inter_500Medium',
  },
  eventArrow: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBlock: {
    marginBottom: 10,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 13,
  },
  quickCard: {
    width: '31.2%',
    minHeight: 108,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  quickIcon: {
    width: 47,
    height: 47,
    borderRadius: 23.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },
  quickLabel: {
    color: colors.navy,
    fontSize: 12.2,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 94,
    backgroundColor: '#FFF8EF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 9,
  },
  navItem: {
    width: 63,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  navCenterWrap: {
    width: 82,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -33,
  },
  navCenterButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: '#FFF8EF',
    marginBottom: 4,
  },
  navLabel: {
    color: '#8B929A',
    fontSize: 10.8,
    fontFamily: 'Inter_700Bold',
  },
  navDot: {
    position: 'absolute',
    right: -2,
    top: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.orange,
    borderWidth: 1,
    borderColor: '#FFF8EF',
  },
})
