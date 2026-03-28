// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())

describe('directory skeleton', () => {
  const requiredDirs = [
    'src/game/ecs',
    'src/game/scenes',
    'src/game/systems',
    'src/game/procgen',
    'src/stores',
    'src/types',
    'public/assets/sprites',
    'public/assets/tilemaps/tilesets',
    'public/assets/audio/sfx',
    'public/assets/audio/music',
  ]

  it.each(requiredDirs)('%s directory exists', (dir) => {
    const fullPath = resolve(root, dir)
    expect(existsSync(fullPath), `Expected directory: ${fullPath}`).toBe(true)
  })
})

describe('shadcn/ui components', () => {
  const requiredComponents = [
    'button',
    'card',
    'dialog',
    'sheet',
    'progress',
    'tooltip',
  ]

  it.each(requiredComponents)(
    'src/components/ui/%s.tsx exists',
    (component) => {
      const fullPath = resolve(root, `src/components/ui/${component}.tsx`)
      expect(existsSync(fullPath), `Expected file: ${fullPath}`).toBe(true)
    }
  )
})

describe('project files', () => {
  it('CLAUDE.md exists', () => {
    expect(existsSync(resolve(root, 'CLAUDE.md'))).toBe(true)
  })

  it('src/lib/utils.ts exists', () => {
    expect(existsSync(resolve(root, 'src/lib/utils.ts'))).toBe(true)
  })

  it('vercel.json exists', () => {
    expect(existsSync(resolve(root, 'vercel.json'))).toBe(true)
  })
})

describe('game dependencies', () => {
  let pkg: { dependencies: Record<string, string> }

  beforeAll(() => {
    const raw = readFileSync(resolve(root, 'package.json'), 'utf-8')
    pkg = JSON.parse(raw)
  })

  const requiredDeps = [
    'phaser',
    'zustand',
    'miniplex',
    'pathfinding',
    'seedrandom',
    'eventemitter3',
  ]

  it.each(requiredDeps)(
    '%s is listed in dependencies',
    (dep) => {
      expect(pkg.dependencies).toHaveProperty(dep)
    }
  )
})

describe('layout conventions', () => {
  let layoutSource: string

  beforeAll(() => {
    layoutSource = readFileSync(
      resolve(root, 'src/app/layout.tsx'),
      'utf-8'
    )
  })

  it('dark mode is the default on html element', () => {
    expect(layoutSource).toContain('dark')
    expect(layoutSource).toMatch(/<html[\s\S]*className=/)
  })

  it('TooltipProvider wraps the app at layout root', () => {
    expect(layoutSource).toContain('TooltipProvider')
    expect(layoutSource).toMatch(/<TooltipProvider>/)
  })
})
