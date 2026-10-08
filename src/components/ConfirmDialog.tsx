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

import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ConfirmDialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly title: string
  readonly description: ReactNode
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly onConfirm: () => void
  readonly destructive?: boolean
}

/** A modal where the player confirms an action that discards or reveals something. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onClose()
    onConfirm()
  }

  return (
    // Without a trigger the dialog only ever asks to close.
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{cancelLabel}</Button>
          </DialogClose>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
