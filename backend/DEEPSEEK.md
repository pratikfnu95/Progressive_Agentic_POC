# DeepSeek configuration

The POC uses Vanna 2.0's `OpenAILlmService`, configured with DeepSeek's
OpenAI-compatible Chat Completions endpoint. Vanna receives the question,
live Databricks Gold schema, POC business guidance, and any reviewed SQL
examples. Its response is validated before it is shown for user approval.

- Key label in the provider console: `ProgressivePOC` (a label only; not sent in API requests)
- Base URL: `https://api.deepseek.com`
- Endpoint: `/chat/completions`
- Default model: `deepseek-flash`
- Server environment variable: `DEEPSEEK_API_KEY`

DeepSeek's current quick-start recommends `deepseek-flash`. The older `deepseek-chat` model ID was scheduled for retirement on July 24, 2026, so this project uses the current model name instead.

## Local smoke check

1. Revoke the key previously pasted into chat and create a replacement.
2. Copy `backend/.env.example` to `backend/.env` and put the replacement only in `DEEPSEEK_API_KEY`.
3. Install backend dependencies with `.venv/bin/python -m pip install -r backend/requirements.txt`.
4. Run `.venv/bin/python -m backend.deepseek_client` for the fixed greeting
   smoke test. For a live Vanna SQL-generation check, use the end-to-end steps
   in the root `README.md`.

The `.env` file is ignored by Git. Never commit it, print the key, or use a `VITE_` prefix. For Vercel, add `DEEPSEEK_API_KEY` as a server-side Secret environment variable and redeploy.

The sample test sends only a fixed greeting request; it does not send policy
data. SQL generation sends the user's question, live column metadata, and the
local POC business guidance to DeepSeek. It does not send Databricks result
rows during generation.

References: [DeepSeek API quick start](https://api-docs.deepseek.com/quick_start/agent_integrations/) · [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/) · [DeepSeek API changelog](https://api-docs.deepseek.com/updates/)
