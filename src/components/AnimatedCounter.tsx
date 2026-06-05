/**
 * AnimatedCounter — un nombre qui « monte » de 0 → valeur cible (easeOutCubic).
 * Rend un <Text> standard : il hérite du style parent et peut être imbriqué
 * dans un autre <Text> (ex: pour garder un suffixe stylé à côté).
 *
 * Usage :
 *   <Text style={bigStyle}><AnimatedCounter value={42} /><Text>%</Text></Text>
 */
import React, { useEffect, useRef, useState } from 'react'
import { Text, type TextProps } from 'react-native'

interface Props extends TextProps {
  value:     number
  duration?: number   // ms, défaut 800
  decimals?: number   // chiffres après la virgule, défaut 0
}

export default function AnimatedCounter({ value, duration = 800, decimals = 0, ...textProps }: Props) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const delta = value - from
    if (delta === 0) { setDisplay(value); return }
    const start = Date.now()
    let raf = 0
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(from + delta * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else { setDisplay(value); fromRef.current = value }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  const shown = decimals > 0 ? display.toFixed(decimals) : String(Math.round(display))
  return <Text {...textProps}>{shown}</Text>
}
