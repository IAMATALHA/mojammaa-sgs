/**
 * Combinaisons déterministes de prénoms/noms marocains courants.
 * Ce sont des identités fictives : aucun fichier élève, contact, date de
 * naissance ou identifiant officiel n'est utilisé comme source.
 */

const FAMILY = [
  ['العلوي', 'Alaoui'], ['الإدريسي', 'Idrissi'], ['بنعلي', 'Benali'], ['العمراني', 'Amrani'],
  ['الفاسي', 'Fassi'], ['بنجلون', 'Benjelloun'], ['الشرقاوي', 'Charkaoui'], ['الحسني', 'Hassani'],
  ['المنصوري', 'Mansouri'], ['بناني', 'Bennani'], ['التازي', 'Tazi'], ['الصقلي', 'Sekkali'],
  ['بركة', 'Baraka'], ['الزيتوني', 'Zaitouni'], ['القباج', 'Kabbaj'], ['الوزاني', 'Ouazzani'],
  ['بلحاج', 'Belhaj'], ['الرامي', 'Rami'], ['السباعي', 'Sbai'], ['المرابط', 'Marabet'],
  ['الناصري', 'Naciri'], ['بنكيران', 'Benkirane'], ['الخطيب', 'Khatib'], ['العماري', 'Ammari'],
  ['الجامعي', 'Jamai'], ['بوزيد', 'Bouzid'], ['الحلوي', 'Halwi'], ['الركراكي', 'Regragui'],
  ['الزروالي', 'Zerouali'], ['بوعزة', 'Bouazza'],
]

const GIVEN = [
  ['محمد', 'Mohamed'], ['أحمد', 'Ahmed'], ['يوسف', 'Youssef'], ['عمر', 'Omar'],
  ['حمزة', 'Hamza'], ['ياسين', 'Yassine'], ['أيوب', 'Ayoub'], ['آدم', 'Adam'],
  ['ريان', 'Rayan'], ['مهدي', 'Mehdi'], ['أمين', 'Amine'], ['بلال', 'Bilal'],
  ['إلياس', 'Ilyas'], ['سفيان', 'Soufiane'], ['مروان', 'Marwane'], ['أسامة', 'Oussama'],
  ['وليد', 'Walid'], ['كريم', 'Karim'], ['زكرياء', 'Zakaria'], ['نبيل', 'Nabil'],
  ['فاطمة', 'Fatima'], ['مريم', 'Mariam'], ['خديجة', 'Khadija'], ['عائشة', 'Aicha'],
  ['زينب', 'Zineb'], ['سارة', 'Sara'], ['هاجر', 'Hajar'], ['سلمى', 'Salma'],
  ['إيمان', 'Imane'], ['أسماء', 'Asmae'], ['ملاك', 'Malak'], ['يسرى', 'Yousra'],
  ['رانيا', 'Rania'], ['هند', 'Hind'], ['نادية', 'Nadia'], ['سميرة', 'Samira'],
  ['كريمة', 'Karima'], ['ليلى', 'Leila'], ['إنصاف', 'Insaf'], ['نور', 'Nour'],
]

function syntheticMoroccanName(index, salt = 0) {
  if (!Number.isInteger(index) || index < 0) throw new Error('Index de nom invalide')
  const given = GIVEN[(index + salt * 7) % GIVEN.length]
  const family = FAMILY[(index * 11 + salt * 13) % FAMILY.length]
  return {
    prenom: given[0],
    prenomLatin: given[1],
    nom: family[0],
    nomLatin: family[1],
    nomComplet: `${family[0]} ${given[0]}`,
  }
}

module.exports = { FAMILY, GIVEN, syntheticMoroccanName }
