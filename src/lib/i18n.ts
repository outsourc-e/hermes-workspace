/**
 * Lightweight i18n — UI string translations for Hermes Workspace.
 * Add new languages by adding a locale map below.
 */

export type LocaleId =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'zh'
  | 'zh-TW'
  | 'ja'
  | 'ko'
  | 'pt'
  | 'ru'
  | 'ar'

const EN = {
  // Nav
  'nav.dashboard': 'Dashboard',
  'nav.chat': 'Chat',
  'nav.files': 'Files',
  'nav.terminal': 'Terminal',
  'nav.jobs': 'Jobs',
  'nav.tasks': 'Tasks',
  'nav.memory': 'Memory',
  'nav.skills': 'Skills',
  'nav.profiles': 'Profiles',
  'nav.settings': 'Settings',
  // Skills
  'skills.installed': 'Installed',
  'skills.marketplace': 'Marketplace',
  'skills.search': 'Search by name, tags, or description',
  'skills.noResults': 'No skills found',
  // Profiles
  'profiles.profiles': 'Profiles',
  'profiles.monitoring': 'Monitoring',
  // Tasks
  'tasks.title': 'Tasks',
  'tasks.newTask': 'New Task',
  'tasks.backlog': 'Backlog',
  'tasks.todo': 'Todo',
  'tasks.inProgress': 'In Progress',
  'tasks.review': 'Review',
  'tasks.done': 'Done',
  // Jobs
  'jobs.title': 'Jobs',
  'jobs.newJob': 'New Job',
  // Settings
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.languageDesc': 'Choose the display language for the workspace UI.',
  // Common
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.search': 'Search',
  'common.loading': 'Loading...',
  'common.error': 'Error',
  'common.noData': 'No data',
} as const

export type TranslationKey = keyof typeof EN
type LocaleTranslations = Record<TranslationKey, string>

const ES: LocaleTranslations = {
  'nav.dashboard': 'Panel',
  'nav.chat': 'Chat',
  'nav.files': 'Archivos',
  'nav.terminal': 'Terminal',
  'nav.jobs': 'Trabajos',
  'nav.tasks': 'Tareas',
  'nav.memory': 'Memoria',
  'nav.skills': 'Habilidades',
  'nav.profiles': 'Perfiles',
  'nav.settings': 'Configuración',
  'skills.installed': 'Instaladas',
  'skills.marketplace': 'Mercado',
  'skills.search': 'Buscar por nombre, etiquetas o descripción',
  'skills.noResults': 'No se encontraron habilidades',
  'profiles.profiles': 'Perfiles',
  'profiles.monitoring': 'Monitoreo',
  'tasks.title': 'Tareas',
  'tasks.newTask': 'Nueva Tarea',
  'tasks.backlog': 'Pendientes',
  'tasks.todo': 'Por Hacer',
  'tasks.inProgress': 'En Progreso',
  'tasks.review': 'Revisión',
  'tasks.done': 'Hecho',
  'jobs.title': 'Trabajos',
  'jobs.newJob': 'Nuevo Trabajo',
  'settings.title': 'Configuración',
  'settings.language': 'Idioma',
  'settings.languageDesc':
    'Elige el idioma de la interfaz del espacio de trabajo.',
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Eliminar',
  'common.search': 'Buscar',
  'common.loading': 'Cargando...',
  'common.error': 'Error',
  'common.noData': 'Sin datos',
}

const FR: LocaleTranslations = {
  'nav.dashboard': 'Tableau de bord',
  'nav.chat': 'Chat',
  'nav.files': 'Fichiers',
  'nav.terminal': 'Terminal',
  'nav.jobs': 'Tâches planifiées',
  'nav.tasks': 'Tâches',
  'nav.memory': 'Mémoire',
  'nav.skills': 'Compétences',
  'nav.profiles': 'Profils',
  'nav.settings': 'Paramètres',
  'skills.installed': 'Installées',
  'skills.marketplace': 'Marché',
  'skills.search': 'Rechercher par nom, tags ou description',
  'skills.noResults': 'Aucune compétence trouvée',
  'profiles.profiles': 'Profils',
  'profiles.monitoring': 'Surveillance',
  'tasks.title': 'Tâches',
  'tasks.newTask': 'Nouvelle Tâche',
  'tasks.backlog': 'En attente',
  'tasks.todo': 'À faire',
  'tasks.inProgress': 'En cours',
  'tasks.review': 'Révision',
  'tasks.done': 'Terminé',
  'jobs.title': 'Tâches planifiées',
  'jobs.newJob': 'Nouvelle tâche',
  'settings.title': 'Paramètres',
  'settings.language': 'Langue',
  'settings.languageDesc':
    "Choisissez la langue d'affichage de l'espace de travail.",
  'common.save': 'Enregistrer',
  'common.cancel': 'Annuler',
  'common.delete': 'Supprimer',
  'common.search': 'Rechercher',
  'common.loading': 'Chargement...',
  'common.error': 'Erreur',
  'common.noData': 'Aucune donnée',
}

