# Hermes Workspace landing page brief

## Audience
- Developers and operators who want a polished, native-feeling UI for running Hermes Agent day to day.
- Existing Hermes Agent users who need a stronger front door than an immediate redirect into chat.
- Mobile and desktop users installing the workspace as a PWA while the native desktop app is still in progress.

## Core messaging
- Hermes Workspace is the native-feeling command center for Hermes Agent.
- It is more than a chat wrapper: chat, files, memory, skills, and terminal live in one workspace.
- The landing page should sell speed, mobile readiness, and the “installable app” experience without hiding that the actual work happens inside the workspace.

## Sections to include
1. Hero with concise value prop, Hermes Workspace + Hermes Agent copy, and primary CTA into `/chat`.
2. Product proof section summarizing key capabilities already highlighted in the README: chat, files, memory, skills, terminal, mobile-first PWA.
3. Native experience section focused on installable app feel across desktop and mobile.
4. Backend compatibility / setup trust section that explains the Hermes Agent WebAPI connection in one tight block.
5. Secondary CTA/footer area pointing users into the workspace and docs.

## Concrete file targets
- `src/routes/index.tsx` — replace the redirect-only route with the landing page.
- Likely keep implementation self-contained in this route unless a section becomes too large.
- Reuse existing design tokens / utility classes already used elsewhere in the app instead of introducing a parallel design language.
- Optional small helper extraction only if needed for readability, but avoid broad component churn.

## Notes on preserving existing workspace entry points
- Keep the primary CTA and any fallback link pointing to `/chat` so the existing workspace entry remains obvious.
- Do not break direct navigation to `/chat`; the landing page only changes what `/` shows.
- Keep the copy implementation-oriented and lightweight so the route remains fast and easy to maintain.
- Prioritize responsive layout because the native pitch matters most on phone-sized screens.
