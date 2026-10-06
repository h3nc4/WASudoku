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

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog component', () => {
  const renderDialog = (props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Do it?"
        description="It cannot be undone."
        confirmLabel="Do it"
        onConfirm={onConfirm}
        {...props}
      />,
    )
    return { onOpenChange, onConfirm }
  }

  it('closes and confirms', async () => {
    const user = userEvent.setup()
    const { onOpenChange, onConfirm } = renderDialog()
    expect(screen.getByRole('dialog', { name: 'Do it?' })).toHaveAccessibleDescription(
      'It cannot be undone.',
    )
    await user.click(screen.getByRole('button', { name: 'Do it' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('cancels without confirming, using a custom label', async () => {
    const user = userEvent.setup()
    const { onOpenChange, onConfirm } = renderDialog({ cancelLabel: 'Keep' })
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('styles a destructive confirmation', () => {
    renderDialog({ destructive: true })
    expect(screen.getByRole('button', { name: 'Do it' })).toHaveClass('bg-destructive')
  })

  it('renders nothing while closed', () => {
    renderDialog({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
