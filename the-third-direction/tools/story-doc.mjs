// Writes docs/STORY.md: every story caption in order, straight from src/core/story.ts, so the doc can never drift.
//   node --experimental-strip-types tools/story-doc.mjs
import fs from 'fs';
import { STORY } from '../src/core/story.ts';

const tone = { thought: 'blob', warm: 'family', world: 'world' };
const q = (l) => `**${l.text}**  _(${tone[l.tone]})_`;
const timed = (arr) => arr.map((l) => `- ${l.at}s  ${q(l)}`).join('\n');
const o = STORY.opening;
const out = `# The story, line by line

Generated from [\`src/core/story.ts\`](../src/core/story.ts) by \`node --experimental-strip-types tools/story-doc.mjs\`. Edit the lines there, not here.
The monsters' own lines (guardians in \`src/forest/guardians/\`, bosses in \`src/act2/bosses/\`) are not in this file.

## The three voices
| voice | who | how it looks | example |
|---|---|---|---|
| **thought** | the blob | first person, sentence case, soft white | "Don't stop." |
| **family** | Mother and Father | sentence case, gold, always a memory | "Don't look up." |
| **world** | the forest and the dark | lower case, pale cyan, a little wrong | "the trees are not empty." |

Monsters speak in lower case with their own glow and never use "I" to the blob unless they mean it.

The arc: "Don't look up." (Mother keeps you safe) -> everyone you meet says some version of "stay" -> "Look up." (Mother, at the end) -> "I can look up now." (you).

## Act I: the forest
**Opening** (the clearing, then the slam)
- ${q(o.wake)}
- ${q(o.mother)}
- ${q(o.father)}
- ${q(o.crater)}
- ${q(o.bell)}
- ${q(o.move)}

**The crossroads**
- ${q(STORY.crossroads)}

**Name cards** (first step into each zone)
${Object.values(STORY.zones).map((z) => `- **${z.name}**: ${z.sub}`).join('\n')}

**First guardian wakes**
- ${q(STORY.guardianWakes)}

**When a zone falls** (X's shadow comes down), then the count
${Object.entries(STORY.falls).map(([k, l]) => `- ${k}: ${q(l)}`).join('\n')}
${STORY.hearts.map((l, i) => `- after heart ${i + 1}: ${q(l)}`).join('\n')}
- seal breaks: ${q(STORY.seal)}

**Hidden warmths** (secrets): ${STORY.secrets.map(q).join(' / ')}

**The Mournmoth is freed**: ${STORY.moth.map(q).join(' then ')}

**Mother, when it gets hard** (by number of falls): ${Object.entries(STORY.deaths).map(([n, l]) => `${n}: ${q(l)}`).join(' / ')}

**The Edge** (seconds after you reach it)
${timed(STORY.edge)}

## The boom (seconds from its start)
${timed(STORY.boom)}

## Act II: the arena
**First fight** (milliseconds after it begins)
${STORY.arena.map((s) => `- ${s.after}ms  ${q(s.line)}`).join('\n')}

**X falls**: ${q(STORY.xDies)}

**Between bosses**
${STORY.interlude.map((arr, i) => `After ${['X', 'The Collector'][i]}:\n${timed(arr)}`).join('\n\n')}

## The ending (seconds from the end of the last fight)
${timed(STORY.ending)}
`;
fs.writeFileSync(new URL('../docs/STORY.md', import.meta.url), out);
console.log('wrote docs/STORY.md', out.split('\n').length, 'lines');
