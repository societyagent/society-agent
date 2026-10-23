import { GitBranch, Radio, ArrowRight } from 'lucide-react'
import { newsTrail } from '@/engine/trail'
import { placeName, type Agent, type Ev } from '@/engine/world'

export function RumorTrail({ events, agents, selected, onSelect, layout }: { events: Ev[]; agents: Agent[]; selected: number | null; onSelect: (id: number) => void; layout?: string }) {
  const latest = [...events].reverse().find((e) => e.type === 'inform' && e.agent !== undefined)
  const id = selected ?? latest?.agent
  const chain = id === undefined ? [] : newsTrail(events, id)
  const person = id === undefined ? null : agents[id]
  const turns = id === undefined ? [] : events.filter((e) => e.agent === id && e.type === 'shift').slice(-3)
  return <section aria-label="News trail" className="mt-4 overflow-hidden rounded-2xl border border-ember-300/25 bg-gradient-to-br from-[#221710] via-[#15120f] to-[#100f0d]">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-5 md:p-6">
      <div><p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-ember-200"><GitBranch size={14} /> News trail · new</p>
        <h2 className="mt-2 font-display text-2xl md:text-3xl">Who told whom?</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">Follow the recorded route the news first took to one resident. See where they heard it and any logged changes in stance.</p></div>
      <label className="text-xs text-white/60">Follow a resident
        <select aria-label="Follow a resident" value={id ?? ''} onChange={(e) => onSelect(Number(e.target.value))} className="mt-1.5 block min-w-48 max-w-full rounded-lg border border-white/15 bg-[#17130f] px-3 py-2.5 text-sm text-white focus:border-ember-300/60 focus:outline-none">
          {id === undefined && <option value="">Choose a resident</option>}
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.informed ? '' : ' · hasn’t heard yet'}</option>)}
        </select>
      </label>
    </div>
    {chain.length && person ? <div className="p-5 md:p-6">
      <p className="text-sm text-white/70">News reached <strong className="font-medium text-white">{person.name}</strong> through {chain.length === 1 ? 'a direct source' : `${chain.length - 1} resident${chain.length > 2 ? 's' : ''}`}:</p>
      <ol className="mt-5 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-stretch" aria-label={`First-hearing chain to ${person.name}`}>
        {chain.map((e, i) => { const a = agents[e.agent!], origin = e.type === 'intervene' ? 'Your whisper' : e.with === undefined ? 'News breaks / announcement' : agents[e.with]?.name ?? 'Unknown resident'
          return <li key={`${e.tick}-${e.agent}-${i}`} className="flex min-w-0 flex-col items-center gap-2 md:flex-row"><div className="w-full rounded-xl border border-white/10 bg-white/[.04] p-3.5 md:w-44">
            <p className="font-mono text-[10px] uppercase tracking-wider text-ember-200">{e.t}</p><p className="mt-1 text-sm font-medium text-white">{a?.name ?? 'Resident'}</p>
            <p className="mt-1 text-xs leading-snug text-white/55">{origin}{e.place ? ` · ${placeName(layout, e.place)}` : ''}</p>
          </div>{i < chain.length - 1 && <ArrowRight size={16} className="shrink-0 rotate-90 text-ember-200/70 md:rotate-0" aria-hidden />}</li> })}
      </ol>
      <div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs font-medium uppercase tracking-[.14em] text-white/55">Recorded turning points for {person.name.split(' ')[0]}</p>
        {turns.length ? <ul className="mt-2 space-y-2">{turns.map((e, i) => <li key={`${e.tick}-${i}`} className="flex gap-3 text-sm leading-relaxed text-white/75"><span className="shrink-0 font-mono text-xs text-ember-200">{e.t}</span><span>{e.text}</span></li>)}</ul> : <p className="mt-2 text-sm text-white/55">No change in stance has been logged yet. Smaller opinion movements may still happen.</p>}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-white/45">This traces first hearing, not every later influence or proof of why a person believes something. All events come from this run; it is a model, not real-world evidence.</p>
    </div> : <div className="flex items-center gap-3 p-5 text-sm text-white/60 md:p-6"><Radio size={18} className="shrink-0 text-ember-200" />{person ? `${person.name} hasn’t heard the news yet. Choose someone else or let the day unfold.` : 'Begin the day to see the first sources and follow how news travels.'}</div>}
  </section>
}
