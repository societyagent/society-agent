import type { Cfg } from './world'

export interface Template { id: string; title: string; blurb: string; axis: [string, string]; news: { text: string; stance: number; seedRoles: string[] }; question: string }

export const TEMPLATES: Template[] = [
  {
    id: 'water', title: 'Water main break', axis: ['Calm', 'Alarmed'],
    blurb: 'A pipe bursts in the east district. How fast does the news travel, and does panic spread with it?',
    question: 'How does a local infrastructure failure spread through a town, and who shapes the level of alarm?',
    news: { text: 'A water main broke in the east district and pressure may drop by noon.', stance: 0.6, seedRoles: ['official', 'nurse'] },
  },
  {
    id: 'rumor', title: 'Clinic closure rumor', axis: ['Skeptical', 'Convinced'],
    blurb: 'An unverified rumor says the clinic will close next month. Who believes it, who debunks it?',
    question: 'How does an unverified rumor compete with trusted institutions in a small community?',
    news: { text: 'The clinic is about to be shut down next month.', stance: 0.7, seedRoles: ['shopkeeper', 'student'] },
  },
  {
    id: 'school', title: 'School start time', axis: ['Oppose', 'Support'],
    blurb: 'The council floats moving school start to 9:30. Does the town converge or split?',
    question: 'How do residents with different stakes converge or polarize on a contested local policy?',
    news: { text: 'The council proposes moving the school start time to 9:30.', stance: 0.3, seedRoles: ['official', 'teacher'] },
  },
]

export function buildCfg(templateId: string, over: Partial<{ name: string; question: string; text: string; stance: number; population: number; seed: number }> = {}): Cfg {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0]
  return {
    name: (over.name ?? t.title).slice(0, 80),
    question: (over.question ?? t.question).slice(0, 400),
    template: t.id,
    axis: t.axis,
    population: Math.max(6, Math.min(16, Math.round(over.population ?? 12))),
    seed: (over.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0,
    news: { text: (over.text ?? t.news.text).slice(0, 240), stance: Math.max(-1, Math.min(1, over.stance ?? t.news.stance)), startTick: 2, seedRoles: t.news.seedRoles },
  }
}
