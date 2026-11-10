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
6. **Legitimate CI/CD & Self-Hosted Docker + Neko Templates**
   - `deploy/ci/github-actions-batch.yml`, `deploy/ci/gitlab-ci.yml`, `deploy/ci/bitbucket-pipelines.yml` for **finite CI/CD batch tasks** (tests, code inspection, batch JSONL processing).
   - `deploy/docker/docker-compose.yml` for **self-hosting** `batch-gateway` + `ollama` (unlimited local tokens) + optional `m1k1o/neko` isolated WebRTC browser (`--profile browser`).

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

# 2. Run the automated test suite
npm test

# 3. Inspect workspace or run CLI batch jobs
npm run cli -- doctor
npm run cli -- inspect .
npm run cli -- chat --model auto-free --prompt "Explain circuit breaker failover"

# 4. Run MCP server over stdio
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
