# Progressive AI SQL Assistant POC

The existing React/Vite chat UI now talks to a small Python API. The API uses
Vanna 2's OpenAI-compatible LLM service with DeepSeek, discovers the live
Databricks Gold schema, validates generated SQL, waits for explicit user
approval, and then returns actual Databricks rows to the chat.

The app currently queries only these five Gold tables in `workspace.default`:

- `gold_policy_reporting_summary`
- `gold_dim_policy_jacket`
- `gold_fact_policy_transaction`
- `gold_fact_coverage`
- `gold_fact_charge`

The standalone SQL-generation instructions are in
`backend/prompts/sql_generation.md`; changing the prompt does not require
editing Python source.

The knowledge-base document describes synthetic POC data and illustrative
business rules, not verified Progressive production data or accounting policy.
Live schema and query results take precedence. There are currently no
independently verified question-to-SQL examples in
`backend/verified_sql_examples.json`; it is intentionally empty. SQL patterns
in the knowledge base are not treated as verified until executed and reviewed.

## Local setup

1. Use Python 3.10 or newer and Node.js 18.20 or newer.
2. Copy `backend/.env.example` to `backend/.env` and add the DeepSeek key to
   `DEEPSEEK_API_KEY`. Keep the key in this server-only file; never use a
   `VITE_` prefix.
3. Install the backend packages:

   ```sh
   .venv/bin/python -m pip install -r backend/requirements.txt
   ```

   If you do not have `.venv`, create it with `python3 -m venv .venv` first.
4. Set `DATABRICKS_CLIENT_ID` and `DATABRICKS_CLIENT_SECRET` in `backend/.env`
   for a Databricks service principal. The app does not use browser sign-in.
   Grant the principal `CAN USE` on the configured SQL Warehouse and read-only
   access to the five approved Gold tables.
5. Start the API in one terminal:

   ```sh
   .venv/bin/python -m uvicorn backend.server:app --reload --port 8000
   ```

6. Start the React UI in another terminal:

   ```sh
   npm install
   npm run dev
   ```

   Open the Vite URL it prints. Vite forwards `/api` requests to the local
   FastAPI server.

Local development does not require an access code. The API does not return
results until an approved SQL query has been explicitly run from the UI.

## Vercel configuration

The React UI stays on Vercel; `api/chat.py` provides the Python serverless
endpoint. Vercel uses the root `requirements.txt` to install Python packages.
The function is configured for up to 60 seconds; confirm that the Vercel plan
allows this duration.
Configure these as **server-side Vercel Environment Variables** (Production,
Preview as appropriate). Do not add them as `VITE_*` variables:

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API secret |
| `DEEPSEEK_BASE_URL` | Usually `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | `deepseek-flash` by default |
| `DATABRICKS_SERVER_HOSTNAME` | Existing Databricks workspace host |
| `DATABRICKS_HTTP_PATH` | Existing SQL Warehouse HTTP path |
| `DATABRICKS_CLIENT_ID` | Databricks service-principal client ID |
| `DATABRICKS_CLIENT_SECRET` | Databricks service-principal OAuth secret |
| `APP_ACCESS_PASSWORD` | Shared POC access code shown to invited users |
| `APP_SESSION_SECRET` | Random signing secret, at least 32 characters |
| `APP_ENV` | Set to `production` |

Create a Databricks service principal for this app, grant it `CAN USE` on the
SQL Warehouse, and grant it only the `SELECT` privileges needed on the five
approved Gold tables. Store its client ID and secret in Vercel for deployment
and in `backend/.env` for local development. This is non-interactive OAuth
machine-to-machine authentication: it uses the client secret server-side and
does not open a browser tab.
Generate a long random `APP_SESSION_SECRET` and choose an access code to share
with authorized POC users. The password is exchanged for a short-lived,
HttpOnly, Secure, SameSite cookie; it is not saved in browser storage.

After setting variables, redeploy the Vercel project. Public deployments fail
closed when the access gate is not configured. Vercel environment variables
are read by the Python function only and are never bundled into React assets.

## Workflow and guardrails

1. The server reads current column names and types for the Gold tables from
   Databricks `DESCRIBE TABLE` metadata.
2. Vanna's `OpenAILlmService` sends the question and live schema to the
   configured DeepSeek-compatible endpoint. The server includes the relevant
   local POC business guidance and any reviewed examples in the prompt.
3. SQLGlot parses the generated statement as Databricks SQL. Only one SELECT
   against fully qualified allowlisted Gold tables is accepted. Dynamic table
   functions, other layers/catalogs, DDL/DML, multiple statements, and limits
   above 200 are rejected. A missing limit is set to 200.
4. The validated SQL is shown in the existing conversation UI. It is not
   executed until the user selects **Approve & run query**.
5. SQL is validated again server-side before Databricks execution. The
   warehouse statement timeout is 30 seconds; logs contain stage, duration,
   row count, and request ID, not credentials or result contents.

This is a shared-code POC access gate, not Progressive SSO or per-user
authorization. Keep production data out until Progressive-approved identity,
retention, and access controls are established.

## Verification

Run the SQL safety tests:

```sh
.venv/bin/python -m unittest discover -s backend/tests -v
```

Check that the frontend builds:

```sh
npm run build
```

To smoke-test the local model without sending business data:

```sh
.venv/bin/python -m backend.deepseek_client
```

For an end-to-end check, start both local servers, submit a question that can
be answered from a Gold table, inspect the validated SQL in the chat, approve
it, and confirm the returned rows and duration. A missing table permission,
credential, API key, or network route is shown as an error; the UI never fills
in invented results.
