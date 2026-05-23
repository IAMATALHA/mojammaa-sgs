/**
 * Script de secours : Réinitialiser le mot de passe d'un utilisateur
 * et s'assurer qu'il a le rôle "admin".
 */
const admin = require('firebase-admin');

// 1. Mets le chemin vers ton fichier serviceAccountKey.json ici
// const serviceAccount = require('./serviceAccountKey.json');
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });

const auth = admin.auth();
const db = admin.firestore();

async function resetAdminPassword() {
  const adminEmail = 'admin@mojammaa.com'; // REMPLACE PAR L'EMAIL DE TON ADMIN
  const newPassword = 'Password123!';      // LE NOUVEAU MOT DE PASSE QUE TU VEUX

  try {
    // 1. Trouver l'utilisateur par email
    const userRecord = await auth.getUserByEmail(adminEmail);
    console.log(`Utilisateur trouvé : ${userRecord.uid}`);

    // 2. Changer son mot de passe
    await auth.updateUser(userRecord.uid, {
      password: newPassword,
    });
    console.log(`Mot de passe mis à jour avec succès pour ${adminEmail}`);

    // 3. S'assurer qu'il a le rôle "admin" dans Firestore
    await db.collection('users').doc(userRecord.uid).set({
      role: 'admin',
      email: adminEmail
    }, { merge: true });
    
    console.log(`Le rôle 'admin' a bien été sécurisé dans Firestore pour cet utilisateur.`);

  } catch (error) {
    console.error("Erreur lors de la réinitialisation :", error);
  }
}

// resetAdminPassword();
