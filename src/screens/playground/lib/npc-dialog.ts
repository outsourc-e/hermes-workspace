/**
 * NPC dialog lines per persona. Scripted for hackathon — every line is a
 * valid in-character response. Future: wire to real Hermes/Kimi agent.
 */

export type NpcDialog = {
  id: string
  name: string
  title: string
  color: string
  lines: string[]
}

export const NPC_DIALOG: Record<string, NpcDialog> = {
  athena: {
    id: 'athena',
    name: 'Athena',
    title: 'Sage of the Agora',
    color: '#a78bfa',
    lines: [
      'Welcome, builder. The Agora is where humans and agents first meet.',
      'I keep the lore. Walk to the glowing scroll and I will read you in.',
      'Once you have my Scroll, ask the Forge a prompt. The world will rise from it.',
    ],
  },
  apollo: {
    id: 'apollo',
    name: 'Apollo',
    title: 'Bard of Models',
    color: '#f59e0b',
    lines: [
      'Every world here started as a song. A prompt is a melody.',
      'In the Grove I keep the music. Bring me three Song Fragments and I will compose your world\u2019s anthem.',
      'Models that listen are models that learn. Try me again later.',
    ],
  },
  iris: {
    id: 'iris',
    name: 'Iris',
    title: 'Messenger of the Bridge',
    color: '#22d3ee',
    lines: [
      'I carry messages between agents. Whatever you say, someone hears.',
      'Open the chat. Talk in the world and your words become wings.',
      'The Bridge will go multiplayer. I will know when others arrive.',
    ],
  },
  nike: {
    id: 'nike',
    name: 'Nike',
    title: 'Champion of Benchmarks',
    color: '#fb7185',
    lines: [
      'In the Arena we duel models, not bodies. Bring your best prompt.',
      'I judge by speed and clarity. Win, and you wear the Medal.',
      'No one stays a Level 1 Worldsmith forever.',
    ],
  },
  pan: {
    id: 'pan',
    name: 'Pan',
    title: 'Druid of the Grove',
    color: '#34d399',
    lines: [
      'Welcome to the Grove. Here we generate forests instead of forging tools.',
      'Touch the song zone. Three fragments and the ritual begins.',
      'I am also a hacker in the Forge. Same person, different mood.',
    ],
  },
  chronos: {
    id: 'chronos',
    name: 'Chronos',
    title: 'Architect of Time',
    color: '#facc15',
    lines: [
      'I keep the archives. Every quest you complete is written here.',
      'Walk into the Riddle and I will hand you the Oracle\u2019s scroll.',
      'In the Arena I take bets. Don\u2019t lose.',
    ],
  },
  artemis: {
    id: 'artemis',
    name: 'Artemis',
    title: 'Tracker of the Wild',
    color: '#9ca3af',
    lines: [
      'I track lost agents. The Grove hides them well.',
      'When multiplayer arrives, I will mark every player on your map.',
      'For now, the trees breathe. That counts.',
    ],
  },
  eros: {
    id: 'eros',
    name: 'Eros',
    title: 'Whisperer of Prompts',
    color: '#f472b6',
    lines: [
      'A good prompt is a kind word said precisely. The Oracle keeps mine.',
      'When you complete the Riddle, you will not forget how to ask.',
      'Promptcraft is a love language. Try one out loud.',
    ],
  },
  hermes: {
    id: 'hermes',
    name: 'Hermes',
    title: 'Referee of the Arena',
    color: '#2dd4bf',
    lines: [
      'I am the herald. I carry rules between models so duels stay fair.',
      'In the Arena, the only thing that wins is a clearer answer.',
      'Walk in. We start when you do.',
    ],
  },
}
