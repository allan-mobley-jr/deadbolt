# Lighthouse Baseline

Recorded 2026-04-01 using Lighthouse 13.0.3 (headless Chrome) against local production build.

## Landing Page (`/`)

| Category | Score |
|----------|-------|
| Performance | 93 |
| Accessibility | 94 |
| Best Practices | 100 |
| SEO | 100 |

### Key Metrics

| Metric | Value |
|--------|-------|
| First Contentful Paint (FCP) | 0.8 s |
| Largest Contentful Paint (LCP) | 3.2 s |
| Total Blocking Time (TBT) | 30 ms |
| Cumulative Layout Shift (CLS) | 0.043 |
| Speed Index (SI) | 0.8 s |

### Notes

Landing page is a static Server Component with a single client island (LandingStats). No Phaser code loads. Performance is strong across all metrics.

## Game Page (`/play`)

| Category | Score |
|----------|-------|
| Performance | 56 |
| Accessibility | 86 |
| Best Practices | 100 |
| SEO | 100 |

### Key Metrics

| Metric | Value |
|--------|-------|
| First Contentful Paint (FCP) | 0.8 s |
| Largest Contentful Paint (LCP) | 2.9 s |
| Total Blocking Time (TBT) | 20,670 ms |
| Cumulative Layout Shift (CLS) | 0 |
| Speed Index (SI) | 9.0 s |

### Notes

The low performance score is dominated by Total Blocking Time (20.7s). This is expected: Phaser initializes synchronously and runs the full world generation pipeline (WFC city layout, BSP interiors, object placement, pathfinding grid) on the main thread. The game shows a loading screen during this time.

**This is inherent to the game architecture, not a regression.** The loading scene already runs generation one step per frame to keep the UI responsive, but the cumulative work still blocks the main thread significantly.

Future optimization opportunities:
- Move world generation to a Web Worker
- Implement progressive loading with visual feedback
- Split heavy generation steps across multiple frames

## How to Re-Run

```bash
pnpm build && pnpm start
# In a separate terminal:
npx lighthouse http://localhost:3000 --chrome-flags="--headless --no-sandbox" --output=html --output-path=docs/lighthouse-landing.html
npx lighthouse http://localhost:3000/play --chrome-flags="--headless --no-sandbox" --output=html --output-path=docs/lighthouse-play.html
```
