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

'use client'

import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { toggleVariants } from '@/lib/cva'
import { cn } from '@/lib/utils'

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & { readonly indicator?: boolean }
>({
  size: 'default',
  variant: 'default',
})

type ToggleGroupProps = React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    /** Draws the pressed state as one sliding element under equal-width items. */
    readonly indicator?: boolean
  }

/** The position of the pressed item among the group's items, or -1 when none is pressed. */
function pressedIndex(children: React.ReactNode, value: unknown): number {
  const values = React.Children.toArray(children).map((child) =>
    React.isValidElement<{ value?: string }>(child) ? child.props.value : undefined,
  )
  return typeof value === 'string' ? values.indexOf(value) : -1
}

function ToggleGroup({
  className,
  variant,
  size,
  children,
  indicator = false,
  ...props
}: ToggleGroupProps) {
  const index = indicator ? pressedIndex(children, props.value) : -1
  const count = React.Children.count(children)

  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-indicator={indicator || undefined}
      className={cn(
        'group/toggle-group bg-muted dark:bg-background border-control-border flex w-fit items-center gap-[3px] rounded-md border p-[3px]',
        indicator && 'relative isolate',
        className,
      )}
      {...props}
    >
      {indicator && (
        <span
          aria-hidden
          data-slot="toggle-group-indicator"
          className="toggle-indicator"
          data-hidden={index < 0 || undefined}
          style={
            { '--item-index': Math.max(index, 0), '--item-count': count } as React.CSSProperties
          }
        />
      )}
      <ToggleGroupContext.Provider value={{ variant, size, indicator }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        'min-w-0 flex-1 shrink-0 focus:z-10 focus-visible:z-10',
        // The sliding indicator draws the pressed background. The item draws none.
        context.indicator &&
          'data-[state=on]:bg-transparent data-[state=on]:shadow-none dark:data-[state=on]:bg-transparent',
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
