/**
 * Champ « numéro de téléphone » avec sélecteur de pays.
 *
 * Pastille drapeau + indicatif → liste des pays (recherche multilingue, pays
 * fréquents en tête, « Autre pays »). Saisie mise en forme selon le pays,
 * validation en direct (trop court / trop long / préfixe marocain) et coche
 * verte quand le numéro est complet. Un numéro collé avec son indicatif
 * bascule seul sur le bon pays. Valeur : { iso, raw } → E.164 via
 * `phoneFieldE164` (utils/phoneCountries).
 */
import React, { useMemo, useState } from 'react'
import {
  View, Text, TextInput, Pressable, Modal, SectionList, StyleSheet, Platform,
  type ReturnKeyTypeOptions,
} from 'react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AlertCircle, Check, ChevronDown, Search, Smartphone, X } from 'lucide-react-native'
import { useTheme, type Theme } from '../contexts/ThemeContext'
import {
  OTHER_COUNTRY_ISO, SUGGESTED_COUNTRY_ISOS, countryName, digitsAfterFormattedEdit, digitsOnly, findPhoneCountry, flagOf,
  formatNationalInput, parseInternationalInput, phoneFieldValidity, phonePlaceholder, searchPhoneCountries,
  type PhoneCountry, type PhoneFieldValue,
} from '../utils/phoneCountries'

const MAX_TYPED_DIGITS = 15

interface Props {
  value: PhoneFieldValue
  onChange: (value: PhoneFieldValue) => void
  label?: string
  helper?: string
  /** Erreur imposée par l'écran (champ requis vide…), prioritaire. */
  errorMessage?: string
  /** Affiche aussi l'erreur de validité avant la perte de focus (après un envoi). */
  showValidationError?: boolean
  disabled?: boolean
  shape?: 'pill' | 'rounded'
  returnKeyType?: ReturnKeyTypeOptions
  onSubmitEditing?: () => void
}

