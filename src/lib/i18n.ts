/**
 * Lightweight i18n — UI string translations for Project Workspace.
 * Add new languages by adding a locale map below.
 */

export type LocaleId = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ja' | 'ko' | 'pt' | 'ru' | 'ar'

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
  'settings.languageDesc': 'Elige el idioma de la interfaz del espacio de trabajo.',
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
  'settings.languageDesc': "Choisissez la langue d'affichage de l'espace de travail.",
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
  'nav.jobs': '任务计划',
  'nav.tasks': '任务',
  'nav.memory': '记忆',
  'nav.skills': '技能',
  'nav.profiles': '配置',
  'nav.settings': '设置',
  'skills.installed': '已安装',
  'skills.marketplace': '市场',
  'skills.search': '按名称、标签或描述搜索',
  'skills.noResults': '未找到技能',
  'profiles.profiles': '配置',
  'profiles.monitoring': '监控',
  'tasks.title': '任务',
  'tasks.newTask': '新建任务',
  'tasks.backlog': '待办',
  'tasks.todo': '计划中',
  'tasks.inProgress': '进行中',
  'tasks.review': '审核',
  'tasks.done': '完成',
  'jobs.title': '任务计划',
  'jobs.newJob': '新建计划',
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

const LOCALES: Record<LocaleId, LocaleTranslations> = {
  en: EN, es: ES, fr: FR, de: EN, zh: ZH, ja: EN, ko: EN, pt: EN, ru: EN, ar: EN,
}

export const LOCALE_LABELS: Record<LocaleId, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  zh: '中文',
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
  const browser = navigator.language.split('-')[0]
  if (browser in LOCALES) return browser as LocaleId
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
