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

import { describe, expect, it } from 'vitest'

import {
  DIGITS,
  digitsOf,
  EMPTY_MASK,
  FULL_MASK,
  hasDigit,
  isDigit,
  isMask,
  maskOf,
  maskSize,
  toDigit,
  toggleDigit,
  withDigit,
  withoutDigit,
} from './digits'

describe('digits', () => {
  it('lists the nine digits in order', () => {
    expect(DIGITS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it.each([1, 5, 9])('accepts %i', (value) => {
    expect(isDigit(value)).toBe(true)
    expect(toDigit(value)).toBe(value)
  })

  it.each([0, 10, -1, 1.5, Number.NaN])('rejects %d', (value) => {
    expect(isDigit(value)).toBe(false)
    expect(toDigit(value)).toBeNull()
  })

  it('rejects a digit that is not a number', () => {
    expect(isDigit('5')).toBe(false)
  })
})

describe('masks', () => {
  it('holds the digits it was built from', () => {
    const mask = maskOf([1, 3, 9])
    expect(mask).toBe(0b100000101)
    expect(digitsOf(mask)).toEqual([1, 3, 9])
    expect(maskSize(mask)).toBe(3)
    expect(hasDigit(mask, 3)).toBe(true)
    expect(hasDigit(mask, 2)).toBe(false)
  })

  it('adds, removes and toggles one digit', () => {
    expect(withDigit(EMPTY_MASK, 4)).toBe(maskOf([4]))
    expect(withDigit(maskOf([4]), 4)).toBe(maskOf([4]))
    expect(withoutDigit(maskOf([4, 5]), 4)).toBe(maskOf([5]))
    expect(withoutDigit(maskOf([5]), 4)).toBe(maskOf([5]))
    expect(toggleDigit(maskOf([5]), 4)).toBe(maskOf([4, 5]))
    expect(toggleDigit(maskOf([4, 5]), 4)).toBe(maskOf([5]))
  })

  it('fills nine bits when full', () => {
    expect(maskOf(DIGITS)).toBe(FULL_MASK)
    expect(FULL_MASK).toBe(0b111111111)
  })

  it.each([
    [EMPTY_MASK, true],
    [FULL_MASK, true],
    [FULL_MASK + 1, false],
    [-1, false],
    [0.5, false],
    ['3', false],
  ])('reads %j as a mask: %s', (value, expected) => {
    expect(isMask(value)).toBe(expected)
  })
})
