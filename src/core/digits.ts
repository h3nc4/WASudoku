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

/** A sudoku digit. Empty cells hold no digit, so 0 is not one. */
export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

declare const cellIndexBrand: unique symbol

/** A cell position from 0 to 80, row by row. Only geometry and the codecs mint one. */
export type CellIndex = number & { readonly [cellIndexBrand]: true }

/** A set of digits as nine bits, bit 0 for the digit 1. */
export type Mask = number

export const MIN_DIGIT = 1
export const MAX_DIGIT = 9
export const EMPTY_MASK: Mask = 0
export const FULL_MASK: Mask = (1 << MAX_DIGIT) - 1

export const isDigit = (value: unknown): value is Digit =>
  Number.isInteger(value) && Number(value) >= MIN_DIGIT && Number(value) <= MAX_DIGIT

/** The digit a number names, or null for anything else, 0 included. */
export const toDigit = (value: number): Digit | null => (isDigit(value) ? value : null)

export const DIGITS: readonly Digit[] = Array.from({ length: MAX_DIGIT + 1 }, (_, i) => i).filter(
  isDigit,
)

const bit = (digit: Digit): number => 1 << (digit - MIN_DIGIT)

export const isMask = (value: unknown): value is Mask =>
  Number.isInteger(value) && Number(value) >= EMPTY_MASK && Number(value) <= FULL_MASK

export const hasDigit = (mask: Mask, digit: Digit): boolean => (mask & bit(digit)) !== 0
export const withDigit = (mask: Mask, digit: Digit): Mask => mask | bit(digit)
export const withoutDigit = (mask: Mask, digit: Digit): Mask => mask & ~bit(digit)
export const toggleDigit = (mask: Mask, digit: Digit): Mask => mask ^ bit(digit)

export const maskOf = (digits: Iterable<Digit>): Mask => {
  let mask = EMPTY_MASK
  for (const digit of digits) mask = withDigit(mask, digit)
  return mask
}

/** The digits in a mask, in ascending order. */
export const digitsOf = (mask: Mask): Digit[] => DIGITS.filter((digit) => hasDigit(mask, digit))

export const maskSize = (mask: Mask): number => digitsOf(mask).length
