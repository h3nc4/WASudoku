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

import { cva } from 'class-variance-authority'

const paperButton =
  'rounded-md border-control-border bg-paper text-foreground not-disabled:hover:border-ink/60 not-disabled:hover:bg-accent'

// Primary, secondary and quiet actions differ in radius and weight as well as colour.
// Disabled turns every variant into a dashed outline on paper, a change of shape rather than a fade.
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 ease-out not-disabled:active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 border border-transparent disabled:cursor-not-allowed disabled:border-dashed disabled:border-control-border disabled:text-disabled-foreground disabled:shadow-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'rounded-[4px] bg-primary text-primary-foreground font-semibold shadow-[0_1px_0_rgb(0_0_0/0.18)] not-disabled:hover:bg-primary/88 disabled:bg-paper',
        destructive:
          'rounded-[4px] bg-destructive text-primary-foreground font-semibold shadow-[0_1px_0_rgb(0_0_0/0.18)] not-disabled:hover:bg-destructive/88 disabled:bg-paper focus-visible:ring-destructive',
        outline: paperButton,
        secondary: paperButton,
        ghost:
          'rounded-md text-muted-foreground not-disabled:hover:bg-accent not-disabled:hover:text-foreground',
        link: 'text-ink underline-offset-4 not-disabled:hover:underline disabled:border-transparent',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

// Segments sit in a muted track, and the active one lifts onto paper in a heavier weight.
export const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[4px] border border-transparent text-sm font-normal text-foreground not-disabled:hover:bg-paper/60 disabled:cursor-not-allowed disabled:border-dashed disabled:border-control-border disabled:text-disabled-foreground data-[state=on]:font-semibold data-[state=on]:bg-paper dark:data-[state=on]:bg-accent data-[state=on]:not-disabled:text-ink data-[state=on]:shadow-[0_1px_2px_rgb(0_0_0/0.14),0_0_0_1px_var(--border)] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:ring-2 focus-visible:ring-ring outline-none transition-[color,background-color,box-shadow] duration-150 motion-reduce:transition-none aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent hover:bg-accent',
      },
      size: {
        default: 'h-8 px-2 min-w-9',
        sm: 'h-7 px-1.5 min-w-8',
        lg: 'h-9 px-2.5 min-w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
