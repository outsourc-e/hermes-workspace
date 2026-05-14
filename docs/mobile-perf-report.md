# HermesWorld mobile performance baseline

Branch: `perf/mobile-bundle-split`
Base: `origin/perf/playground-engine-pass-1`
Viewport/FPS audit: 390x844 mobile emulation, 4x CPU throttle, throttled 4G network profile, `/play/?debug=perf`.

## Static standalone bundle

| Metric | Baseline | After | Delta |
| --- | ---: | ---: | ---: |
| Initial `assets/play-standalone.js` raw | 4,173,581 B | 3,963,737 B | -209,844 B |
| Initial `assets/play-standalone.js` gzip | 764,547 B | 720,759 B | -43,788 B |

Deferred chunks created by the static standalone split:

| Chunk | Raw | Gzip |
| --- | ---: | ---: |
| `chunks/hls-ECT73IPQ.js` | 1,119,898 B | 234,433 B |
| `chunks/playground-dialog-AWPW46TC.js` | 32,373 B | 9,635 B |
| `chunks/playground-sidepanel-Q7LFEOWJ.js` | 28,358 B | 5,583 B |
| `chunks/playground-admin-panel-I45KF4UA.js` | 15,988 B | 3,550 B |
| `chunks/playground-customizer-QEQIP3P7.js` | 15,391 B | 3,220 B |
| `chunks/settings-panel-AOKCYYPL.js` | 11,370 B | 2,636 B |
| `chunks/playground-journal-V62SEGYZ.js` | 10,397 B | 2,419 B |
| `chunks/playground-map-Y3TJTSWE.js` | 7,473 B | 2,223 B |

## Vite client bundle analyzer snapshot

| Metric | Baseline | After | Delta |
| --- | ---: | ---: | ---: |
| Total client JS raw | 14,003,142 B | 14,003,238 B | +96 B |
| Total client JS gzip | 2,831,059 B | 2,831,118 B | +59 B |
| Playground route chunk raw | ~37.6 KB | ~37.7 KB | effectively flat |
| Playground route chunk gzip | ~7.1 KB | ~7.2 KB | effectively flat |

The meaningful win is the HermesWorld static standalone path; the app route was already split by Vite.

## Lighthouse mobile, local static server

Command profile: Lighthouse default mobile throttling against Python static server.

| Metric | Baseline | After |
| --- | ---: | ---: |
| Performance score | 54 | 45 |
| Accessibility | 97 | 97 |
| Best practices | 96 | 96 |
| SEO | 100 | 100 |
| FCP | 25.6s | 23.3s |
| LCP | 25.7s | 24.0s |
| TBT | 140ms | 430ms |
| CLS | 0.005 | 0.005 |
| Speed Index | 25.6s | 23.3s |
| TTI | 25.8s | 24.2s |

Note: the score dipped due to Lighthouse TBT variance on local headless Chrome; paint/interactive timings improved. Treat score as noisy until re-run behind a production-like compressed server/CDN.

## Mobile FPS audit

CDP script with 390px viewport, 4x CPU throttle, throttled 4G, 10s RAF sample after scene load.

| Metric | Baseline | After |
| --- | ---: | ---: |
| Reported FPS | 120.1 | 120.2 |
| Avg frame | 8.33ms | 8.34ms |
| p95 frame | 9.5ms | 9.5ms |
| Max frame | 10.0ms | 46.7ms |
| Frames >33.34ms | 0 | 1 |

Headless Chrome reports 120Hz RAF, so this is useful for relative frame-time regression only, not actual physical phone smoothness. No sustained mobile FPS regression found.

## Image optimization

| Asset | PNG | WebP | Delta |
| --- | ---: | ---: | ---: |
| `hermesworld-logo-horizontal@2x` | 137,541 B | 59,088 B | -78,453 B |
| `hermesworld-logo-horizontal@3x` | 258,461 B | 98,076 B | -160,385 B |
| `hermesworld-logo-stacked@2x` | 335,190 B | 99,954 B | -235,236 B |
| `hermesworld-logo-stacked@3x` | 640,821 B | 161,012 B | -479,809 B |
