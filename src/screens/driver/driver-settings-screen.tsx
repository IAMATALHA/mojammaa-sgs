import React from 'react'
import { useTranslation } from 'react-i18next'
import BasicSettingsScreen from '../../components/BasicSettingsScreen'

export default function DriverSettingsScreen() {
  const { t } = useTranslation()
  return <BasicSettingsScreen roleLabel={t('roles.driver')} />
}
