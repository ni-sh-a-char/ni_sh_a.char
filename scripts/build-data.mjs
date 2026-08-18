// Generates data/repos.json and data/ai.json.
// Zero dependencies: Node 18+ global fetch only.
import { readFile, writeFile } from 'node:fs/promises'

const ORG = 'ni-sh-a-char'
const EXCLUDE = [/^monsterrr-/i, /^\.github$/]

const GH_TOKEN = process.env.GITHUB_TOKEN
const AI_KEY = process.env.AI_API_KEY
const AI_BASE = process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1'

// Providers retire model names without warning, so pick one from the live
// catalogue rather than hardcoding a string that goes stale. Set AI_MODEL to pin.
const SKIP_MODEL = /whisper|tts|guard|embed|rerank|moderation|audio|transcribe/i
const PREFER = [/llama-3\.3-70b/i, /gpt-oss-120b/i, /llama-3\.1-70b/i, /kimi-k2/i,
                /qwen.*(32b|235b)/i, /llama-4/i, /70b/i, /instant/i]
let MODEL = process.env.AI_MODEL || ''

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ni-sh-a-char-site',
      ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}),
    },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}: ${await res.text()}`)
  return res.json()
}

async function allRepos() {
  const out = []
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/orgs/${ORG}/repos?per_page=100&type=public&sort=pushed&page=${page}`)
    if (!batch?.length) break
    out.push(...batch)
    if (batch.length < 100) break
  }
  return out.filter((r) => !r.private && !EXCLUDE.some((re) => re.test(r.name)))
}

async function readme(name) {
  const r = await gh(`/repos/${ORG}/${name}/readme`)
  if (!r?.content) return ''
  return Buffer.from(r.content, 'base64')
    .toString('utf8')
    .replace(/```[\s\S]*?```/g, ' ')           // drop code fences
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')     // drop images
    .replace(/<[^>]+>/g, ' ')                  // drop html
    .replace(/\s+/g, ' ')
    .slice(0, 4000)
}

const PROMPT = `You are writing the project page for an open-source organisation's website.
Given a repository's metadata and README, produce an honest, concrete, technical write-up.
Never invent features, licences, benchmarks or install commands that the source does not support.
If the README is thin, say what can be inferred from the name, language and description, and keep it short.
Reply with JSON only, matching exactly this shape:
{
  "tagline": "one punchy sentence, max 90 chars, no trailing period",
  "what": "2-3 sentences: what this project actually is",
  "why": "2-3 sentences: the problem it exists to solve and who it is for",
  "when": "2-3 sentences: when you would reach for it, and what state it is in",
  "stack": ["3-6 short technology or concept tags"],
  "highlights": ["3-4 short factual bullets, max 80 chars each"]
}`

async function pickModel() {
  if (MODEL) return MODEL
  const res = await fetch(`${AI_BASE}/models`, { headers: { Authorization: `Bearer ${AI_KEY}` } })
  if (!res.ok) throw new Error(`Cannot list models (${res.status}): ${await res.text()}`)
  const ids = (await res.json()).data
    .filter((m) => m.active !== false && !SKIP_MODEL.test(m.id))
    .map((m) => m.id)
  if (!ids.length) throw new Error('No usable chat models returned by the provider')
  MODEL = PREFER.map((p) => ids.find((id) => p.test(id))).find(Boolean) || ids[0]
  console.log(`model: ${MODEL}  (${ids.length} available)`)
  return MODEL
}

async function summarise(repo, text) {
  const body = {
    model: MODEL,
    temperature: 0.4,
    max_tokens: 900,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PROMPT },
      {
        role: 'user',
        content: [
          `Repository: ${repo.name}`,
          `Description: ${repo.description || '(none)'}`,
          `Primary language: ${repo.language || 'unknown'}`,
          `Topics: ${(repo.topics || []).join(', ') || '(none)'}`,
          `Homepage: ${repo.homepage || '(none)'}`,
          `Is a fork: ${repo.fork}`,
          `Created: ${repo.created_at?.slice(0, 10)}  Last pushed: ${repo.pushed_at?.slice(0, 10)}`,
          '',
          `README (truncated):`,
          text || '(no README)',
        ].join('\n'),
      },
    ],
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${AI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify(body),
    })
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 4000 * (attempt + 1)
      console.log(`  rate limited (${res.status}), waiting ${wait}ms`)
      await sleep(wait)
      continue
    }
    if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`)
    const json = await res.json()
    return JSON.parse(json.choices[0].message.content)
  }
  throw new Error('AI retries exhausted')
}

const load = async (p, fallback) => {
  try { return JSON.parse(await readFile(p, 'utf8')) } catch { return fallback }
}

const repos = await allRepos()
console.log(`${repos.length} public repos kept`)

const slim = repos.map((r) => ({
  name: r.name,
  description: r.description,
  html_url: r.html_url,
  homepage: r.homepage?.trim() || null,
  language: r.language,
  topics: r.topics || [],
  stars: r.stargazers_count,
  forks: r.forks_count,
  open_issues: r.open_issues_count,
  is_fork: r.fork,
  archived: r.archived,
  license: r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null,
  size: r.size,
  created_at: r.created_at,
  pushed_at: r.pushed_at,
  default_branch: r.default_branch,
}))

await writeFile('data/repos.json', JSON.stringify({ generated_at: new Date().toISOString(), org: ORG, repos: slim }, null, 1))

const ai = await load('data/ai.json', {})
if (!AI_KEY) {
  console.log('AI_API_KEY not set - keeping existing summaries')
} else {
  await pickModel()
  let done = 0
  let failed = 0
  for (const repo of repos) {
    const sig = `${repo.pushed_at}|${repo.description || ''}|${MODEL}`
    if (ai[repo.name]?.sig === sig) continue
    try {
      const text = await readme(repo.name)
      const summary = await summarise(repo, text)
      ai[repo.name] = { sig, ...summary, model: MODEL, at: new Date().toISOString() }
      console.log(`  wrote ${repo.name}`)
      if (++done % 10 === 0) await writeFile('data/ai.json', JSON.stringify(ai, null, 1))
      await sleep(1500)
    } catch (err) {
      failed++
      console.error(`  FAILED ${repo.name}: ${err.message}`)
    }
  }
  console.log(`${done} summaries regenerated, ${failed} failed`)
  // A run where nothing succeeded is a broken run, not a quiet one.
  if (failed && !done) {
    await writeFile('data/ai.json', JSON.stringify(ai, null, 1))
    throw new Error(`every summary failed (${failed}) — check the model name and API key`)
  }
}

// prune summaries for repos that no longer exist
const live = new Set(repos.map((r) => r.name))
for (const key of Object.keys(ai)) if (!live.has(key)) delete ai[key]

await writeFile('data/ai.json', JSON.stringify(ai, null, 1))
console.log('done')
