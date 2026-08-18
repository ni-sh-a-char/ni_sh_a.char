# ni_sh_a.char — organisation website

The public site for the [ni_sh_a.char](https://github.com/ni-sh-a-char) organisation.
Live at **https://ni-sh-a-char.github.io/ni_sh_a.char/**

It lists every public repository in the organisation, with an AI-written breakdown of
what each project is, why it exists and when you would use it.

## How it works

Static HTML, CSS and JavaScript. No framework, no build step, no bundler — GitHub Pages
serves the files as they are.

```
index.html              the whole page
assets/style.css        styles
assets/app.js           repo index, filtering, search, detail dialog
data/repos.json         generated repository snapshot
data/ai.json            generated project write-ups
scripts/build-data.mjs  generator (Node 18+, zero dependencies)
```

**New repositories appear on their own.** The page renders `data/repos.json` instantly,
then makes one unauthenticated call to the GitHub API to pick up anything published since
the last rebuild. If that call is rate limited or the visitor is offline, the snapshot
already on screen stands.

Repositories matching `monsterrr-*` and the `.github` meta repository are filtered out —
in the generator and again in the browser.

## AI summaries

`.github/workflows/refresh-data.yml` runs daily, regenerates `data/repos.json`, and asks a
free LLM to write up any repository whose `pushed_at` or description changed since last
time. Unchanged repositories are served from cache, so a normal run costs a handful of
API calls.

The API key lives in GitHub Actions secrets and is never shipped to the browser.

### Setup

1. Get a free API key from [console.groq.com](https://console.groq.com/keys).
2. Add it as a repository secret named `AI_API_KEY`
   (`Settings → Secrets and variables → Actions → New repository secret`).
3. Run the workflow once from the Actions tab.

Any OpenAI-compatible provider works. To use OpenRouter instead, add two repository
*variables*:

| Variable      | Value                                     |
| ------------- | ----------------------------------------- |
| `AI_BASE_URL` | `https://openrouter.ai/api/v1`            |
| `AI_MODEL`    | `deepseek/deepseek-chat-v3-0324:free`     |

## Running locally

```sh
node scripts/build-data.mjs     # optional: refresh data/
python -m http.server 8000      # any static server
```

Then open <http://localhost:8000>. A server is required — `file://` blocks the `fetch`
calls that load `data/`.

## Contributing

Open an issue. Bug reports, unclear documentation, and questions are all useful and none
of them require writing code. For anything that doesn't belong in a public thread:
**piyushmishra.professional@gmail.com**