export default function PhoneNumberField({
  value, onChange, label, helper, errorMessage, showValidationError = false, disabled = false,
  shape = 'rounded', returnKeyType, onSubmitEditing,
}: Props) {
  const theme = useTheme()
  const { t, i18n } = useTranslation()
  const [focused, setFocused] = useState(false)
  const [touched, setTouched] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const isOther = value.iso === OTHER_COUNTRY_ISO
  const country = isOther ? undefined : findPhoneCountry(value.iso)
  const validity = phoneFieldValidity(value)
  const display = country ? formatNationalInput(country, value.raw) : value.raw

  const validationMessage = (() => {
    switch (validity.status) {
      case 'too-short': return t('phoneField.tooShort', { digits: validity.min })
      case 'too-long': return t('phoneField.tooLong', { digits: validity.max })
      case 'invalid':
        if (isOther) return t('phoneField.invalidIntl')
        return value.iso === 'MA' ? t('phoneField.invalidMorocco') : t('phoneField.invalid')
      default: return ''
    }
  })()
  // Trop long : signalé tout de suite. Le reste : une fois le champ quitté, ou
  // après une tentative d'envoi — sauf « trop court » pendant qu'on tape encore.
  const showValidation = validity.status === 'too-long'
    || (!focused && (touched || showValidationError))
    || (focused && showValidationError && validity.status !== 'too-short')
  const error = errorMessage || (showValidation ? validationMessage : '')
  const valid = validity.status === 'valid'

  const onChangeText = (text: string) => {
    const international = parseInternationalInput(text, value.iso)
    if (international) {
      if (international.iso !== value.iso) Haptics.selectionAsync().catch(() => {})
      onChange(international)
      return
    }
    if (isOther) {
      onChange({ iso: OTHER_COUNTRY_ISO, raw: text.replace(/[^\d+\s().-]/g, '').slice(0, 24) })
      return
    }
    // Effacement d'un espace de mise en forme : on retire le chiffre qui le précède.
    const digits = digitsAfterFormattedEdit(digitsOnly(value.raw), display, text)
    onChange({ iso: value.iso, raw: digits.slice(0, MAX_TYPED_DIGITS) })
  }

  const selectCountry = (iso: string) => {
    setPickerOpen(false)
    Haptics.selectionAsync().catch(() => {})
    if (iso === value.iso) return
    // Les chiffres déjà tapés sont conservés ; en « Autre pays » on repart de « + ».
    onChange(iso === OTHER_COUNTRY_ISO ? { iso, raw: '+' } : { iso, raw: isOther ? '' : value.raw })
  }

  const pill = shape === 'pill'
  const borderColor = disabled ? theme.border
    : error ? theme.danger
      : focused ? theme.primary
        : theme.border
  const haloColor = disabled ? 'transparent' : error ? theme.dangerSurface : focused ? theme.primarySurface : 'transparent'
  const dialLabel = isOther ? '+…' : `+${country?.dial ?? ''}`
  const countryLabel = country ? countryName(country, i18n.language) : t('phoneField.otherCountry')

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={[styles.label, { color: theme.textSoft, fontFamily: theme.fonts.semibold }]}>{label}</Text>
      ) : null}

      <View style={[styles.halo, { borderColor: haloColor, borderRadius: pill ? 32 : 18 }]}>
        <View
          style={[
            styles.field,
            {
              borderColor,
              borderRadius: pill ? 28 : 14,
              height: pill ? 54 : 52,
              backgroundColor: disabled ? theme.surfaceAlt : theme.card,
              opacity: disabled ? 0.6 : 1,
            },
          ]}
        >
          <Pressable
            onPress={() => setPickerOpen(true)}
            disabled={disabled}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('phoneField.countryA11y', { country: countryLabel, dial: dialLabel })}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: pressed ? theme.primarySurface : theme.surfaceAlt, borderColor: theme.border },
            ]}
          >
            <Text style={styles.flag}>{flagOf(value.iso)}</Text>
            <Text style={[styles.dial, { color: theme.text, fontFamily: theme.fonts.semibold }]}>{dialLabel}</Text>
            <ChevronDown size={14} color={theme.textMuted} strokeWidth={2} />
          </Pressable>

          <TextInput
            value={display}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); if (value.raw.trim()) setTouched(true) }}
            editable={!disabled}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={28}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            placeholder={country ? phonePlaceholder(country) : t('phoneField.intlPlaceholder')}
            placeholderTextColor={theme.textMuted}
            accessibilityLabel={label || t('phoneField.label')}
            accessibilityHint={helper}
            style={[styles.input, { color: theme.text, fontFamily: theme.fonts.medium }]}
          />

          <View style={styles.trailing}>
            {valid ? (
              <MotiView
                from={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 14 }}
                style={[styles.checkBadge, { backgroundColor: theme.successSurface }]}
                accessibilityLabel={t('phoneField.valid')}
              >
                <Check size={14} color={theme.success} strokeWidth={3} />
              </MotiView>
            ) : error ? (
              <AlertCircle size={18} color={theme.danger} strokeWidth={2} />
            ) : (
              <Smartphone size={18} color={theme.textMuted} strokeWidth={1.75} />
            )}
          </View>
        </View>
      </View>

      {error ? (
        <MotiView from={{ opacity: 0, translateY: -3 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 160 }}>
          <Text accessibilityLiveRegion="polite" style={[styles.message, { color: theme.danger, fontFamily: theme.fonts.medium }]}>{error}</Text>
        </MotiView>
      ) : helper ? (
        <Text style={[styles.message, { color: theme.textMuted, fontFamily: theme.fonts.regular }]}>{helper}</Text>
      ) : null}

      <CountryPickerModal
        visible={pickerOpen}
        selectedIso={value.iso}
        onSelect={selectCountry}
        onClose={() => setPickerOpen(false)}
        theme={theme}
      />
    </View>
  )
}

type Row = { kind: 'country'; country: PhoneCountry } | { kind: 'other' }

