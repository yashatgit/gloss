// Seed a self-contained showcase document (the one used for the README
// screenshots): one article with Explain / More-context / Ask branches, a
// nested branch, and a whole-document discussion — all with pre-filled,
// realistic answers so no API key is needed to reproduce the screenshots.
//
//   GLOSS_DATA_DIR=/tmp/gloss-showcase node scripts/seed-showcase.mjs
//   GLOSS_DATA_DIR=/tmp/gloss-showcase pnpm dev   # then open the library
//
// Point GLOSS_DATA_DIR at a throwaway dir so your real library is untouched.
import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.GLOSS_DATA_DIR || '/tmp/gloss-showcase';
const docId = 'showcaseDoc1';
const dir = path.join(DATA, 'documents', docId);
fs.mkdirSync(dir, { recursive: true });

const MODEL = 'claude-sonnet-4-6';
const now = '2026-06-12T09:00:00.000Z';
// modest usage so per-reply cost badges + the dock total render realistically
const usage = (out) => ({
  input_tokens: 180,
  output_tokens: out,
  cache_read_input_tokens: 4200,
  cache_creation_input_tokens: 0,
});

const markdown = `# How Transformers Read

Before a language model can answer a question, it first has to *read* — and the way it reads is nothing like the way we do. There is no inner voice moving left to right across the page. Instead, the entire passage is taken in at once, every word looking at every other word, deciding what matters.

## Tokens, not words

The model never sees letters or words directly. Text is first chopped into **tokens** — chunks that are often whole words, but sometimes fragments like "ing" or "pre". Each token becomes a vector: a long list of numbers that encodes, in a rough sense, its meaning. Reading, for a transformer, is arithmetic on these vectors.

## Attention is the trick

The breakthrough that made modern models possible is the **attention** mechanism. For every token, the model asks a question — given who I am, which other tokens should I listen to? — and blends in their meaning accordingly. A pronoun like *it* can reach back across a sentence and pull meaning from the noun it refers to. Nothing tells the model that *it* points at the cat; attention learns to make that connection on its own.

Mechanically, each token produces three vectors: a query, a key, and a value. Queries are compared against keys to score how relevant every token is to every other, and those scores are used to mix the values together. Stacked dozens of times, this simple operation lets meaning flow freely across the whole passage.

## The context window

A model can only attend to what fits inside its **context window** — the maximum number of tokens it can hold at once. Everything inside the window is available simultaneously, in parallel; anything that falls outside it simply does not exist as far as the model is concerned. Growing this window is one of the central engineering battles in the field, because attention's cost rises sharply as the window grows.

## Why it feels like understanding

Put these pieces together and something surprising emerges. A system that only ever predicts the next token, trained on enough text, begins to behave as though it understands. It tracks characters across a story, holds a definition in mind while applying it, and notices when an argument contradicts itself. Whether that *is* understanding is a question philosophers will argue for years. What is certain is that it begins with reading — and reading, here, is attention.`;

const document = {
  id: docId,
  title: 'How Transformers Read',
  source: 'markdown',
  markdown,
  createdAt: now,
};

// ---- node ids ----
const docNode = 'nDocument01';
const bAttention = 'nBranchAtt1';
const bQkv = 'nBranchQkv1';
const bNested = 'nBranchDot1';
const bWindow = 'nBranchWin1';
const nDiscuss = 'nDiscuss001';

// helper to build a message
const um = (id, text) => ({ id, role: 'user', text, createdAt: now });
const am = (id, text, out) => ({
  id, role: 'assistant', text, createdAt: now, usage: usage(out), model: MODEL,
});

