# AWG GPT — брендирование форка

Форк `outsourc-e/hermes-workspace` с брендингом AWG GPT. Ветка: `feat/awg-gpt-branding`.
Движок (`src/server`, `src/routes/api`, переменные `HERMES_*`, пути `~/.hermes`) не менялся.

## Что изменено
- Название «Hermes Workspace» / «Hermes Agent» → «AWG GPT» в интерфейсе, заголовках, manifest, мета-тегах.
- Логотипы и иконки AWG из `awg-llm/static/static` (`public/awg-logo*.svg`, `favicon*`, `apple-touch-icon.png`, PWA-иконки). Файлы `public/claude-*`, `logo-icon.*`, `cover.png`, `social-preview.png` пересобраны из логотипа AWG.
- Темы `claude-nous` (тёмная, «AWG») и `claude-nous-light` («AWG Light») перекрашены в палитру AWG: `#7657c7` / `#b79cff`, фон `#141316`, поверхности `#19171d`.
- Шрифт Inter по умолчанию, язык интерфейса по умолчанию — русский (`src/lib/i18n.ts`), `<html lang="ru">`.
- Индиго-акценты (`indigo-*`) заменены на фиолетовый AWG.

## Сделано дополнительно
- Вырезана функция подключения мобильного устройства (`src/components/mobile-prompt/*`, триггер в `__root.tsx`, подсказка Tailscale в настройках).
- Язык по умолчанию — русский (`getLocale()` → `ru`).
- Тесты, проверяющие английские тексты, обновлены; число падающих тестов совпадает с базовым (34, существовали до изменений).

## Не сделано
- Перевод на русский охватывает основной интерфейс (~2300 строк). Остаются технические термины, названия провайдеров/моделей, описания ролей воркеров из `swarm.yaml`, серверные сообщения и часть редких всплывающих текстов.
- Раздел HermesWorld / playground / agora — оставлен как есть (бренд Hermes внутри игровых экранов).
- Остальные темы (Matrix, Bronze, Slate, SciFi, Navy) не перекрашивались.

## Синхронизация с upstream
`git fetch upstream && git merge upstream/main` — возможны конфликты в файлах с заменой названий.
