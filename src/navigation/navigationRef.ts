/**
 * Ref de navigation accessible hors de l'arbre React (notifications push,
 * deep links). Attachée au NavigationContainer dans NavigationRoot.
 */
import { createNavigationContainerRef } from '@react-navigation/native'

export const navigationRef = createNavigationContainerRef<any>()
