# Progressive AI SQL Assistant POC

A React UI prototype for an insurance-focused AI SQL assistant. It uses a
Progressive-inspired blue-and-white visual theme and remains a front-end-only
preview: it does not connect to Databricks or an AI model yet.

## Run locally

Node.js 18.20 or newer and npm are required. From the repository root:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

The welcome screen, responsive branded sidebar, new-chat action, local
conversation list, search filter, and message composer are interactive.
Submitted prompts appear in the conversation, followed by a clear note that
AI responses are not connected. No data or AI response is fabricated.

## Optional approved logo

The supplied Progressive Fleet logo is stored at
`public/assets/progressive-fleet-logo.png` and shown in the sidebar without
cropping or recoloring. To use another approved local logo path, set
`VITE_PROGRESSIVE_LOGO_PATH` in a local `.env` file.

The optional Progressive illustration footer loads from
`public/assets/sidebar-illustration.png`. It can be pointed to another local
Vite public asset with `VITE_SIDEBAR_ARTWORK_PATH`.