const ZH: LocaleTranslations = {
  'nav.dashboard': '仪表板',
  'nav.chat': '聊天',
  'nav.files': '文件',
  'nav.terminal': '终端',
  'nav.jobs': '作业',
  'nav.tasks': '任务',
  'nav.memory': '记忆',
  'nav.skills': '技能',
  'nav.profiles': '配置文件',
  'nav.settings': '设置',
  'skills.installed': '已安装',
  'skills.marketplace': '市场',
  'skills.search': '按名称、标签或描述搜索',
  'skills.noResults': '未找到技能',
  'profiles.profiles': '配置文件',
  'profiles.monitoring': '监控',
  'tasks.title': '任务',
  'tasks.newTask': '新建任务',
  'tasks.backlog': '待办池',
  'tasks.todo': '待处理',
  'tasks.inProgress': '进行中',
  'tasks.review': '审核',
  'tasks.done': '完成',
  'jobs.title': '作业',
  'jobs.newJob': '新建作业',
  'settings.title': '设置',
  'settings.language': '语言',
  'settings.languageDesc': '选择工作区界面显示语言。',
  'common.save': '保存',
  'common.cancel': '取消',
  'common.delete': '删除',
  'common.search': '搜索',
  'common.loading': '加载中...',
  'common.error': '错误',
  'common.noData': '暂无数据',
}

const RU: LocaleTranslations = {
  'nav.dashboard': 'Панель',
  'nav.chat': 'Чат',
  'nav.files': 'Файлы',
  'nav.terminal': 'Терминал',
  'nav.jobs': 'Задания',
  'nav.tasks': 'Задачи',
  'nav.memory': 'Память',
  'nav.skills': 'Навыки',
  'nav.profiles': 'Профили',
  'nav.settings': 'Настройки',
  'skills.installed': 'Установленные',
  'skills.marketplace': 'Маркетплейс',
  'skills.search': 'Поиск по названию, тегам или описанию',
  'skills.noResults': 'Навыки не найдены',
  'profiles.profiles': 'Профили',
  'profiles.monitoring': 'Мониторинг',
  'tasks.title': 'Задачи',
  'tasks.newTask': 'Новая задача',
  'tasks.backlog': 'Бэклог',
  'tasks.todo': 'К выполнению',
  'tasks.inProgress': 'В работе',
  'tasks.review': 'Проверка',
  'tasks.done': 'Готово',
  'jobs.title': 'Задания',
  'jobs.newJob': 'Новое задание',
  'settings.title': 'Настройки',
  'settings.language': 'Язык',
  'settings.languageDesc': 'Выберите язык интерфейса рабочего пространства.',
  'common.save': 'Сохранить',
  'common.cancel': 'Отмена',
  'common.delete': 'Удалить',
  'common.search': 'Поиск',
  'common.loading': 'Загрузка...',
  'common.error': 'Ошибка',
  'common.noData': 'Нет данных',
}

const ZH_TW: LocaleTranslations = {
  'nav.dashboard': '儀表板',
  'nav.chat': '聊天',
  'nav.files': '檔案',
  'nav.terminal': '終端機',
  'nav.jobs': '工作',
  'nav.tasks': '任務',
  'nav.memory': '記憶體',
  'nav.skills': '技能',
  'nav.profiles': '個人資料',
  'nav.settings': '設定',
  'skills.installed': '已安裝',
  'skills.marketplace': '市集',
  'skills.search': '依名稱、標籤或描述搜尋',
  'skills.noResults': '找不到技能',
  'profiles.profiles': '個人資料',
  'profiles.monitoring': '監控',
  'tasks.title': '任務',
  'tasks.newTask': '新增任務',
  'tasks.backlog': '待辦清單',
  'tasks.todo': '待處理',
  'tasks.inProgress': '進行中',
  'tasks.review': '審查',
  'tasks.done': '完成',
  'jobs.title': '工作',
  'jobs.newJob': '新增工作',
  'settings.title': '設定',
  'settings.language': '語言',
  'settings.languageDesc': '選擇工作區介面的顯示語言。',
  'common.save': '儲存',
  'common.cancel': '取消',
  'common.delete': '刪除',
  'common.search': '搜尋',
  'common.loading': '載入中...',
  'common.error': '錯誤',
  'common.noData': '無資料',
}

const LOCALES: Record<LocaleId, LocaleTranslations> = {
  en: EN,
  es: ES,
  fr: FR,
  de: EN,
  zh: ZH,
  'zh-TW': ZH_TW,
  ja: EN,
  ko: EN,
  pt: EN,
  ru: RU,
  ar: EN,
}

export const LOCALE_LABELS: Record<LocaleId, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  zh: '中文（简体）',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  pt: 'Português',
  ru: 'Русский',
  ar: 'العربية',
}

const STORAGE_KEY = 'hermes-workspace-locale'

export function getLocale(): LocaleId {
  if (typeof window === 'undefined') return 'en'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && stored in LOCALES) return stored as LocaleId
  const full = navigator.language
  if (full in LOCALES) return full as LocaleId
  const lang = full.split('-')[0]
  if (lang in LOCALES) return lang as LocaleId
  return 'en'
}

export function setLocale(id: LocaleId): void {
  localStorage.setItem(STORAGE_KEY, id)
  window.dispatchEvent(new CustomEvent('locale-change', { detail: id }))
}

export function t(key: TranslationKey): string {
  const locale = getLocale()
  return LOCALES[locale]?.[key] ?? LOCALES.en[key] ?? key
}
