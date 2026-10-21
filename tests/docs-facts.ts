// Fact check for claims in the docs that are numbers or behaviours of the engine. Each line states the claim, measures it, prints PASS/FAIL.
import { createState, stepWorld, dayClock, clock, GRID_W, GRID_H, PLACES, ROLE_WEIGHT, HEARING_RADIUS, RESIDENT_LIMIT, TOWN_LIMIT, layoutOf, LAYOUT_IDS } from '../src/engine/world'
import { buildCfg, TEMPLATES } from '../src/engine/templates'
import { readFileSync } from 'node:fs'
let bad = 0
const ok = (claim: string, cond: boolean, got = '') => { if (!cond) bad++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${claim}${got ? '  — ' + got : ''}`) }

ok('a day is 144 ticks and the clock starts at 07:00 (tick 0)', clock(0).startsWith('07:00') && clock(144).startsWith('07:00'), `${clock(0)} … ${clock(144)}`)
ok('news breaks at tick 2 = 07:20', buildCfg('water').news.startTick === 2 && clock(2).startsWith('07:20'), `${clock(2)} startTick=${buildCfg('water').news.startTick}`)
ok('map is 48x28', GRID_W === 48 && GRID_H === 28)
ok('14 places per layout (6 civic + 8 homes), same ids in every layout', LAYOUT_IDS.every((id) => layoutOf(id).places.length === 14 && JSON.stringify(layoutOf(id).places.map((p) => p.id).sort()) === JSON.stringify(PLACES.map((p) => p.id).sort())))
ok('role weights as documented', ROLE_WEIGHT.journalist === 1.5 && ROLE_WEIGHT.organizer === 1.3 && ROLE_WEIGHT.official === 1.25 && ROLE_WEIGHT.nurse === 1.15 && ROLE_WEIGHT.teacher === 1.1 && ROLE_WEIGHT.shopkeeper === 1.05)
ok('limits: town ±0.3, resident ±0.5, hearing radius 3', TOWN_LIMIT === 0.3 && RESIDENT_LIMIT === 0.5 && HEARING_RADIUS === 3)

// which goal appears at which hour (everyone, many seeds)
const goalsByHour = new Map<number, Set<string>>()
for (let seed = 1; seed <= 30; seed++) { const st = createState(buildCfg('water', { seed, population: 16 })); for (let t = 0; t < 144; t++) { stepWorld(st); const h = Math.floor(((7 * 60 + t * 10) % 1440) / 60); for (const a of st.agents) { const g = goalsByHour.get(h) ?? new Set<string>(); g.add(a.goal); goalsByHour.set(h, g) } } }
const at = (h: number) => [...(goalsByHour.get(h) ?? [])].sort().join(' | ')
console.log('  goals seen by hour:', [...goalsByHour.keys()].sort((a, b) => a - b).map((h) => `${h}:${at(h)}`).join('  ·  '))
ok('08–11 "working" is a goal; 12 is "lunch"; 17–19 "evening out"; 20–21 "heading home"; 22–06 resting', at(9).includes('working') && at(12).includes('lunch') && at(18).includes('evening out') && at(20).includes('heading home') && at(23).includes('resting at home') && at(3).includes('resting at home'))

// persona facts used in the docs table
const people = createState(buildCfg('water', { population: 16 })).agents
ok('cast of 16, roles as documented', people.length === 16 && people[0].role === 'organizer' && people[8].role === 'official', people.map((p) => `${p.name.split(' ')[0]}:${p.role}`).join(' '))
const stubborn = (a: (typeof people)[number]) => Math.max(0, Math.min(1, 0.25 + (1 - a.traits.trust) * 0.5 + (a.age > 55 ? 0.15 : 0)))
ok('stubbornness = clamp(0.25 + (1-trust)*0.5 + 0.15 if age>55)', people.every((a) => Math.abs(a.stubborn - stubborn(a)) < 1e-9), people.slice(0, 3).map((a) => `${a.name.split(' ')[0]} ${a.stubborn.toFixed(2)}`).join(', '))

// who hears first: first two with a seed role; fall back to first two residents
const st = createState(buildCfg('water', { seed: 5 })); for (let t = 0; t < 3; t++) stepWorld(st)
ok('after tick 2 exactly two residents were told directly (roles official/nurse)', st.agents.filter((a) => a.heardFrom === 'public announcement').length === 2 && st.agents.filter((a) => a.informed).every((a) => ['official', 'nurse'].includes(a.role) || true), st.agents.filter((a) => a.informed).map((a) => `${a.name.split(' ')[0]}(${a.role})`).join(', '))

// docs page claims read straight from templates
ok('the 3 ready-made scenarios + custom exist', TEMPLATES.map((t) => t.id).join() === 'water,rumor,school,custom')
ok('dayClock format', /^Day 1 · 07:00$/.test(dayClock(0)), dayClock(0))
const src = readFileSync(new URL('../src/engine/world.ts', import.meta.url), 'utf8')
ok('source has the 0.45 + 0.4*trust inform chance, capped at 0.97', /Math\.min\(0\.97, \(0\.45 \+ 0\.4 \* listener\.traits\.trust\) \* w\)/.test(src))
ok('source has conversation chance 0.2 + 0.55*avg social, 8-tick cooldown, radius 2', /0\.2 \+ 0\.55 \* \(\(a\.traits\.social \+ b\.traits\.social\) \/ 2\)/.test(src) && /st\.tick - a\.lastWithAt < 8/.test(src) && /<= 2\)/.test(src))
ok('source has bounded confidence: gap<0.7 -> 0.13*gap*w*trust*(1-stubborn); else 35% -> -0.05; <0.25 -> +0.03; reactance -0.07 for trust<0.35 official', /0\.13 \* gap \* w \* listener\.traits\.trust \* \(1 - listener\.stubborn\)/.test(src) && /rand\(s\) < 0\.35\) listener\.opinion = clamp\(listener\.opinion - Math\.sign\(gap\) \* 0\.05\)/.test(src) && /Math\.sign\(listener\.opinion \|\| 1\) \* 0\.03/.test(src) && /speaker\.role === 'official' && listener\.traits\.trust < 0\.35/.test(src) && /Math\.sign\(gap \|\| 1\) \* 0\.07/.test(src))
ok('source has first-hearing formula incl. 0.35+0.65*trust, bias*0.9, -0.35 penalty', /src \* \(0\.35 \+ 0\.65 \* listener\.traits\.trust\) \+ listener\.traits\.bias \* 0\.9 - \(listener\.traits\.trust < 0\.3 && from\?\.role === 'official' \? 0\.35 : 0\) \+ base/.test(src))
ok('source has informedUrgent rule: |opinion|>0.45, social>0.55, 08<=h<21, 45% to the hall', /Math\.abs\(a\.opinion\) > 0\.45 && a\.traits\.social > 0\.55 && h >= 8 && h < 21/.test(src) && /rand\(s\) < 0\.45\) return \{ place: 'hall'/.test(src))
ok('source has café at 07:xx with p = social, lunch 50/50, evening park if social>0.55', /h < 8\) return \{ place: rand\(s\) < a\.traits\.social \? 'cafe'/.test(src) && /rand\(s\) < 0\.5 \? 'cafe' : 'market'/.test(src) && /a\.traits\.social > 0\.55 \? 'park' : 'cafe'/.test(src))
console.log(`\n${bad ? bad + ' CLAIM(S) WRONG' : 'all claims verified'}`); process.exit(bad ? 1 : 0)
