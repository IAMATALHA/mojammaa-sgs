/**
 * Liens d'activation (Android App Links) : ce que l'activité rend à React.
 *
 * L'application lit le lien de lancement avec Linking.getInitialURL(), qui
 * renvoie l'intent courant de l'activité. Deux cas faussent cette lecture :
 *
 * 1. Lancement REJOUÉ. Android recrée l'activité avec son intent d'origine
 *    quand la tâche revient après l'arrêt du processus (applications récentes,
 *    icône) : le lien touché hier reviendrait comme un nouvel appui. On retire
 *    alors l'adresse de l'intent (état sauvegardé présent, ou tâche relancée
 *    depuis l'historique).
 * 2. Lien touché AVANT que React soit prêt (tâche encore là, processus
 *    arrêté). Android le remet par onNewIntent, qu'Expo ignore tant que
 *    l'application n'est pas chargée : le lien serait perdu. On le garde comme
 *    intent courant ; getInitialURL() le lira.
 *
 * Côté JavaScript, src/hooks/use-activation-link.ts traite donc tout lien
 * reçu comme une intention, sans filtre.
 */
const { withMainActivity } = require('expo/config-plugins')
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode')

const REPLAYED_LAUNCH = [
  '    // Lancement rejoué (tâche rouverte, processus relancé) : ce lien a déjà été traité.',
  '    if (savedInstanceState != null || (intent.flags and android.content.Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {',
  '      intent = android.content.Intent(intent).setData(null)',
  '    }',
].join('\n')

const NEW_INTENT = [
  '',
  '  // Lien touché avant que React soit prêt : gardé pour Linking.getInitialURL().',
  '  override fun onNewIntent(intent: android.content.Intent) {',
  '    setIntent(intent)',
  '    super.onNewIntent(intent)',
  '  }',
].join('\n')

// mergeContents lève une erreur si le repère manque (modèle Expo changé) et ne
// réécrit rien si le bloc est déjà à jour : le plugin peut être rejoué.
function patchMainActivity(source) {
  if (/fun onNewIntent\(/.test(source.replace(NEW_INTENT, ''))) {
    throw new Error('with-launch-link-intent : MainActivity définit déjà onNewIntent, fusion à faire à la main.')
  }
  // Avant super.onCreate : l'état sauvegardé est encore lisible, React pas encore démarré.
  const replayed = mergeContents({
    src: source,
    newSrc: REPLAYED_LAUNCH,
    tag: 'mojammaa-replayed-launch-link',
    anchor: /^\s*super\.onCreate\(null\)/m,
    offset: 0,
    comment: '//',
  })
  // Juste après onCreate : la première accolade fermante qui suit super.onCreate.
  const newIntent = mergeContents({
    src: replayed.contents,
    newSrc: NEW_INTENT,
    tag: 'mojammaa-pending-link-intent',
    anchor: /^\s*super\.onCreate\(null\)/m,
    offset: 2,
    comment: '//',
  })
  return newIntent.contents
}

module.exports = function withLaunchLinkIntent(config) {
  return withMainActivity(config, mod => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('with-launch-link-intent : MainActivity en Kotlin attendu.')
    }
    mod.modResults.contents = patchMainActivity(mod.modResults.contents)
    return mod
  })
}

module.exports.patchMainActivity = patchMainActivity
