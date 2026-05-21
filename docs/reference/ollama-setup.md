# Ollama Setup Reference

> Concrete deployment steps for the V1 hardware target: Lenovo Legion desktop,
> Windows, Intel i7, NVIDIA RTX 3060 (12GB VRAM), 16GB system RAM. AI developers
> reading this should assume this hardware exists and is set up by the human
> before any code is run against it.

## Models to expect installed

| Model | Use | VRAM | Speed on RTX 3060 |
|---|---|---|---|
| `llama3.1:8b` | Chat, Q&A, summarization, briefing | ~7GB | 30–60 tok/s |
| `llama3.2:3b` | Tagging, titling, action items | ~3GB | 70–120 tok/s |
| `nomic-embed-text` | Embeddings (768-dim) | ~0.5GB | Batch ~1000 texts/sec |

## Endpoint URL pattern

The user's Ollama is reached via Tailscale Funnel at:

```
https://legion.<tailnet>.ts.net
```

(Replace `<tailnet>` with the user's actual Tailscale tailnet name.)

This URL goes into `users_profile.ai_prefs.ollama_endpoint`.

## Required Ollama API surface

| Endpoint | Use |
|---|---|
| `GET /api/tags` | List installed models. M15 calls this on Test Connection. |
| `POST /api/chat` | Chat (with messages array). Stream=true returns NDJSON. |
| `POST /api/generate` | Single-turn generation. |
| `POST /api/embed` | Generate embeddings. |

## Streaming format (Ollama)

Unlike OpenAI/Anthropic's SSE, Ollama returns NDJSON:

```
{"model":"llama3.1:8b","created_at":"...","message":{"role":"assistant","content":"Hello"},"done":false}
{"model":"llama3.1:8b","created_at":"...","message":{"role":"assistant","content":" world"},"done":false}
{"model":"llama3.1:8b","created_at":"...","done":true,"total_duration":...,"prompt_eval_count":...,"eval_count":...}
```

The OllamaAdapter must:
1. Parse NDJSON line-by-line.
2. Map to provider-neutral `AIChunk` events.
3. Convert the final `done:true` chunk into a Done event with token counts.

## Environment variables on the Legion

| Var | Value | Why |
|---|---|---|
| `OLLAMA_HOST` | `0.0.0.0:11434` | Listen on all interfaces (Tailscale needs this). |
| `OLLAMA_KEEP_ALIVE` | `30m` | Keep models loaded — chat feels instant. |
| `OLLAMA_NUM_PARALLEL` | `2` | Concurrent requests (chat + embed). |
| `OLLAMA_MAX_LOADED_MODELS` | `3` | Keep 3 models warm (fits in 12GB). |
| `OLLAMA_FLASH_ATTENTION` | `1` | Faster inference on RTX 3060. |

## Reachability via Tailscale Funnel

On the Legion:

```
tailscale funnel 11434
```

This exposes Ollama at the HTTPS Tailscale Funnel URL. Funnel auto-handles
TLS termination and only allows traffic from the user's tailnet.

## Prompting notes (open-weight models)

llama3.1:8b is more sensitive to prompt structure than Claude. Tips:

- Use explicit role tags in the system prompt.
- Bullet-pointed instructions; avoid paragraphs of guidance.
- Include 1–2 few-shot examples for tasks that need structured output.
- For tagging/titling, use JSON-mode-style enforcement (literally instruct
  "Respond with only valid JSON. No prose.").
- Lower temperature (0.2–0.5) for structured outputs; higher (0.7) for chat.

## Failure modes the adapter must handle

| Failure | What user sees | Adapter behavior |
|---|---|---|
| Legion off / Tailscale down | "Cannot reach your AI." | Surface actionable error; offer 'Retry' button. |
| Model not pulled | "Model llama3.1:8b not found." | Suggest `ollama pull llama3.1:8b`. |
| Out of VRAM | "Model is loading or VRAM is full." | Retry once after 5s; on second failure, surface to user. |
| Slow first response | "Warming model…" indicator | Show after 1.5s; first-token timeout 30s. |
