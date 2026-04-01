# Lighthouse Baseline

## Latest Audit (2026-04-01, post-M6 optimizations)

Recorded using Lighthouse 13.0.3 (headless Chrome) against local production build.

### Landing Page (`/`)

| Category | Score |
|----------|-------|
| Performance | 95 |
| Accessibility | 94 |
| Best Practices | 100 |
| SEO | 100 |

| Metric | Value |
|--------|-------|
| First Contentful Paint (FCP) | 0.8 s |
| Largest Contentful Paint (LCP) | 3.0 s |
| Total Blocking Time (TBT) | 20 ms |
| Cumulative Layout Shift (CLS) | 0.043 |
| Speed Index (SI) | 0.8 s |

### Game Page (`/play`)

| Category | Score |
|----------|-------|
| Performance | 58 |
| Accessibility | 86 |
| Best Practices | 100 |
| SEO | 100 |

| Metric | Value |
|--------|-------|
| First Contentful Paint (FCP) | 0.8 s |
| Largest Contentful Paint (LCP) | 2.9 s |
| Total Blocking Time (TBT) | 14,940 ms |
| Cumulative Layout Shift (CLS) | 0 |
| Speed Index (SI) | 7.1 s |

### Notes

The play page's low performance score is dominated by Total Blocking Time (14.9s). This is expected: Phaser initializes synchronously and runs the full world generation pipeline (WFC city layout, BSP interiors, object placement, pathfinding grid) on the main thread. The loading scene runs generation one step per frame.

TBT improved from 20.7s (initial baseline) to 14.9s after entity pooling (pre-warmed bodies avoid allocation during gameplay) and pathfinding optimization (flow field replaces individual A* for safehouse-targeting zombies).

## Score History

| Date | Page | Perf | A11y | BP | SEO | Notes |
|------|------|------|------|----|-----|-------|
| 2026-04-01 | `/` | 93 | 94 | 100 | 100 | Initial baseline |
| 2026-04-01 | `/play` | 56 | 86 | 100 | 100 | Initial baseline |
| 2026-04-01 | `/` | 95 | 94 | 100 | 100 | Post-M6: OG image, meta tags, entity pooling, pathfinding opt |
| 2026-04-01 | `/play` | 58 | 86 | 100 | 100 | Post-M6: TBT improved 20.7s → 14.9s |

## How to Re-Run

```bash
pnpm build && pnpm start
# In a separate terminal:
npx lighthouse http://localhost:3000 --chrome-flags="--headless --no-sandbox" --output=html --output-path=docs/lighthouse-landing.html
npx lighthouse http://localhost:3000/play --chrome-flags="--headless --no-sandbox" --output=html --output-path=docs/lighthouse-play.html
```
