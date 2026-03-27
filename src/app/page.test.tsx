import { expect, test, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Page from '@/app/page'

afterEach(cleanup)

test('Home page renders heading and subtitle', () => {
  render(<Page />)
  expect(
    screen.getByRole('heading', { level: 1, name: 'Deadbolt' })
  ).toBeInTheDocument()
  expect(screen.getByText('Zombie survival base builder')).toBeInTheDocument()
})
