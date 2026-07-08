import { readFileSync } from 'node:fs'
import { classifyHomeMode } from '../src/lib/home-mode'
import type { CalendarSignal, HomeModePreferences } from '../src/lib/home-mode'

type CliOptions = {
  now?: string
  timezone?: string
  location?: string
  explicitBuildMode?: boolean
  calendar?: Array<CalendarSignal>
  preferences?: HomeModePreferences
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function parseArgs(argv: Array<string>): CliOptions {
  const options: CliOptions = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--now' && next) {
      options.now = next
      index += 1
    } else if (arg === '--timezone' && next) {
      options.timezone = next
      index += 1
    } else if (arg === '--location' && next) {
      options.location = next
      index += 1
    } else if (arg === '--build-mode') {
      options.explicitBuildMode = true
    } else if (arg === '--calendar-json' && next) {
      options.calendar = readJsonFile<Array<CalendarSignal>>(next)
      index += 1
    } else if (arg === '--preferences-json' && next) {
      options.preferences = readJsonFile<HomeModePreferences>(next)
      index += 1
    }
  }

  return options
}

const options = parseArgs(process.argv.slice(2))
const context = classifyHomeMode(options)

console.log(JSON.stringify(context, null, 2))
