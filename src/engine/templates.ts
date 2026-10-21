import type { Cfg, TownCfg } from './world'

export interface Template { id: string; title: string; blurb: string; axis: [string, string]; news: { text: string; stance: number; seedRoles: string[] }; question: string }

export interface TownPreset { id: string; label: string; blurb: string; town?: TownCfg }
/** Characters a town can have. Values are two-decimal so a client and the server round identically. */
export const TOWN_PRESETS: TownPreset[] = [
  { id: 'default', label: 'Everyday town', blurb: 'The standard mix of trust, chatter and calm.' },
  { id: 'trusting', label: 'Trusting town', blurb: 'People believe their neighbours and the authorities.', town: { trust: 0.25, social: 0, bias: 0 } },
  { id: 'suspicious', label: 'Suspicious town', blurb: 'Announcements are met with raised eyebrows.', town: { trust: -0.25, social: 0, bias: 0 } },
  { id: 'tight', label: 'Tight-knit town', blurb: 'Everybody talks to everybody.', town: { trust: 0, social: 0.25, bias: 0 } },
  { id: 'isolated', label: 'Isolated town', blurb: 'People keep to themselves; news travels slowly.', town: { trust: 0, social: -0.3, bias: 0 } },
  { id: 'nervous', label: 'Nervous town', blurb: 'Already on edge before any news arrives.', town: { trust: 0, social: 0, bias: 0.3 } },
  { id: 'easygoing', label: 'Easygoing town', blurb: 'Shrugs first, worries later.', town: { trust: 0, social: 0, bias: -0.3 } },
]
export const townOf = (id: string | undefined) => TOWN_PRESETS.find((p) => p.id === id)?.town
/** Display name for a town character stored on a config (matches a preset by value; anything else is 'Custom town'). */
export const townName = (town?: TownCfg) => !town || (!town.trust && !town.social && !town.bias) ? 'Everyday town' : (TOWN_PRESETS.find((p) => p.town && p.town.trust === town.trust && p.town.social === town.social && p.town.bias === town.bias)?.label ?? 'Custom town')

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
  {
    id: 'custom', title: 'Your own scenario', axis: ['Disagree', 'Agree'],
    blurb: 'Write the news yourself, decide who hears it first, name the two sides of the debate, and choose what kind of town it lands in.',
    question: 'How does this news spread through a town, and who shapes what people end up believing?',
    news: { text: 'The council plans to close Main Street to cars every Sunday.', stance: 0.3, seedRoles: ['official', 'organizer'] },
  },
]

export function buildCfg(templateId: string, over: Partial<{ name: string; question: string; text: string; stance: number; population: number; seed: number; axis: [string, string]; seedRoles: string[]; town: TownCfg }> = {}): Cfg {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0]
  return {
    name: (over.name ?? t.title).slice(0, 80),
    question: (over.question ?? t.question).slice(0, 400),
    template: t.id,
    axis: over.axis ? [over.axis[0].slice(0, 24) || t.axis[0], over.axis[1].slice(0, 24) || t.axis[1]] : t.axis,
    population: Math.max(6, Math.min(16, Math.round(over.population ?? 12))),
    seed: (over.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0,
    news: { text: (over.text ?? t.news.text).slice(0, 240), stance: Math.max(-1, Math.min(1, over.stance ?? t.news.stance)), startTick: 2, seedRoles: over.seedRoles?.length ? over.seedRoles.slice(0, 4) : t.news.seedRoles },
    ...(over.town && (over.town.trust || over.town.social || over.town.bias) ? { town: over.town } : {}),
  }
}