function CountryPickerModal({ visible, selectedIso, onSelect, onClose, theme }: {
  visible: boolean
  selectedIso: string
  onSelect: (iso: string) => void
  onClose: () => void
  theme: Theme
}) {
  const { t, i18n } = useTranslation()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')

  const sections = useMemo(() => {
    const results = searchPhoneCountries(query, i18n.language)
    const other: Row = { kind: 'other' }
    if (query.trim()) {
      // Aucun résultat : le titre le dit, et « Autre pays » reste proposé.
      const title = results.length ? '' : t('phoneField.noResult')
      return [{ key: 'results', title, data: [...results.map(country => ({ kind: 'country', country }) as Row), other] }]
    }
    const suggested = SUGGESTED_COUNTRY_ISOS
      .map(iso => findPhoneCountry(iso))
      .filter((country): country is PhoneCountry => Boolean(country))
    return [
      { key: 'suggested', title: t('phoneField.suggested'), data: suggested.map(country => ({ kind: 'country', country }) as Row) },
      { key: 'all', title: t('phoneField.allCountries'), data: [...results.map(country => ({ kind: 'country', country }) as Row), other] },
    ]
  }, [query, i18n.language, t])

  const close = () => { setQuery(''); onClose() }
  const pick = (iso: string) => { setQuery(''); onSelect(iso) }

  const renderRow = ({ item }: { item: Row }) => {
    const iso = item.kind === 'country' ? item.country.iso : OTHER_COUNTRY_ISO
    const selected = iso === selectedIso
    const name = item.kind === 'country' ? countryName(item.country, i18n.language) : t('phoneField.otherCountry')
    return (
      <Pressable
        onPress={() => pick(iso)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: selected ? theme.primarySurface : pressed ? theme.surfaceAlt : 'transparent' },
        ]}
      >
        <Text style={styles.rowFlag}>{flagOf(iso)}</Text>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[styles.rowName, { color: theme.text, fontFamily: selected ? theme.fonts.semibold : theme.fonts.medium }]}>{name}</Text>
          {item.kind === 'other' ? (
            <Text style={[styles.rowHint, { color: theme.textMuted, fontFamily: theme.fonts.regular }]}>{t('phoneField.otherCountryHint')}</Text>
          ) : null}
        </View>
        {item.kind === 'country' ? (
          <View style={[styles.dialChip, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <Text style={[styles.dialChipText, { color: theme.textSoft, fontFamily: theme.fonts.semibold }]}>+{item.country.dial}</Text>
          </View>
        ) : null}
        {selected ? <Check size={18} color={theme.primary} strokeWidth={2.5} style={{ marginStart: 8 }} /> : null}
      </Pressable>
    )
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={close}
    >
      <View style={[styles.sheet, { backgroundColor: theme.bg, paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 12 }]}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: theme.text, fontFamily: theme.fonts.bold }]}>{t('phoneField.chooseCountry')}</Text>
          <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('phoneField.close')} style={[styles.closeButton, { backgroundColor: theme.surfaceAlt }]}>
            <X size={18} color={theme.textSoft} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Search size={17} color={theme.textMuted} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('phoneField.searchCountry')}
            placeholderTextColor={theme.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            accessibilityLabel={t('phoneField.searchCountry')}
            style={[styles.searchInput, { color: theme.text, fontFamily: theme.fonts.regular }]}
          />
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(item) => (item.kind === 'country' ? item.country.iso : OTHER_COUNTRY_ISO)}
          renderItem={renderRow}
          renderSectionHeader={({ section }) => (section.title ? (
            <Text style={[styles.sectionTitle, { color: theme.textMuted, backgroundColor: theme.bg, fontFamily: theme.fonts.semibold }]}>{section.title}</Text>
          ) : null)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', marginBottom: 12 },
  label: { fontSize: 13, marginBottom: 6, marginStart: 4 },
  // Halo de focus hors du cadre (marge négative) : le champ reste aligné
  // sur les autres champs de l'écran.
  halo: { borderWidth: 3, margin: -3 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    paddingStart: 6,
    paddingEnd: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flag: { fontSize: 18 },
  dial: { fontSize: 14 },
  input: { flex: 1, fontSize: 16, paddingHorizontal: 12, paddingVertical: 0, letterSpacing: 0.3 },
  trailing: { width: 26, alignItems: 'center', justifyContent: 'center' },
  checkBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  message: { fontSize: 12, lineHeight: 17, marginTop: 6, marginStart: 6 },

  sheet: { flex: 1 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14 },
  sheetTitle: { fontSize: 20 },
  closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8,
    height: 46, borderRadius: 23, borderWidth: 1, paddingHorizontal: 16,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  sectionTitle: { fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 8, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 14 },
  rowFlag: { fontSize: 24 },
  rowName: { fontSize: 15 },
  rowHint: { fontSize: 12, marginTop: 2 },
  dialChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  dialChipText: { fontSize: 12 },
})
