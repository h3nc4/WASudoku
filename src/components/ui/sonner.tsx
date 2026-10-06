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

const subscribeToWidth = (onChange: () => void) => {
  const query = globalThis.matchMedia(WIDE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()
  // On a phone the steps panel is below the board. Toasts go to the top there.
  const isWide = useSyncExternalStore(
    subscribeToWidth,
    () => globalThis.matchMedia(WIDE_QUERY).matches,
    () => true,
  )

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position={isWide ? 'bottom-right' : 'top-center'}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
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
