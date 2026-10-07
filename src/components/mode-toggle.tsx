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

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { flushSync } from 'react-dom'

import { Button } from '@/components/ui/button'

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    const reduce = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!('startViewTransition' in document) || reduce) {
      setTheme(next)
      return
    }
    document.startViewTransition(() => {
      // next-themes sets the class in an effect, so set it here too or the new snapshot is still the old theme.
      const root = document.documentElement
      root.classList.add('theme-switching')
      root.classList.remove('light', 'dark')
      root.classList.add(next)
      root.style.colorScheme = next
      flushSync(() => setTheme(next))
      // Forcing layout settles every colour while transitions are held off, so none start afterwards.
      void root.offsetHeight
      root.classList.remove('theme-switching')
    })
  }

  return (
    <Button variant="ghost" size="icon-lg" onClick={toggleTheme}>
      <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-transform duration-200 motion-reduce:transition-none dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-transform duration-200 motion-reduce:transition-none dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
