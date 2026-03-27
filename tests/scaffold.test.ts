// @vitest-environment node
import { describe, expect, it } from 'vitest'
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
    expect(existsSync(resolve(root, dir))).toBe(true)
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
      expect(
        existsSync(resolve(root, `src/components/ui/${component}.tsx`))
      ).toBe(true)
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
})

describe('game dependencies', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(root, 'package.json'), 'utf-8')
  )

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
