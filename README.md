# BATCH — Unified AI Gateway, Smart Failover Router, Batch Engine & Craft Inspector

An experimental, zero-dependency Node.js 22+ unified AI gateway and developer workbench inspired by the complementary strengths of **OmniRoute** (multi-provider routing, combos, circuit breakers), **FreeLLMAPI** (free-tier aggregation + AES-256-GCM encrypted key vault), **Craft Anything** (clean-room workspace inspection & coding-agent bridge), and self-hosted infrastructure (**Ollama** + optional **Neko** WebRTC virtual browser + finite **GitHub Actions / GitLab CI / Bitbucket Pipelines** workflows).

---

## Key Capabilities

1. **Unified OpenAI & Anthropic Compatible Endpoints**
   - `POST /v1/chat/completions` (streaming SSE & non-streaming JSON)
   - `POST /v1/completions` (legacy autocomplete compatibility)
   - `POST /v1/messages` (Anthropic Messages compatibility for Claude Code & Anthropic SDKs)
   - `GET /v1/models` (auto-lists configured combos and active provider models)
2. **Smart Routing & Zero-Dropped-Request Resilience**
   - **Routing Combos** (`auto-free`, `coding-fast`, `local-unlimited`, `production-hybrid`, or custom) with `failover`, `round-robin`, and `lowest-latency` strategies.
   - **Circuit Breakers & `Retry-After` Respect**: On `429`, `401/403`, `5xx`, or timeouts, trips per-provider cooldowns and automatically fails over to the next healthy provider in your chain.
   - **Token-Bucket RPM Limiter**: Smoothly paces requests to stay within each provider's published quota.
   - **SQLite Response Cache**: Deterministic prompt caching (`X-Batch-Cache: HIT/MISS`) to reduce duplicate calls.
3. **Encrypted Key Vault (`AES-256-GCM`)**
   - Stores your single official API key per provider encrypted at rest in SQLite (`data/batch.db`), masked in all UI/API responses.
   - Pre-configured 2026 official catalog: **Groq**, **Google AI Studio (Gemini)**, **NVIDIA NIM**, **OpenRouter (`:free`)**, **Mistral**, **Cerebras**, **Hugging Face Inference Router (`router.huggingface.co/v1`)**, **OpenAI**, **Anthropic**, plus unlimited local engines (**Ollama**, **LM Studio**) and an offline **Sandbox Simulator**.
   - *(Note: GitHub Models was retired on July 30, 2026 and is intentionally excluded from active defaults.)*
4. **Concurrent Batch Execution Engine (`/api/batches` & CLI `run-file`)**
   - Execute multi-prompt JSONL / text batches with configurable concurrency (`1..8`), retry/backoff, per-item provider tracking, cancellation, and `.jsonl` export.
5. **Craft Clean-Room Inspector & MCP Server**
   - Built-in **MCP JSON-RPC 2.0 server** over both `stdio` (`npm run mcp`) and HTTP (`POST /mcp`).
   - Workspace structural inspector (`craft_inspect_workspace`) jailed cleanly to `BATCH_WORKSPACE_ROOT`.
   - Ready-to-copy client config generator for **OpenCode**, **Cursor**, **Continue**, **Claude Code**, and **OpenAI Python SDK**.
6. **Deterministic Micro Reflex Engine (`micro`, zero keys, zero network)**
   - Answers a narrow, machine-checkable family of tasks in **English and Arabic** — arithmetic with precedence, unit/temperature conversion, ordering, word counts, CSV→JSON, JSON extraction, reversal, dedupe.
   - 0 ms, 0 cost, fully offline, and it *refuses* open-ended prompts instead of inventing an answer.
7. **Deterministic Bench (`npm run bench`)** — 28 mechanically graded cases across 3 suites, with partial credit, p50/p95 latency, an anti-echo guard, and persisted runs. No LLM-as-judge.
8. **Failover Proof Lab (`npm run proof`)** — 8 scenarios / 34 assertions that run the *real* router (breaker + token bucket + cache + timeout) against scripted upstreams and assert on what actually happened.
9. **Legitimate CI/CD & Self-Hosted Docker + Neko Templates**
   - `deploy/ci/github-actions-batch.yml`, `deploy/ci/gitlab-ci.yml`, `deploy/ci/bitbucket-pipelines.yml` for **finite CI/CD batch tasks** (tests, code inspection, batch JSONL processing).
   - `deploy/docker/docker-compose.yml` for **self-hosting** `batch-gateway` + `ollama` (unlimited local tokens) + optional `m1k1o/neko` isolated WebRTC browser (`--profile browser`).

---

## Proof, Not Promises (works with zero API keys)

Everything in this section runs offline. That is deliberate: a resilience claim you
cannot reproduce is marketing, not engineering.

### 1. Deterministic Micro Reflex Engine — `micro`

A tiny, dependency-free "model" that is honest about its scope. It parses an explicit
command and answers it exactly; anything open-ended returns `MICRO_ENGINE_UNSUPPORTED`
plus instructions, never a fabricated answer.

```bash
curl -s localhost:20128/v1/chat/completions -H 'content-type: application/json' -d '{
  "model": "micro/batch-micro-v1",
  "messages": [{"role":"user","content":"احسب: ٢٥ × ٤"}]
}'
# => content: "100"
```

