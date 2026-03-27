import { expect, test } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Page from '@/app/page'

test('Home page renders heading and subtitle', () => {
  render(<Page />)
  expect(
    screen.getByRole('heading', { level: 1, name: 'Deadbolt' })
  ).toBeDefined()
  expect(screen.getByText('Zombie survival base builder')).toBeDefined()
  cleanup()
})
