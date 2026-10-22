import { LIMITS } from '@/engine/limits'
import { OUTCOMES } from '@/engine/lab'
import { B, Callout, D, M, OL, P, STEP, Table, UL, type DocPage } from '../ui'

export const usePages: DocPage[] = [
  {
    slug: 'simulation', title: 'The simulation screen', group: 'Using the app',
    tagline: 'Every control, colour and number on the live town, and what it means.',
    keywords: ['map', 'controls', 'speed', 'pause', 'legend', 'step in', 'announcement', 'whisper', 'town log', 'stats', 'interview'],
    sections: [
      { id: 'controls', title: 'The control bar', body: <>
        <P>The bar under the title stays on screen as you scroll. <B>Start / Pause / Resume</B> controls time. The town waits at 07:00 until you press <B>Begin the day</B> (or Start), so you do not miss the moment the news breaks. <B>Restart</B> returns to that same quiet morning, with the same seed and nothing sent yet. <B>1×, 4×, 12×</B> set the speed: 2, 6 and 16 ticks per second. A full day of 144 ticks therefore takes about 72 seconds at 1×, 24 at 4× and 9 at 12×. <B>Restart</B> (the circular arrow) puts the day back at 07:00 with the same seed, so it will play out the same way unless you step in differently. The bar on the right shows the progress through the day and the clock.</P></> },
      { id: 'map', title: 'Reading the map', body: <>
        <P>Residents walk the streets between home, work, the café, the market, the park, the school and the clinic. The dot above each head shows how they stand:</P>
        <Table head={['Dot', 'Meaning']} rows={[['Grey', 'has not heard the news yet'], ['Green', 'has heard it and sits on the first side of the debate (for example calm or skeptical)'], ['Red', 'has heard it and sits on the second side (for example alarmed)'], ['Pale orange', 'in “who knows” mode: has heard the news']]} />
        <P>Use <B>Colour: opinion</B> or <B>Colour: who knows</B> under the map to switch. The legend row always shows your debate’s own two words. Click a resident to inspect them; click empty ground to deselect. Speech bubbles show the latest line, and at most two appear at a time so the map stays readable.</P></> },
      { id: 'narration', title: 'The sentence above the map', body: <P>One plain-language sentence that updates as the day goes on: how many residents have heard, how they feel on average, and the latest conversation and where it happened. It is the quickest way to follow what is going on without reading the log.</P> },
      { id: 'stats', title: 'The four numbers', body: <>
        <Table head={['Card', 'What it is']} rows={[
          ['Heard the news', 'Share of residents who know about it.'],
          ['Avg. opinion', 'Mean opinion of those who have heard, from −1 to +1, with a word for it.'],
          ['Disagreement', 'Standard deviation of opinion among those who have heard. 0 means everyone agrees; above about 0.25 the town is divided and above 0.45 it is polarized.'],
          ['Conversations', 'Pairs of residents who talked so far today (small talk included).'],
        ]} /></> },
      { id: 'step-in', title: 'Stepping in', body: <>
        <P>Once the day has started you can send an <B>announcement</B> (everyone hears it at once) or a <B>whisper</B> (one resident). Write what you say, then move the slider toward the side of the debate your message leans on. An announcement makes people who have not heard yet hear it, and moves those who have 35% of the way toward its stance, scaled by how much they trust. A whisper makes one person hear it and replaces 60% of their opinion with the message’s stance (their old opinion keeps 40%, the message gets 70% of its stance). Both are recorded as inputs, so the run replays identically.</P>
        <Callout kind="tip">Try stepping in when about half the town has heard. Earlier, there is little opinion to move; later, opinions have hardened.</Callout></> },
      { id: 'inspector', title: 'The resident panel', body: <P>Shows the person’s bio, what they are doing, how they feel, who told them, their trust and sociability, and their memory: a short log of what they heard and decided. When you are signed in you can also <D to="ai-layer">interview</D> them.</P> },
      { id: 'log-report', title: 'The town log and “What happened”', body: <P>The log lists events as they occur: news, intervention, each time someone hears it, and each time someone crosses a stance boundary. When the day ends, <B>What happened</B> summarises the outcome: how many heard, how fast it spread, the strongest spreader, the busiest place and where opinion ended up.</P> },
      { id: 'export', title: 'Export, save and share', body: <P>JSON and CSV export are always available (CSV is the metric for every tick). Saving a run and creating a share link need a sign-in; see <D to="saving">Saved runs</D>.</P> },
    ],
  },
  {
    slug: 'saving', title: 'Saved runs and sharing', group: 'Using the app',
    tagline: 'Sign in with a wallet signature, keep a run, and share it with anyone through a link that replays exactly.',
    keywords: ['sign in', 'wallet', 'reown', 'siwe', 'save', 'share', 'private', 'delete', 'my runs', 'replay'],
    sections: [
      { id: 'sign-in', title: 'Signing in', body: <>
        <P>You do not need an account to simulate or to use the lab. Sign in only to save runs, use the <D to="ai-layer">AI layer</D> or share a link. Click <B>Sign in</B>, choose a wallet in the Reown modal, and sign a message. The message follows <B>Sign-In with Ethereum (EIP-4361)</B>, is valid for five minutes, can be used once, and states this site’s domain. <B>It costs no gas and sends no transaction.</B></P>
        <P>After you sign, the server sets a session cookie that page scripts cannot read (<M>HttpOnly</M>, <M>Secure</M>, <M>SameSite=Strict</M>). The session lasts seven days. Choose <B>Sign out</B> from the wallet menu to revoke it on the server immediately.</P></> },
      { id: 'saving', title: 'Saving a run', body: <>
        <P>Press <B>Save run</B> at the end (or any time). You send the <i>inputs</i>: the scenario, the length and your interventions. The server replays the same deterministic engine itself and stores its own metrics, events and report, so a stored result cannot be forged by a modified browser. You can keep up to {LIMITS.maxRunsPerOwner} runs and save {LIMITS.rate.saveRun.limit} per hour.</P></> },
      { id: 'private', title: 'Private by default, shared by choice', body: <>
        <P>A new run is private. <B>Create share link</B> makes <M>/r/&lt;id&gt;</M> readable by anyone who has the link; <B>Stop sharing</B> closes it again. Opening a private or missing run gives the same “not found” answer so nobody can tell whether a private run exists. A shared run never shows your wallet address.</P></> },
      { id: 'replay', title: 'Opening a shared run', body: <P>A stranger who opens your link replays your run in their own browser from the stored inputs, so what they see is identical to what you saw, metric for metric. They can also export it. They cannot change it.</P> },
      { id: 'delete', title: 'My runs', body: <P><B>My runs</B> lists your saved runs, newest first. Deleting a run removes it for good, including its share link.</P> },
    ],
  },
  {
    slug: 'lab', title: 'The Experiment Lab', group: 'Experiments',
    tagline: 'Run the same town dozens of times, change one thing, and see what it really does.',
    keywords: ['experiment', 'compare', 'options', 'towns', 'seeds', 'measure', 'baseline', 'verdict', 'paired', 'batch'],
    sections: [
      { id: 'why', title: 'Why a lab', body: <P>In one run, anything can look like a result. Maybe the announcement calmed the town; maybe this town was calm anyway. The lab removes the guesswork by running each option over many different random towns, <B>the same towns for every option</B>, and asking whether the difference is bigger than luck.</P> },
      { id: 'set-up', title: 'Setting one up', body: <OL>
        <STEP n={1} title="Choose the situation."><P>One of the ready-made scenarios, or <B>Your own scenario</B> with your own news and words.</P></STEP>
        <STEP n={2} title="Set the baseline town."><P>The kind of town, the street plan and the number of residents shared by all options unless an option overrides them.</P></STEP>
        <STEP n={3} title={`Define up to ${LIMITS.lab.maxOptions} options.`}><P>The first option is the <B>baseline</B> everything is compared with. Each option is one of: <i>nobody steps in</i>, <i>a public announcement at a time you choose</i>, or <i>a whisper to one person</i>. An option can also use a different town, a different street plan, or change one resident.</P></STEP>
        <STEP n={4} title="Choose what to measure."><P>See the table below.</P></STEP>
        <STEP n={5} title="Choose how many towns."><P>From {LIMITS.lab.minTowns} up to {LIMITS.lab.maxTowns} per option, within a total budget of {LIMITS.lab.maxSimulatedDays} simulated days. More towns make small effects easier to see.</P></STEP>
        <STEP n={6} title="Run."><P>It runs in your browser in a few seconds. Nothing is sent to a server.</P></STEP></OL> },
      { id: 'measures', title: 'What you can measure', body: <Table head={['Measure', 'Meaning', 'A difference counts when it is at least']} rows={Object.values(OUTCOMES).map((o) => [o.label, o.id === 'half' ? 'Simulated hours from the news breaking until half the town had heard' : o.id === 'final' ? 'Average opinion of those who had heard, at the end of the day' : o.id === 'peak' ? 'The highest the average opinion reached during the day' : 'How divided the town was at the end of the day', `${o.minMeaningful}${o.unit}`])} /> },
      { id: 'ready-made', title: 'Ready-made questions', body: <UL>
        <li><B>Does the kind of town matter?</B> The same news with nobody stepping in, in an everyday, a tight-knit and an isolated town.</li>
        <li><B>Does the street plan matter?</B> The same news and nobody stepping in, on the three street plans.</li>
        <li><B>What if one person were different?</B> The same town twice; in the second, the official is more sociable.</li></UL> },
      { id: 'results', title: 'Reading the results', body: <>
        <P>You get <B>verdict cards</B> (one sentence per option compared with the baseline), a <B>chart</B>, a <B>table</B> and a <B>Watch a town</B> button per option. The chart draws the typical town as a line and the middle 80% of towns as a band. Hover to read exact values. <D to="statistics">How the lab decides</D> explains the wording, the confidence range and the effect size.</P>
        <Callout kind="note">When the lab says “no clear difference”, that is a finding: with this many towns the option did not do anything you could tell apart from chance. Try more towns before concluding it never matters.</Callout></> },
      { id: 'share', title: 'Sharing and exporting', body: <P>Copy the page link: it encodes the whole experiment, so anyone who opens it re-runs the same towns and gets the same numbers. Export CSV gives one row per town and option. <B>Make a report</B> opens <D to="reports">a printable write-up</D>.</P> },
    ],
  },
  {
    slug: 'statistics', title: 'How the lab decides', group: 'Experiments',
    tagline: 'Paired comparison, a 95% range for the average difference, and an effect size, in plain words.',
    keywords: ['statistics', 'confidence interval', 'ci', 'paired', 'effect size', 'cohen', 'p-value', 'significance', 'seed', 'median', 'percentile', 'student t'],
    sections: [
      { id: 'paired', title: 'Paired comparison', body: <P>For each random town the lab simulates the baseline and each option, then takes the <B>difference</B> between them. Because both ran in the same town, anything about that town (the seed, who lives where, who happens to bump into whom) cancels out, and only the effect of the change is left. That is why a modest number of towns is enough.</P> },
      { id: 'ci', title: 'The 95% range', body: <P>From the {`n`} differences the lab computes their average and a <B>95% confidence interval</B> using the Student-t distribution. If that range is entirely above or entirely below zero, the average difference is not explained by chance alone.</P> },
      { id: 'clear', title: 'What “clear” means', body: <>
        <P>A difference is called <B>clear</B> only when <i>both</i> are true:</P>
        <UL><li>its 95% range excludes zero, and</li><li>the average difference is at least the <i>smallest meaningful change</i> for that measure (0.02 for opinions and disagreement, 0.25 hours for the time until half knew).</li></UL>
        <P>The second rule stops the lab from announcing a “clear” effect that is statistically detectable but too small to matter.</P></> },
      { id: 'count', title: '“Same direction in 42 of 60 towns”', body: <P>The verdict also counts how many towns moved the same way as the average, how many moved the other way and how many did not change at all. This matters: an effect can be real on average while individual towns disagree, and the lab shows that instead of hiding it.</P> },
      { id: 'effect', title: 'Effect size', body: <P>“Small”, “moderate” or “large” is the standardised paired effect (the average difference divided by the spread of the differences, Cohen’s <i>d<sub>z</sub></i>): below 0.2 negligible, below 0.5 small, below 0.8 moderate, otherwise large. This measures how consistent the change is from town to town, not how large it is: a tiny shift that happens in every town can still read “large”. So the verdict also states the size of the change, and for opinion outcomes puts it on the −1 to +1 scale. A clear but small shift is real and modest.</P> },
      { id: 'bands', title: 'The chart bands', body: <P>At each moment the chart shows the <B>median</B> town and the range between the <B>10th and 90th percentile</B> of towns. So the band tells you how much towns differ from each other, which is a different question from whether two options differ on average.</P> },
      { id: 'not', title: 'What it does not do', body: <Callout kind="honest">There is no correction for looking at several comparisons at once, and the lab cannot tell you about anything the model does not contain. A “clear” result is a statement about <i>this model of a town</i>.</Callout> },
    ],
  },
  {
    slug: 'reports', title: 'Reports and sharing', group: 'Experiments',
    tagline: 'A printable write-up of any experiment or any single run, as a page, Markdown or PDF.',
    keywords: ['report', 'pdf', 'print', 'markdown', 'export', 'share', 'document', 'run report', 'single run'],
    sections: [
      { id: 'make', title: 'Making a report', body: <P>After a lab run, press <B>Make a report</B>. The page runs the same towns again from the experiment link and writes the document: the question, the news, the short answer, the chart on a white page, one finding per option, a numbers table, what each option actually was (including any changed resident, town or street plan) and how to read it all.</P> },
      { id: 'one-run', title: 'A report for one run', body: <><P>On the simulation screen, under <B>Save &amp; share</B>, press <B>Report</B>. It works at any moment, including for a run you have not saved, and it needs no wallet: the report is built in your browser from the scenario, the length and your interventions.</P><P>The page has the findings, a chart of who has heard the news and how the average opinion moves, the numbers at a glance, what was done, the key moments, and a few things residents said. A saved run also gets an address you can copy; a shared run's report opens for anyone who has its share link.</P></> },
      { id: 'clock', title: 'One clock everywhere', body: <P>The report, the CSV export and the event log all use the same clock. A row in the CSV is labelled with the time at the <i>start</i> of that ten-minute step, the same label that step's events carry. Durations such as “half the town knew” are counted from the moment the news breaks, exactly as the Experiment Lab counts them. If several residents tie for the most people informed, the report says they tied instead of picking one.</P> },
      { id: 'formats', title: 'Formats', body: <Table head={['Format', 'How']} rows={[['A page', 'Copy the address. Anyone who opens it sees identical numbers.'], ['PDF', 'Press “Print / save as PDF”. The toolbar disappears and the chart is drawn in print-friendly ink.'], ['Markdown', 'Press “Markdown” for a `.md` with the same sections, ready to paste into notes or a repository.']]} /> },
      { id: 'same', title: 'The page and the file always agree', body: <P>The report is built by one pure function from the batch of results, and the page and the Markdown both read from it, so they cannot say different things. A test checks that building it twice gives byte-identical output.</P> },
      { id: 'wording', title: 'Honest wording', body: <P>Every report states that it is a model of one small invented town and not a forecast, says how many towns it used, and explains what “clear difference” means for the measure used.</P> },
    ],
  },
]
