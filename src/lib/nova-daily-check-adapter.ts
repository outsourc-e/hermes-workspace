export type NovaDailyCheckItem = {
  id: string
  label: string
  checked: boolean
}

export type NovaDailyCheckState = {
  items: Array<NovaDailyCheckItem>
  overthinking: 'low' | 'medium' | 'high'
  mood: string
  reminder: string
  log: Array<{ date: string; text: string }>
}

export const novaDailyCheck: NovaDailyCheckState = {
  items: [
    { id: 'hydration', label: 'Hydration', checked: true },
    { id: 'nutrition', label: 'Nutrition', checked: true },
    { id: 'rest', label: 'Rest', checked: false },
  ],
  overthinking: 'high',
  mood: 'stubborn',
  reminder: 'Breathe.',
  log: [
    { date: '04/21', text: "Didn't sleep." },
    { date: '04/22', text: 'Ate a meal.' },
    { date: '04/23', text: 'Overworked.' },
    { date: '04/24', text: 'Hydrated.' },
    { date: '04/25', text: 'Slept 6h.' },
    { date: '04/26', text: 'Better.' },
  ],
}

// TODO(claude): replace this mock check-in payload with EverOS wellness receipts.
