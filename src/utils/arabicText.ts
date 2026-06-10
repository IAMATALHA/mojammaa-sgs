/**
 * arabicText — rendu correct du contenu UTILISATEUR en arabe alors que le
 * layout global reste LTR (RTL complet = phase ultérieure, cf. i18n/index).
 *
 *  - isArabicText : détecte si le PREMIER caractère directionnel fort est
 *    arabe (un texte « Rappel : غدا عطلة » reste LTR, « غدا عطلة » passe RTL).
 *  - dirStyle : style Text/TextInput à étaler ({ writingDirection, textAlign })
 *    quand le contenu est arabe ; undefined sinon (aucun impact).
 *  - localizedSubject/Body : version arabe d'un message (subjectAr/bodyAr)
 *    quand l'app est en arabe et qu'elle existe.
 */
import type { TextStyle } from 'react-native'

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const LATIN  = /[A-Za-zÀ-ɏ]/

export function isArabicText(s?: string | null): boolean {
  if (!s) return false
  for (const ch of s) {
    if (LATIN.test(ch)) return false
    if (ARABIC.test(ch)) return true
  }
  return false
}

export function dirStyle(s?: string | null): TextStyle | undefined {
  return isArabicText(s) ? { writingDirection: 'rtl', textAlign: 'right' } : undefined
}

interface BilingualMessage {
  subject?:   string
  body?:      string
  subjectAr?: string
  bodyAr?:    string
}

export function localizedSubject(msg: BilingualMessage, lang: string): string {
  return (lang === 'ar' && msg.subjectAr) ? msg.subjectAr : (msg.subject || '')
}

export function localizedBody(msg: BilingualMessage, lang: string): string {
  return (lang === 'ar' && msg.bodyAr) ? msg.bodyAr : (msg.body || '')
}
