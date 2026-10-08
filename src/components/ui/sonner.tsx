/*
 * Copyright (C) 2025-2026  Henrique Almeida
 * This file is part of WASudoku.
 *
 * WASudoku is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * WASudoku is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with WASudoku.  If not, see <https://www.gnu.org/licenses/>.
 */

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

const WIDE_QUERY = '(min-width: 768px)'
const FLOOR_SELECTOR = '[data-toast-floor]'
const SAFE_BOTTOM = 'calc(16px + env(safe-area-inset-bottom))'
const FLOOR_GAP = 12

const subscribeToWidth = (onChange: () => void) => {
  const query = globalThis.matchMedia(WIDE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const subscribeToLayout = (onChange: () => void) => {
  const resize = new ResizeObserver(onChange)
  resize.observe(document.body)
  globalThis.addEventListener('scroll', onChange, { passive: true })
  globalThis.addEventListener('resize', onChange)
  return () => {
    resize.disconnect()
    globalThis.removeEventListener('scroll', onChange)
    globalThis.removeEventListener('resize', onChange)
  }
}

/** Pixels of the viewport, counted up from its bottom edge, that a floor element covers. */
const readFloorLift = () => {
  const floor = document.querySelector(FLOOR_SELECTOR)
  if (!floor) return 0
  return Math.max(0, Math.ceil(globalThis.innerHeight - floor.getBoundingClientRect().top))
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()
  const isWide = useSyncExternalStore(
    subscribeToWidth,
    () => globalThis.matchMedia(WIDE_QUERY).matches,
    () => true,
  )
  // On a phone toasts go bottom-centre over the lower buttons, and move up above the steps panel as it scrolls in.
  const lift = useSyncExternalStore(
    subscribeToLayout,
    () => (isWide ? 0 : readFloorLift()),
    () => 0,
  )
  const bottom = lift > 0 ? `max(${SAFE_BOTTOM}, ${lift + FLOOR_GAP}px)` : SAFE_BOTTOM
  const phoneOffset = isWide ? undefined : { bottom }

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position={isWide ? 'bottom-right' : 'bottom-center'}
      offset={phoneOffset}
      mobileOffset={phoneOffset}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
