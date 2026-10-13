import type { Step } from 'react-joyride'

export const tourSteps: Array<Step> = [
  // Step 1: Welcome
  {
    target: 'body',
    placement: 'center',
    title: 'Добро пожаловать в AWG GPT!',
    content: (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <img
          src="/claude-avatar.webp"
          alt="AWG GPT"
          style={{ width: 48, height: 48, borderRadius: 12 }}
        />
        <p style={{ textAlign: 'center', margin: 0 }}>
          Your AI-powered command center for managing agents, chats, files, and
          more. Let&apos;s take a quick tour!
        </p>
      </div>
    ),
    disableBeacon: true,
  },
  // Step 2: Sidebar
  {
    target: '[data-tour="sidebar-container"]',
    placement: 'right',
    title: 'Боковая навигация',
    content:
      'Здесь можно переключаться между всеми инструментами. Сворачивайте и разворачивайте разделы под себя.',
  },
  // Step 3: New Session
  {
    target: '[data-tour="new-session"]',
    placement: 'right',
    title: 'Начать новый чат',
    content:
      'Нажмите здесь, чтобы начать новый чат с ИИ. Каждый диалог сохраняется автоматически.',
  },
  // Step 4: Dashboard
  {
    target: '[data-tour="dashboard"]',
    placement: 'right',
    title: 'Ваша панель',
    content:
      'Обзор сессий, использования и активности. Всё на одном экране.',
  },
  // Step 5: Agent Hub
  {
    target: '[data-tour="agent-hub"]',
    placement: 'right',
    title: 'Центр агентов',
    content:
      'Управляйте ИИ-агентами и их настройками. Создавайте своих агентов с особым поведением.',
  },
  // Step 7: Skills
  {
    target: '[data-tour="skills"]',
    placement: 'right',
    title: 'Библиотека навыков',
    content:
      'Просматривайте и устанавливайте навыки, чтобы расширить возможности агентов.',
  },
  // Step 8: Terminal
  {
    target: '[data-tour="terminal"]',
    placement: 'right',
    title: 'Встроенный терминал',
    content:
      'Встроенный терминал для быстрых команд. Выполняйте команды, не выходя из AWG GPT.',
  },
  // Step 9: Usage Meter (in header)
  {
    target: '[data-tour="usage-meter"]',
    placement: 'bottom',
    title: 'Монитор использования',
    content:
      'Следите за использованием ИИ-провайдеров в реальном времени: затраты и расход API.',
  },
  // Step 10: Settings
  {
    target: '[data-tour="settings"]',
    placement: 'right',
    title: 'Настройки и персонализация',
    content:
      'Configure providers, themes, accent colors, and more. Make AWG GPT yours.',
  },
  // Step 11: Finish
  {
    target: 'body',
    placement: 'center',
    title: "Всё готово! 🎉",
    content:
      'Начните общение с ИИ, изучите инструменты и настройте AWG GPT под свою работу. Нужна помощь? Нажмите ?, чтобы увидеть все горячие клавиши.',
  },
]
