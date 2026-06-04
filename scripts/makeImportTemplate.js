/**
 * Génère un modèle Excel (template) pour saisir manuellement :
 *   - Enseignants (profs)
 *   - Élèves
 *   - Parents
 *
 * Les en-têtes correspondent EXACTEMENT aux champs de la base Firestore.
 * Tu remplis le fichier, puis un script d'import lira chaque feuille.
 *
 * Usage : node scripts/makeImportTemplate.js
 * Sortie : mojammaa_import_template.xlsx (racine du projet)
 */

const XLSX = require('xlsx')
const path = require('path')

const wb = XLSX.utils.book_new()

// ── Feuille Instructions ───────────────────────────────────────────────
const instructions = [
  ['MODÈLE D’IMPORT — Mojammaa SGS'],
  [''],
  ['Remplis chaque feuille puis envoie-le-moi pour import dans la base.'],
  [''],
  ['ORDRE D’IMPORT (important) :'],
  ['  1) Élèves   — à importer EN PREMIER (les parents s’y rattachent)'],
  ['  2) Parents  — se lient aux élèves via le codeMassar'],
  ['  3) Enseignants — indépendant, peut se faire à tout moment'],
  [''],
  ['RÈGLES GÉNÉRALES :'],
  ['  • Ne change PAS la ligne d’en-tête (ligne 1 de chaque feuille).'],
  ['  • Supprime les lignes "EXEMPLE" avant de me renvoyer le fichier.'],
  ['  • Une ligne = une personne.'],
  ['  • Colonnes "classes"/"enfants" multiples : séparer par une virgule.'],
  ['  • Dates au format AAAA-MM-JJ (ex : 2011-09-15).'],
  ['  • password : laisser VIDE = mot de passe par défaut "<email>1234".'],
  [''],
  ['FEUILLE "Enseignants" :'],
  ['  email, password(optionnel), nom, prenom, matiere,'],
  ['  cycle (primaire | college), classes (ex: 3APIC-1,3APIC-2)'],
  [''],
  ['FEUILLE "Eleves" :'],
  ['  codeMassar (identifiant unique, ex: A171010188), nom (arabe),'],
  ['  prenom (arabe), nomLatin, prenomLatin, classe (ex: 3APIC-1),'],
  ['  niveau (ex: 3APIC), dateNaissance (AAAA-MM-JJ)'],
  ['  → nomComplet est généré automatiquement (nom + prenom).'],
  [''],
  ['FEUILLE "Parents" :'],
  ['  email, password(optionnel), nom, prenom,'],
  ['  enfants_codeMassar (codes MASSAR des enfants, séparés par virgule)'],
]
const wsI = XLSX.utils.aoa_to_sheet(instructions)
wsI['!cols'] = [{ wch: 70 }]
XLSX.utils.book_append_sheet(wb, wsI, 'Instructions')

// ── Feuille Enseignants ────────────────────────────────────────────────
const teachers = [
  ['email', 'password', 'nom', 'prenom', 'matiere', 'cycle', 'classes'],
  ['EXEMPLE prof@gmail.com', '', 'Elguennouni', 'Abdossalam', 'Mathématiques', 'college', '3APIC-1,3APIC-2,3APIC-3'],
]
const wsT = XLSX.utils.aoa_to_sheet(teachers)
wsT['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 28 }]
XLSX.utils.book_append_sheet(wb, wsT, 'Enseignants')

// ── Feuille Eleves ─────────────────────────────────────────────────────
const students = [
  ['codeMassar', 'nom', 'prenom', 'nomLatin', 'prenomLatin', 'classe', 'niveau', 'dateNaissance'],
  ['EXEMPLE A171010188', 'الإدريسي', 'محمد', 'Idrissi', 'Mohamed', '3APIC-1', '3APIC', '2011-09-15'],
]
const wsS = XLSX.utils.aoa_to_sheet(students)
wsS['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 }]
XLSX.utils.book_append_sheet(wb, wsS, 'Eleves')

// ── Feuille Parents ────────────────────────────────────────────────────
const parents = [
  ['email', 'password', 'nom', 'prenom', 'enfants_codeMassar'],
  ['EXEMPLE parent@gmail.com', '', 'Idrissi', 'Karim', 'A171010188,A171079515'],
]
const wsP = XLSX.utils.aoa_to_sheet(parents)
wsP['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 30 }]
XLSX.utils.book_append_sheet(wb, wsP, 'Parents')

const out = path.join(__dirname, '..', 'mojammaa_import_template.xlsx')
XLSX.writeFile(wb, out)
console.log('✅ Modèle créé :', out)
console.log('   Feuilles : Instructions, Enseignants, Eleves, Parents')
