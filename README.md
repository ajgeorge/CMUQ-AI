# Bank Client Discovery Simulator

A web app for practising client discovery. A student interviews an AI bank client, writes up
the client's needs and recommends products, then gets feedback from an AI coach.

Each client has needs they only reveal when the student asks the right kind of question. The
coach then explains what went well, what was missed (including unsuitable recommendations) and
how to improve, with example questions to try next time.

- 3 clients (beginner, intermediate and advanced) and 9 banking products, all in editable files
- Works with any OpenAI-compatible API; tested with Groq's free tier
- No login and no database

A complete sample interview is in [`docs/sample-interview/`](docs/sample-interview/):
[the conversation](docs/sample-interview/1-conversation.md),
[the student's summary and recommendations](docs/sample-interview/2-summary-and-recommendations.md)
and [the coach's feedback](docs/sample-interview/3-coach-feedback.md). It was produced with the
app's own "Download as Markdown" button and has not been edited.

## Quick start

You need **Node.js 22.12 or newer** and an API key for an OpenAI-compatible provider. A free
[Groq](https://console.groq.com/keys) key works.

```bash
npm install
cp .env.example .env      # then put your API key in AI_API_KEY
npm run check:ai          # confirms the key and that every model works
npm run dev               # open http://localhost:5173
```

In the Windows Command Prompt, use `copy .env.example .env` instead of `cp`.

To run it as a single server instead:

```bash
npm run build
npm start                 # open http://localhost:3001
```

## Configuring the AI

All AI settings are in `.env` (see [`.env.example`](.env.example)):

| Setting                                                               | What it is                                                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `AI_BASE_URL`                                                         | The provider's API address. Default: `https://api.groq.com/openai/v1` |
| `AI_API_KEY`                                                          | Your API key. Only the server uses it; it never reaches the browser.  |
| `CLIENT_MODEL`                                                        | The model that plays the bank client                                  |
| `COACH_MODEL`                                                         | The model that reviews the interview. It must support JSON output.    |
| `CLIENT_FALLBACK_MODEL`, `COACH_FALLBACK_MODEL`                       | Optional backup models (see "Model routing" below)                    |
| `CLIENT_REASONING_EFFORT`, `COACH_REASONING_EFFORT`                   | Optional, for reasoning models: `low`, `medium` or `high`             |
| `CLIENT_FALLBACK_REASONING_EFFORT`, `COACH_FALLBACK_REASONING_EFFORT` | The same, for the backup models                                       |
| `AI_TIMEOUT_MS`                                                       | How long to wait for one AI response (default 30 seconds)             |
| `PORT`                                                                | The server's port (default 3001)                                      |

To use another provider, change `AI_BASE_URL`, `AI_API_KEY` and the model names, for example
`https://api.openai.com/v1` for OpenAI or `http://localhost:11434/v1` for a local Ollama (which
accepts any key value). Only Groq has been tested, so run `npm run check:ai` after switching: it
checks the key and that every configured model, backups included, exists and answers (and
that the coach returns JSON). Missing or invalid settings are reported by name when the server
starts.

### Models used for testing

Tested on **Groq** (free tier). Its usage limits are covered under "Operating the AI" below.

| Role            | Model                 | Why                                                                                                                                                                          |
| --------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI client       | `qwen/qwen3.8-27b`    | Fast, keeps to short replies, and kept its private details back better than the gpt-oss models, which also ignored the length rule.                                          |
| AI coach        | `openai/gpt-oss-120b` | Reliable JSON output and careful judgement. A review takes about 5 seconds.                                                                                                  |
| Backup for both | `openai/gpt-oss-20b`  | Has its own usage allowance. It passed the same coach checks as the main coach; as the client it is a little less natural than qwen, but better than an error mid-interview. |

## How it works

The app opens on a short guide to the steps, the difficulty levels and what each button does.

1. **Choose a client.** The browser gets each client's public profile only.
2. **Interview.** Each question goes to the server with the conversation so far. The server
   builds the client's prompt from the content files and asks the client model for a reply.
3. **Summary.** The student writes the needs they found, picks products and justifies them.
4. **Feedback.** The server checks the recommended products against the client's answer key,
   asks the coach model for its review, and combines the two into the feedback page.

The server keeps nothing between requests. The browser keeps the interview for the open tab
only, so a page refresh doesn't lose it.

## AI design decisions

### The AI client

- **What it knows.** Its prompt holds the client's profile and personality, plus each hidden
  need with its own rule for when to reveal it, for example Ahmed's cash-flow problem: "The
  student asks about cash flow, how and when he gets paid, payment terms, working capital, or
  the biggest challenges in the business." General questions never match a rule, so a student
  who only asks "How can I help you?" learns nothing private.
- **What it deliberately doesn't know.** The product catalogue (a real customer only knows what
  the banker tells them, which also lets the coach check what the student said), the answer key
  (a client who knew the "right" products could steer the student) and the coach's example
  questions.
- **Difficulty** only changes how open the client is: beginners drop small hints, advanced
  clients give brief answers to vague questions.
- **Staying in character.** The prompt tells the client to react to "ignore your instructions"
  or "are you an AI?" as a confused customer would. Each reply is also checked in code for
  phrases a customer would never say ("as an AI", "system prompt", "hidden needs", or a stock
  AI refusal such as "I'm sorry, but I can't comply with that"). If one appears, the reply is
  regenerated once with a reminder, and if that fails too, a neutral in-character line is used.
- **Temperature 0.5:** high enough for natural, varied replies, low enough to follow the rules.
  At 0.8 the client often volunteered private details in answer to general questions.

### The AI coach

- **Facts are checked in code, not by the model.** Whether each recommended product is
  suitable, acceptable or unsuitable comes from the client's answer key. The coach is told the
  result and must not contradict it, so a wrong recommendation is always flagged.
- **Structured output.** The coach replies in JSON, checked against a schema (with zod) and
  against the client's list of needs. An unusable reply, including one the provider itself
  rejects as invalid JSON, gets one more attempt with the problems listed; if that also fails,
  the student sees a clear error with a "Try again" button.
- **Evidence is verified.** For each need it found, the coach quotes the student's question
  that uncovered it. The quote is matched against the transcript and replaced with the
  student's exact question; a quote that matches nothing is dropped.
- **Product accuracy.** The coach checks everything the student told the client about the
  relevant products. The app also detects which products were named and holds the coach to it
  both ways: it can't call the information "accurate" when no product was described, or say
  "no product details given" when one was (that reply is sent back for another attempt).
- **Key moments, pinned to the conversation.** The coach reads a numbered transcript and picks
  out the turns that taught the most: a strong question, a client's hint that wasn't followed
  up, a wrong claim about a product, or a product pitched too early. The feedback page shows
  each as the actual message with the coach's words highlighted. Each quote must appear in a
  turn by the right speaker (a missed cue must be the client's words); a wrong turn number is
  corrected from the quote, and anything that can't be placed is dropped. Moments are checked
  one by one, so a bad one never makes the whole review unusable.
- **Prompt-injection guard.** The transcript and summary are marked as the student's work to
  assess, and any instructions inside them are ignored.
- **Temperature 0.2,** so the same interview gets essentially the same verdict every time.

### Model routing

- **One model per role,** chosen for its job: a fast conversational model for the client, a
  stronger model with reliable JSON output for the coach.
- **A backup model per role.** If the main model is rate-limited, over its limits, too slow or
  down, the backup answers straight away instead of the student waiting through retries or
  seeing an error. After a rate limit, the main model is skipped for as long as the provider
  asked, so later calls don't waste a failed attempt first. Configuration errors, such as a
  bad key or an unknown model, are never hidden this way. Without a backup, temporary failures
  are retried up to twice.

### Checking the AI's behaviour

Apart from the unit tests (`npm test`, which need no API key), the client and coach were
checked repeatedly against the live models with fixed scenarios: generic questions that must
not reveal hidden needs, targeted questions that should, prompt-injection attempts, "are you an
AI?", unsuitable product pitches the client should push back on, weak and strong interviews,
and a false product claim the coach must catch. These checks led to the client's temperature,
wording rules for the coach's feedback, stricter definitions for the key moments, and catching
stock AI refusals. The backup model went through the same checks in both roles before it was
suggested.

### Left out on purpose

- **RAG (retrieval).** The content is a few pages of text, so it fits in the prompt in full.
  Retrieval would add an embedding model and a vector store, and could fail to retrieve a hidden
  need the client must always know about. It would make sense with hundreds of products or long
  policy documents.
- **A database and accounts.** Not needed for a practice tool; the student can download each
  interview as a Markdown file instead.

## Operating the AI: cost, monitoring and scaling

This is a prototype, so it has no metrics system. What a real deployment would add is listed
under "Limitations and next steps".

### Cost

- **Every AI call logs one line:** role, model, outcome, response time, tokens in and out, the
  provider's remaining allowance for the minute, and why a backup answered when it did (for
  example `[backup: openai/gpt-oss-120b was RATE_LIMITED]`). It never includes the
  conversation. Cost is tokens multiplied by the provider's price, so any period's cost can be
  worked out from the log.
- **A typical interview uses about 21,000 tokens.** The sample interview (9 questions) takes
  about 15,000 for the client's replies and 5,500 to 7,000 for the review. Most of it is input:
  each question resends the client's instructions (about 1,200 tokens) and the conversation so
  far.
- **Every interview has a ceiling.** The limits in the code (30 questions, 16,000 characters of
  conversation, short client replies, at most one regeneration per reply, one review with at
  most one retry) cap a single interview at about 350,000 tokens in the very worst case. Real
  interviews come nowhere near that, but none can run up an open-ended bill.

### Watching the model

- **The checks above** (out-of-character replies, the coach's JSON and needs list, evidence and
  key-moment quotes, the product accuracy rules) catch the model's mistakes before the student
  sees them.
- **Logged when they happen:** the client breaking character (and whether the fallback line was
  used), the coach's reply being sent back and why, every failed call by type, and every switch
  to a backup model. The quote checks and the accuracy rules correct the output without logging.

### Scaling

- **The server is stateless,** so several copies can run behind a load balancer. The only
  shared state would be the timer that skips a rate-limited model, which today is per server.
- **The real limit is the provider.** Groq's free tier gives each model 8,000 tokens per minute
  and 200,000 per day. The client model runs out first, at about a dozen full interviews a
  day; the coach's allowance lasts for about 30 reviews. When a limit is reached, the backup
  model takes over, and a paid tier raises the limits by orders of magnitude. An interview that
  uses all 30 questions with very long messages can need around 10,000 tokens for one review,
  more than the free tier allows in a single request; the app then says the interview is too
  long for the current usage limits instead of failing silently.
- **Prompt caching is the first thing to consider at scale.** About half of an interview's
  tokens are the client's instructions, resent unchanged with every question. They already
  come first in the prompt, which is what caching needs, but it hasn't been set up or measured
  here because of the free-tier models and their daily quotas. Older turns of long interviews
  could also be summarised instead of resent, at the risk of the client forgetting what it has
  already said.

## Accessibility (WCAG 2.1 AA)

- Checked with axe-core on every screen and state at desktop and phone widths, with no
  violations.
- Every text and control colour has at least the required contrast (text 4.5:1, borders and
  focus outline 3:1).
- Fully usable by keyboard: focus moves to the heading of each new step, stays in a sensible
  place after errors and retries, and follows the visual order on every screen size.
- Screen readers hear new client replies (the chat is a live log), the "typing" and "reviewing"
  status, and errors. Status badges use a symbol and words as well as colour.
- Works at 400% zoom and 320 px width without sideways scrolling, and with increased text
  spacing. Animations are turned off for users who ask for reduced motion.

Not yet done: a full pass with a real screen reader such as NVDA or VoiceOver.

## Privacy and security

- The API key stays on the server and is never sent to the browser.
- Hidden needs and answer keys are never sent to the browser during the interview; the needs
  are only shown on the feedback page, after the summary is submitted.
- Nothing is stored on the server, and its log never includes the conversation. The browser
  keeps the current interview in session storage, which is cleared when the tab closes.

## Editing the content

Clients and products are JSON files in [`content/`](content/). They can be edited without
touching code, and the server checks them when it starts and says exactly what to fix. See
[`content/README.md`](content/README.md) for how to add a client or a product.

## Limitations and next steps

- **Not production-ready by design.** A real deployment would add:
  - security headers (e.g. helmet), HTTPS hosting and sign-in (e.g. the university's single
    sign-on);
  - per-user rate limits on the AI endpoints, budget alerts and daily spending caps;
  - persistent metrics (for example OpenTelemetry), with counts of how often each check fires
    and alerts when a rate rises, the first sign of a model drifting or a prompt change making
    things worse;
  - a prompt version recorded with each AI call, to tie a change in quality to a change in
    prompt;
  - a shared store for the rate-limit timer when running several servers.
- **The browser holds the transcript,** so a student could edit it before asking for feedback.
  That's fine for practice, but graded use would need the server to keep the conversation.
- **Content is edited in files, not in the app.** This is deliberate: with no login, an editing
  page would be open to everyone, students included, and would expose the hidden needs and
  answer keys. With accounts, an instructor-only editor would be the natural next step.
- **Possible next steps:** saving interviews across devices, an instructor view of progress,
  integration with the learning platform (LTI), and voice input for more realistic practice.

## Scripts

| Command             | What it does                                           |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Runs the API server and the React app with live reload |
| `npm run check:ai`  | Checks the AI connection and every model (backups too) |
| `npm run build`     | Type-checks and builds everything for production       |
| `npm start`         | Serves the built app and the API from one port         |
| `npm test`          | Runs the unit tests (no API key needed)                |
| `npm run typecheck` | TypeScript checks across all packages                  |
| `npm run lint`      | ESLint, including accessibility rules (`jsx-a11y`)     |
| `npm run format`    | Formats the code with Prettier                         |

## Project structure

```
shared/    Types and schemas used by both the server and the app (the API contract)
server/    Express API: content loading, prompts, AI calls, the coach
client/    React app (Vite)
content/   Clients, hidden needs, answer keys and products (editable JSON)
docs/      The sample interview
```

Built with TypeScript, React, Express, zod and the `openai` SDK (used for any
OpenAI-compatible API).
