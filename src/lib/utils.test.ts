import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn utility', () => {
  it('passes through a single class', () => {
    expect(cn('foo')).toBe('foo')
  })

  it('merges multiple classes', () => {
    expect(cn('px-2 py-1', 'mt-4')).toBe('px-2 py-1 mt-4')
  })

  it('deduplicates conflicting Tailwind classes (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles conditional classes via clsx syntax', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('handles undefined, null, and empty string inputs', () => {
    expect(cn('', undefined, null)).toBe('')
  })

  it('handles no arguments', () => {
    expect(cn()).toBe('')
  })
})
