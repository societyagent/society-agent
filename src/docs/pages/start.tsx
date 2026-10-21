import { LIMITS } from '@/engine/limits'
import { GRID_H, GRID_W, LAYOUT_META, RESIDENT_LIMIT, TOWN_LIMIT, MIND_ACTIONS } from '@/engine/world'
import { TEMPLATES, TOWN_PRESETS } from '@/engine/templates'
import { B, Callout, D, M, OL, P, STEP, Table, UL, type DocPage } from '../ui'

export const startPages: DocPage[] = [
  {
    slug: 'overview', title: 'What is Society Agent?', group: 'Start here',
    tagline: 'A small town of invented people, one piece of news, and a way to find out what really changes how it spreads.',
    keywords: ['introduction', 'about', 'what is', 'agent-based', 'simulation', 'overview', 'open source'],
    sections: [
      { id: 'idea', title: 'The idea', body: <>
        <P>Society Agent is an open-source <B>agent-based town simulation</B>. {LIMITS.town.minResidents}–{LIMITS.town.maxResidents} residents, each with a name, a job, a personality and a memory, wake up in a small town. At 07:20 a piece of news breaks. A couple of residents hear it first. Everyone then goes about the day, walks the streets, meets people and talks, and the news moves from person to person, changing minds as it goes.</P>
        <P>You can watch that happen, step in with an announcement or a whisper, interview any resident, and read a plain-language account of what happened. The part that sets it apart is the <D to="lab">Experiment Lab</D>: instead of trusting one run, it repeats the same day across dozens of random towns and tells you whether a change actually mattered.</P></> },
      { id: 'three-things', title: 'Three things you can do', body: <>
        <Table head={['You want to…', 'Use', 'Needs sign-in?']} rows={[
          ['Watch one town live through a day and poke at it', <D key="s" to="simulation">The simulation</D>, 'No'],
          ['Find out whether something really changes the outcome', <D key="l" to="lab">The Experiment Lab</D>, 'No'],
          ['Keep a run, share it, hear residents speak, or interview them', <D key="a" to="saving">Saved runs</D>, 'Yes (wallet signature, free)'],
        ]} />
        <Callout kind="tip">The fastest way in is <D to="quickstart">the five-minute quick start</D>.</Callout></> },
      { id: 'what-it-is-not', title: 'What it is not', body: <>
        <P>It is a model of one small invented town with simple, readable rules. It is <B>not a forecast</B> of any real community and it does not contain real people. Use it to compare options, build intuition and form hypotheses. <D to="limits-honesty">Limits and honesty</D> lists exactly what it can and cannot tell you.</P>
        <P>Language models are an optional layer on top. They give residents a voice and can let them choose how to react, but the simulation itself is deterministic and runs without any model. See <D to="ai-layer">The AI layer</D>.</P></> },
      { id: 'open-source', title: 'Open source', body: <>
        <P>The code is MIT-licensed. The map art is Kenney’s <M>RPG Urban Pack</M> (CC0, recoloured). Everything that runs here also runs on your own Cloudflare account: see <D to="self-host">Self-hosting</D>.</P></> },
    ],
  },
  {
    slug: 'quickstart', title: 'Quick start', group: 'Start here',
    tagline: 'From nothing to your first finding in about five minutes. No account.',
    keywords: ['getting started', 'first', 'tutorial', 'begin', 'walkthrough'],
    sections: [
      { id: 'first-run', title: 'Your first simulation (1 minute)', body: <>
        <OL>
          <STEP n={1} title="Open the app and pick the news."><P>On <M>/app</M>, leave <M>Water main break</M> selected. That is step 1 of 3.</P></STEP>
          <STEP n={2} title="Press “Start simulation”."><P>You do not need to change anything. The town wakes up at 07:00 and the news breaks at 07:20.</P></STEP>
          <STEP n={3} title="Watch, then click a resident."><P>The coloured dot above each head shows who has heard the news and how they feel about it. Click anyone to read their bio, mood, who told them and what they remember. Switch to 12× if you are impatient.</P></STEP>
          <STEP n={4} title="Read “What happened”."><P>When the day ends (or at any time) the report under the map explains the outcome in sentences: how fast the news travelled, who spread it, where people talked, and where opinion ended up.</P></STEP>
        </OL></> },
      { id: 'first-experiment', title: 'Your first experiment (3 minutes)', body: <>
        <P>One run can be luck. Open <D to="lab">the Experiment Lab</D> to find out whether something <i>really</i> changes things.</P>
        <OL>
          <STEP n={1} title="Open /app/lab."><P>It starts with a ready-made comparison: <M>Stay silent</M> against <M>Official statement</M>, on the water scenario.</P></STEP>
          <STEP n={2} title="Press “Run 180 simulated days”."><P>That is 60 random towns for each of three options. It takes a few seconds in your browser.</P></STEP>
          <STEP n={3} title="Read the verdict cards."><P>Each says, in words, whether the option made a <B>clear</B> difference, by how much, and in how many of the towns it went the same way.</P></STEP>
          <STEP n={4} title="Click “Watch a town”."><P>Open the typical, the calmest or the most alarmed town from the batch in the live simulation, with that option’s move already applied.</P></STEP>
          <STEP n={5} title="Click “Make a report”."><P>You get a printable write-up and a link anyone can open to see exactly the same numbers. See <D to="reports">Reports and sharing</D>.</P></STEP>
        </OL></> },
      { id: 'next', title: 'Where to go next', body: <UL>
        <li>Understand the people and the rules: <D to="concepts">Core concepts</D>.</li>
        <li>Write your own news and choose the kind of town: <D to="scenarios">Scenarios</D>.</li>
        <li>Understand the statistics behind the verdicts: <D to="statistics">How the lab decides</D>.</li>
        <li>Run it yourself: <D to="self-host">Self-hosting</D>.</li></UL> },
    ],
  },
  {
    slug: 'concepts', title: 'Core concepts', group: 'Start here',
    tagline: 'Residents, news, opinion, time, towns and seeds: the six ideas everything else is built from.',
    keywords: ['glossary', 'terms', 'resident', 'opinion', 'seed', 'tick', 'stance', 'axis', 'informed'],
    sections: [
      { id: 'residents', title: 'Residents', body: <>
        <P>Each resident has a <B>role</B> (organizer, journalist, nurse…), a home, a workplace, a short bio and three traits between 0 and 1 (or −1 and 1 for leaning): <M>social</M> (how often they chat), <M>trust</M> (how much they believe others) and <M>bias</M> (a built-in lean on the debate). A fourth value, <M>stubbornness</M>, is derived from trust and age. The full cast is on <D to="residents">the residents page</D>.</P></> },
      { id: 'news-opinion', title: 'News, stance and opinion', body: <>
        <P>Every scenario is <B>one piece of news</B> and <B>one debate axis</B> with two sides, for example <M>Calm ↔ Alarmed</M>. A resident’s <B>opinion</B> is a number from −1 (the first side) to +1 (the second). Someone who has not heard the news has no opinion yet. The news itself has a <B>stance</B> (how it leans) which nudges what people feel when they first hear it, but residents have opinions of their own, so a stance does not decide where everyone ends up.</P>
        <P>On screen the opinion becomes a colour and a word: below −0.15 is <i>skeptical</i> (or the first side), up to 0.15 is <i>neutral</i>, up to 0.5 <i>worried</i> and above 0.5 <i>alarmed</i> (for a custom debate these map onto your own two sides).</P></> },
      { id: 'time', title: 'Time', body: <>
        <P>One <B>tick</B> is 10 simulated minutes. A day is 144 ticks. The clock starts at 07:00 on Day 1, the news breaks at tick 2 (07:20) and the lab and the app both simulate one full day. A saved run can be up to {LIMITS.maxTicks} ticks (two days).</P></> },
      { id: 'towns', title: 'The town', body: <>
        <P>A town has a <B>character</B> (a small shift in every resident’s traits, see <D to="scenarios">Scenarios</D>) and a <B>street plan</B> (where the buildings and roads are). The map is {GRID_W}×{GRID_H} cells. Both are optional: without them you get the everyday town on the classic plan.</P></> },
      { id: 'seed', title: 'Seeds and reproducibility', body: <>
        <P>A <B>seed</B> is a whole number that fixes every “random” choice in a day. Same seed + same scenario + same interventions gives <B>exactly the same day</B>, in any browser and on the server. This is what lets you save a run, share it, and have a stranger see precisely what you saw. <D to="reproducibility">Reproducibility</D> explains how it is guaranteed and tested.</P></> },
      { id: 'interventions', title: 'Interventions', body: <>
        <P>You can step in during a run. An <B>announcement</B> reaches everyone at once. A <B>whisper</B> reaches one person. With the <D to="ai-layer">AI layer</D> a resident can also <B>decide</B> to {MIND_ACTIONS.map((a) => a.replace('_', ' ')).join(', ')}. All three are stored as inputs to the run, which is why a run replays exactly.</P></> },
    ],
  },
  {
    slug: 'a-day-in-town', title: 'A day in town', group: 'Start here',
    tagline: 'What the engine does every ten minutes, in order, with the real numbers.',
    keywords: ['how it works', 'engine', 'mechanics', 'routine', 'movement', 'conversation', 'schedule', 'rules'],
    sections: [
      { id: 'routine', title: 'Daily routine', body: <>
        <Table head={['Time', 'Residents…', 'Goal shown']} rows={[
          ['22:00 – 07:00', 'rest at home', 'resting at home'],
          ['07:00 – 08:00', 'go to the café with probability equal to their sociability, otherwise stay home', 'morning coffee'],
          ['08:00 – 12:00', 'go to work', 'working'],
          ['12:00 – 13:00', 'eat at the café or the market (50 / 50)', 'lunch'],
          ['13:00 – 17:00', 'go to work', 'working'],
          ['17:00 – 20:00', 'sociable people (above 0.55) go to the park, the others to the café', 'evening out'],
          ['20:00 – 22:00', 'walk home', 'heading home'],
        ]} />
        <P>Between 08:00 and 21:00, a resident who has heard the news, feels strongly (opinion beyond ±0.45) and is sociable (above 0.55) has a 45% chance of heading to the Town Hall instead, to talk it over.</P></> },
      { id: 'tick', title: 'What happens in a tick', body: <OL>
        <li><B>News enters.</B> At tick 2 the news breaks and up to two residents with the “hears first” roles are told directly. If nobody has those roles, the first two residents are.</li>
        <li><B>Intentions and movement.</B> Residents pick where to be from the table above and walk there along the streets, two cells per tick. Routes are shortest paths that stay on roads, pavements and building entrances; roofs are never walked through.</li>
        <li><B>Conversations.</B> Residents are visited in a shuffled order. Two people within two cells of each other may talk, unless they talked to each other in the last eight ticks. The chance they actually talk is <M>0.2 + 0.55 × the average sociability of the two</M>.</li>
        <li><B>Telling and listening.</B> If one has heard and the other has not, the first tells the second; if both have, either may speak. A listener who has not heard becomes informed with probability <M>(0.45 + 0.4 × trust) × the speaker’s role weight</M> (capped at 0.97).</li>
        <li><B>Changing minds.</B> A listener who already has an opinion moves toward the speaker when they are not too far apart. See <D to="opinion-dynamics">Opinion dynamics</D>.</li>
        <li><B>Record.</B> The tick’s metrics (share informed, average opinion, disagreement, conversations) are stored, and events are written to the town log.</li></OL> },
      { id: 'roles', title: 'Who is persuasive', body: <>
        <P>Some roles carry more weight when they speak: journalist 1.5, organizer 1.3, official 1.25, nurse 1.15, teacher 1.1, shopkeeper 1.05, everyone else 1.0. An official who is not trusted can backfire: a resident with trust below 0.35 who hears an official moves <i>away</i> from them a little (“reactance”).</P></> },
      { id: 'where-numbers-live', title: 'Where these numbers live', body: <P>All of them are in <M>src/engine/world.ts</M>, in readable code, and the layouts, towns and quotas are generated into this manual from the same source. If you disagree with a rule, that file is the place to change it, and <D to="reproducibility">the compatibility test</D> will tell you what you broke.</P> },
    ],
  },
  {
    slug: 'opinion-dynamics', title: 'Opinion dynamics', group: 'Start here',
    tagline: 'How a conversation moves someone’s mind: bounded confidence, trust, stubbornness and role weight.',
    keywords: ['bounded confidence', 'persuasion', 'polarization', 'stubborn', 'reactance', 'formula', 'math', 'hegselmann'],
    sections: [
      { id: 'first-hearing', title: 'When someone first hears it', body: <>
        <P>A resident’s first opinion mixes what they were told with who they are: <M>opinion = clamp( source × (0.35 + 0.65 × trust) + bias × 0.9 − penalty + base )</M>. The <M>source</M> is 0.6 × the speaker’s opinion (or 0.6 × the news stance for a public announcement). The <M>penalty</M> of 0.35 applies to a low-trust resident hearing it from an official. The <M>base</M> is 0.15 for the first people told, otherwise 0.</P></> },
      { id: 'conversation', title: 'When two informed people talk', body: <>
        <Table head={['Situation', 'What happens to the listener']} rows={[
          ['The speaker is an official and the listener’s trust is below 0.35', 'Moves 0.07 away from the speaker (reactance)'],
          ['The two opinions differ by less than 0.7', 'Moves toward the speaker: 0.13 × gap × role weight × trust × (1 − stubbornness)'],
          ['They differ by 0.7 or more (35% of the time)', 'Moves 0.05 away (“that’s ridiculous”)'],
          ['They are within 0.25 and neither of the above happened', 'Hardens slightly: +0.03 in the direction they already lean'],
        ]} />
        <P>This is a <B>bounded-confidence</B> model: people are persuaded by those not too far from them and may dig in against those who are. It is simple on purpose, so that you can read why a town ended up where it did.</P></> },
      { id: 'stubbornness', title: 'Stubbornness', body: <P>Every resident’s stubbornness is <M>0.25 + (1 − trust) × 0.5</M>, plus 0.15 if they are over 55, clamped. Low-trust and older residents are harder to move.</P> },
      { id: 'stance-words', title: 'Stance words in the log', body: <P>The log says a resident “shifted from worried to skeptical” when their opinion crosses a boundary: above 0.5 alarmed, above 0.15 worried, above −0.15 neutral, otherwise skeptical. Boundaries are the only thing the log reports; the underlying number keeps moving between them.</P> },
      { id: 'what-this-means', title: 'What this means for your results', body: <Callout kind="honest">These rules produce plausible, explainable dynamics. They were not fitted to data about real communities. Treat the <i>direction</i> and <i>relative size</i> of effects between options as the useful output, not the absolute numbers.</Callout> },
    ],
  },
  {
    slug: 'scenarios', title: 'Scenarios, towns and street plans', group: 'Using the app',
    tagline: 'Pick or write the news, choose a kind of town and a street plan, and optionally change one resident.',
    keywords: ['custom scenario', 'town character', 'layout', 'village', 'main street', 'trusting', 'suspicious', 'tight-knit', 'isolated', 'nervous', 'easygoing', 'residents', 'tweak'],
    sections: [
      { id: 'ready-made', title: 'Ready-made scenarios', body: <Table head={['Scenario', 'The news', 'Debate axis', 'Hears first']} rows={TEMPLATES.filter((t) => t.id !== 'custom').map((t) => [t.title, `“${t.news.text}”`, `${t.axis[0]} ↔ ${t.axis[1]}`, t.news.seedRoles.join(', ')])} /> },
      { id: 'custom', title: 'Your own scenario', body: <>
        <P>Choose <B>Your own scenario</B> and set: the <B>news</B> (up to 240 characters), the <B>two sides</B> of the debate (up to 24 characters each, they appear on every axis, tooltip and sentence), <B>how the news leans</B> (−1 to +1) and <B>who hears it first</B> (up to 4 roles).</P>
        <Callout kind="note">The lean is relative to neutral. Residents have opinions of their own, so a negative lean does not guarantee a negative outcome. It shifts the whole town a little compared with no lean.</Callout></> },
      { id: 'town-character', title: 'What kind of town', body: <>
        <P>A town character adds a small, bounded shift (at most ±{TOWN_LIMIT}) to <i>every</i> resident’s traits. A town with no character is byte-identical to the original engine.</P>
        <Table head={['Town', 'Trust', 'Sociability', 'Leaning', 'Meant to feel like']} rows={TOWN_PRESETS.map((p) => [p.label, p.town ? p.town.trust.toFixed(2) : '0', p.town ? p.town.social.toFixed(2) : '0', p.town ? p.town.bias.toFixed(2) : '0', p.blurb])} />
        <P>Measured on 60 random towns, news reaches half the town in about 1.4 hours in a tight-knit town, 2.8 in an everyday one and 4.5 in an isolated one. Try it yourself in the lab: <i>Does the kind of town matter?</i></P></> },
      { id: 'layouts', title: 'Street plans', body: <>
        <Table head={['Plan', 'Shape']} rows={LAYOUT_META.map((m) => [m.name, m.blurb])} />
        <P>Every plan has the same fourteen places, so routines work everywhere: a Town Hall, café, market, school, clinic, park and eight houses. Only the geometry changes. A plan is plain data in <M>src/engine/world.ts</M> (roads and positions), so adding one does not touch the simulation rules.</P>
        <Callout kind="honest">The street plan matters, but not the same amount in every story. Measured over 60 and 120 towns, news reached half the town about an hour sooner on the long main street for the water and school scenarios, but showed no clear difference for the clinic rumor. Do not assume one plan is simply “faster”.</Callout></> },
      { id: 'one-resident', title: 'Changing one resident', body: <>
        <P>You can nudge a single person’s sociability, trust or leaning by up to ±{RESIDENT_LIMIT}, on top of the town character. It is a way to ask “what if this person were different?”. In the lab each option can change a different person.</P>
        <Callout kind="honest">One person rarely decides a town. Making the official far more sociable sped the news up by about 1.3 hours (a clear effect), but weakening the journalist or the retiree produced no difference that could be told apart from chance. The lab says so when that is the case.</Callout></> },
      { id: 'residents-count', title: 'How many residents', body: <P>From {LIMITS.town.minResidents} to {LIMITS.town.maxResidents}. The first N people in <D to="residents">the cast</D> live in the town, so a smaller town loses the later residents, not random ones.</P> },
    ],
  },
]