const nodes = [
  { id: docNode, kind: 'document', docId, position: { x: 0, y: 0 }, width: 720 },

  // 1) Explain — anchored on a phrase about all-pairs attention
  {
    id: bAttention, kind: 'branch', docId,
    position: { x: 900, y: 0 }, width: 430, height: 380,
    parentNodeId: docNode,
    anchor: {
      nodeId: docNode, start: 0, end: 0,
      quote: 'every word looking at every other word',
      prefix: '', suffix: '',
    },
    title: 'every word looking at every other word',
    messages: [
      um('m-att-u', 'Explain this.'),
      am('m-att-a', `It means there's **no fixed reading order**. Where you and I scan a sentence one word at a time, a transformer compares *all* the words to each other in a single step.

Concretely, for a 10-word sentence the model forms every one of the 10 × 10 word-to-word pairs and scores how much each word should pay attention to each other word. So when it processes "bank", it can look directly at "river" three words away — or at "money" ten words back — without having to pass information down a chain.

That all-at-once comparison is what lets meaning jump across long distances, and it's why the architecture is called a *Transformer* rather than a sequence reader.`, 138),
    ],
  },

  // 2) More context — anchored on query/key/value
  {
    id: bQkv, kind: 'branch', docId,
    position: { x: 900, y: 470 }, width: 450, height: 470,
    parentNodeId: docNode,
    anchor: {
      nodeId: docNode, start: 0, end: 0,
      quote: 'a query, a key, and a value',
      prefix: '', suffix: '',
    },
    title: 'a query, a key, and a value',
    messages: [
      um('m-qkv-u', 'Give me background and context for this.'),
      am('m-qkv-a', `These three vectors are the heart of attention. A useful analogy is **search**:

- **Query** — what this token is *looking for* ("I'm a pronoun, I need a noun").
- **Key** — what each other token *advertises about itself* ("I'm a singular noun").
- **Value** — the actual *content* a token contributes once it's been matched.

The model takes the query for one token and compares it against the key of every other token using a **dot product** — a single number measuring how well they line up. Those numbers become weights (after a softmax), and the output is a weighted blend of all the values.

So "attention" is really just: *form a search query, match it against every key, and average the values by how well they matched.* Learning happens in how those query, key, and value vectors are produced.`, 196),
    ],
  },

  // 3) Nested branch — selection inside the QKV answer
  {
    id: bNested, kind: 'branch', docId,
    position: { x: 1410, y: 540 }, width: 390, height: 320,
    parentNodeId: bQkv,
    anchor: {
      nodeId: bQkv, messageId: 'm-qkv-a', start: 0, end: 0,
      quote: 'dot product',
      prefix: '', suffix: '',
    },
    title: 'dot product',
    messages: [
      um('m-dot-u', 'What exactly is a dot product here?'),
      am('m-dot-a', `It's the simplest possible similarity score. Multiply the two vectors element by element, then add up the results — one number out.

If a query and a key point in the **same direction**, their dot product is large and positive: a strong match. If they're unrelated (roughly perpendicular), it's near zero. So "how much should token A attend to token B?" reduces to "how aligned is A's query with B's key?" — cheap to compute and easy to do for every pair at once on a GPU.`, 104),
    ],
  },

  // 4) Ask… — custom question on the context window
  {
    id: bWindow, kind: 'branch', docId,
    position: { x: 900, y: 990 }, width: 430, height: 360,
    parentNodeId: docNode,
    anchor: {
      nodeId: docNode, start: 0, end: 0,
      quote: 'context window',
      prefix: '', suffix: '',
    },
    title: 'context window',
    messages: [
      um('m-win-u', 'How big are context windows in practice today?'),
      am('m-win-a', `They've grown dramatically. A few years ago a few thousand tokens was typical; today frontier models commonly offer **100K–200K tokens**, and some go to **1M+** — enough to hold an entire book or a large codebase at once.

The catch is the one this section hints at: naive attention cost grows with the *square* of the window, so a 10× longer context is ~100× more work. Much of the recent research — sparse and sliding-window attention, KV-cache tricks, better positional encodings — exists to bend that curve so long windows stay affordable.`, 142),
    ],
  },

  // 5) Whole-document discussion (the new feature) — anchorless
  {
    id: nDiscuss, kind: 'branch', docId,
    position: { x: 1410, y: 0 }, width: 460, height: 440,
    parentNodeId: docNode,
    // no anchor → whole-document discussion
    title: 'Whole document',
    messages: [
      um('m-dis-u', 'What is the single most important idea to take away from this whole piece?'),
      am('m-dis-a', `**Reading, for a transformer, is attention.**

If you remember one thing, make it that. Everything else in the piece supports it:

1. Text becomes **tokens → vectors**, so reading is arithmetic.
2. **Attention** lets every token draw meaning from every other token in one parallel step (via query/key/value matching).
3. The **context window** bounds how much can be attended to at once.
4. Out of nothing but next-token prediction over that machinery, behaviour that *looks like* understanding emerges.

So the document's arc is: *we turn words into numbers, let attention route meaning between them, and comprehension-like behaviour falls out.* The whole essay is really one claim, unpacked.`, 188),
    ],
  },
];

const canvas = { nodes };

fs.writeFileSync(path.join(dir, 'document.json'), JSON.stringify(document, null, 2));
fs.writeFileSync(path.join(dir, 'canvas.json'), JSON.stringify(canvas, null, 2));
fs.writeFileSync(
  path.join(DATA, 'index.json'),
  JSON.stringify([{ id: docId, title: document.title, createdAt: now }], null, 2),
);

console.log('Seeded showcase data at', DATA);
