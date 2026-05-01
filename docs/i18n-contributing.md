# Contributing UI translations

Hermes Workspace currently uses a lightweight translation map for the UI strings that have been wired for localization.

## Translation file

Translations live in:

```text
src/lib/i18n.ts
```

The important pieces are:

- `EN`: the source English keys.
- `ZH`: Simplified Chinese translations.
- `RU`: Russian translations.
- `LOCALES`: maps language ids to translation maps.
- `LOCALE_LABELS`: labels shown in the language selector.

## Adding or improving Chinese translations

1. Open `src/lib/i18n.ts`.
2. Find the `ZH` object.
3. Update the value on the right side of each key.

Example:

```ts
const ZH: LocaleTranslations = {
  'nav.dashboard': '仪表板',
  'nav.chat': '聊天',
}
```

Keep the key names exactly the same. Only edit the translated text.

## Adding new translatable UI text

If you find hardcoded English UI text:

1. Add a new key to `EN`.
2. Add the same key to every locale map (`ZH`, `RU`, etc.).
3. Replace the hardcoded text in the component with `t('your.newKey')`.

Example:

```ts
// src/lib/i18n.ts
const EN = {
  'common.retry': 'Retry',
} as const

const ZH: LocaleTranslations = {
  'common.retry': '重试',
}
```

Then in the component:

```tsx
import { t } from '@/lib/i18n'

;<button>{t('common.retry')}</button>
```

## Testing locally

Run:

```bash
pnpm exec vitest run src/lib/i18n.test.ts
pnpm build
```

Then open Settings → Language and switch to the target language.

## Current limitation

Not every UI string has been migrated to the translation map yet. If text remains in English after switching languages, it likely means that component still has hardcoded text and needs to be wired to `t(...)` first.
