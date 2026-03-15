# ClawSuite Full App Audit — 2026-03-14
_Audited by Aurora at 248 commits ahead of origin_

## Dashboard
- [x] Desktop: clean, professional, good data density
- [ ] Mobile: sidebar doesn't collapse (shows 20+ nav items on small screens)
- [ ] Bottom metrics cards (Sessions, Agents, Cost, Messages) don't reflow on mobile
- [ ] "Syncing" badge could use a subtle pulse animation
- [ ] Weather widget (46°) is cute but not enterprise — consider hiding in compact mode

## Agent Hub
- [ ] "Coffee" and "Water" break room decorations — unprofessional for enterprise
- [ ] "Offline" badges on empty desks are too prominent
- [ ] Usage & Cost shows "—" for empty data — needs "No data yet" fallback
- [ ] "No missions yet" empty state is weak — needs onboarding guidance

## Chat
- [x] Chat composer looks clean
- [x] Message rendering is solid
- [ ] Auto-Compaction Warning modal is useful but blocks entire view — could be a banner instead
- [ ] Agent Hub panel on right side could show more useful info (current task, last output)

## Workspace (DONE — 25 commits today)
- [x] Project cards: truncated paths, compact agents, timestamps, hover elevation
- [x] Review queue: compact cards, risk borders, verification badges, keyboard shortcuts
- [x] Project detail: sidebar nav, policies/health/git cards, no duplicate header
- [x] Mission console: responsive, breadcrumbs, live terminals
- [x] Skills: markdown rendering
- [x] Teams: dynamic tiers (was already built)
- [x] Empty states with onboarding
- [x] Notification bell
- [x] Command palette workspace shortcuts
- [x] ? keyboard shortcut modal
- [x] Standalone CLI + API docs

## Settings
- [ ] Not audited yet — need to check provider config, model settings

## Files / Memory / Debug
- [ ] Not audited yet — lower priority screens

## Cross-Cutting Issues
- [ ] Sidebar has 20+ items — needs grouping or collapsible sections
- [ ] No consistent loading skeleton across ALL screens
- [ ] Dark mode: workspace screens use hardcoded bg-white
- [ ] Mobile: several screens don't properly hide desktop-only elements

## Priority Order
1. Sidebar simplification (affects ALL screens)
2. Agent Hub cleanup (high visibility)
3. Dashboard mobile reflow
4. Dark mode consistency
5. Settings audit
</content>
</invoke>