Supported commands (English and Arabic keywords): `CALC` / `احسب`, `CONVERT` / `حوّل`,
`SORT` / `رتّب`, `COUNT` / `عدد الكلمات`, `CSV2JSON`, `EXTRACT_JSON` / `استخرج`,
`REVERSE` / `اعكس`, `UNIQUE`. It is wired into the `local-unlimited` and
`offline-proof` combos, so routing, caching, SSE, batch jobs, Anthropic translation
and MCP can all be exercised end-to-end without a single key.

### 2. Model Bench — `npm run bench`

```bash
npm run bench                                   # default target: offline-proof
npm run bench -- --model offline-proof,sandbox-sim/batch-sim-v1   # comparison
npm run bench -- --suite arabic-first --json    # machine-readable
```

Three suites, 28 cases, all graded mechanically (`exact`, `numeric`, `sequence`,
`set_equals`, `json` subset, `regex`, `contains_all`). Two design decisions keep the
numbers honest:

- **Anti-echo guard** — an answer that repeats the prompt scores zero, so a provider
  cannot harvest points by reflecting the question back.
- **Partial credit** — a JSON answer with 3 of 4 correct keys scores 0.75, not 0 or 1.

Measured on this branch:

| Target | Pass | Score | p50 | p95 |
| --- | --- | --- | --- | --- |
| `offline-proof` (micro engine) | 28/28 (100%) | 100% | 0 ms | 1 ms |
| `sandbox-sim/batch-sim-v1` (echo) | 0/28 (0%) | 0% | 0 ms | 0 ms |

> **Scope warning:** a perfect bench score here means "follows explicit, checkable
> instructions". It is *not* a measure of general model quality, and the micro engine
> would fail any open-ended evaluation. Point the bench at real providers when you
> want a meaningful model comparison.

### 3. Failover Proof Lab — `npm run proof`

```bash
npm run proof            # human-readable, exit code 1 if any assertion fails
npm run proof -- --json  # full report
```

Scenarios (each runs the real `GatewayRouter`; only the network is scripted):

| Scenario | What it proves |
| --- | --- |
| `failover-429` | Quota exhaustion trips the breaker, `Retry-After` is honoured, the next provider serves the request |
| `auth-quarantine` | A revoked key opens a ~5-minute quarantine instead of being retried forever |
| `breaker-skip` | An open breaker is skipped with **zero** extra upstream calls |
| `total-outage` | Total failure returns an honest `502` with the full attempt trace |
| `timeout-failover` | A hung socket is abandoned at the deadline (`504`) and the request is rescued |
| `cache-short-circuit` | Identical deterministic prompts are served once, then from cache |
| `rate-paced` | The local token bucket skips a saturated provider before the upstream 429s |
| `half-open-recovery` | After cooldown, one probe closes the breaker and traffic returns home |

The suite ships with **negative controls** in `test/proof.test.mjs`: swapping in a
breaker that never trips, or disabling the timeout, makes the corresponding scenarios
fail. If the proof can't fail, it isn't proof.

### New surface area

| Interface | Command / endpoint |
| --- | --- |
| CLI | `npm run bench`, `npm run proof`, `batch bench --suite … --model …`, `batch proof` |
| HTTP | `GET /api/bench/suites`, `POST /api/bench/run`, `GET /api/bench/runs[/:id]`, `GET /api/proof/scenarios`, `POST /api/proof/run` |
| MCP | `batch_run_bench`, `batch_proof_lab` |
| Web UI | **Proof Lab & Bench** tab: run the suite, read every assertion, compare scorecards, browse past runs |

Both endpoints are bounded (`≤ 6` targets, `≤ 400` graded cases per run); batch jobs are
capped at 1000 items.

---

## Honest Scope & Responsible Use

- **Resilience vs. "Unlimited Free Cloud"**: Cloud free tiers (Groq, Gemini, OpenRouter, NVIDIA NIM, Mistral) enforce per-account quotas and rate limits. `BATCH` combines *your own* single official API keys behind automatic failover, caching, and rate pacing so workflows fail over cleanly instead of crashing—it does **not** bypass provider Terms of Service, rotate fake accounts, spoof TLS/device fingerprints, or circumvent model safety policies.
- **Truly Unlimited Throughput**: For unlimited token throughput with zero external rate limits, connect **local/self-hosted Ollama, LM Studio, or vLLM** via the `local-unlimited` combo or `deploy/docker/docker-compose.yml`.
- **CI/CD Templates**: Provided for finite automated CI workflows (tests, inspection, bounded batch jobs), not persistent background hosting or tunneling on free CI runners.

---

## Quick Start

```bash
# 1. Start the Gateway + Bilingual (EN/AR) Web Cockpit
npm start
# Dashboard: http://localhost:20128/

# 2. Run the automated test suite (30 tests, ~2.5s)
npm test

# 3. Prove failover + benchmark the built-in deterministic engine (no keys needed)
npm run proof
npm run bench

# 4. Inspect workspace or run CLI batch jobs
npm run cli -- doctor
npm run cli -- inspect .
npm run cli -- chat --model auto-free --prompt "Explain circuit breaker failover"

# 5. Run MCP server over stdio
npm run mcp
```

### Self-Hosted Docker Stack (Gateway + Ollama + Optional Neko Browser)

```bash
cd deploy/docker
docker compose up -d
# Pull a local unlimited model into Ollama:
docker exec -it batch-ollama ollama pull qwen2.5-coder:7b
# Optionally launch isolated Neko WebRTC browser workspace:
docker compose --profile browser up -d
```
