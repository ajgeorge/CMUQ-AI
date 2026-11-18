# Bank Client Discovery Simulator

A web app for practising client discovery interviews: interview an AI bank client, recommend
products, and receive feedback from an AI coach.

> 🚧 Work in progress — full documentation will be added as the project is completed.

## Quick start

Requirements: **Node.js 22.12 or newer**.

```bash
npm install
cp .env.example .env   # then add your API key and model names
npm run dev            # client on http://localhost:5173, API on http://localhost:3001
```

## Scripts

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Runs the API server and the React client with reload |
| `npm run build`     | Type-checks and builds everything for production     |
| `npm start`         | Serves the built app and API from one port           |
| `npm run typecheck` | TypeScript checks across all workspaces              |
| `npm run lint`      | ESLint, including accessibility rules (`jsx-a11y`)   |
| `npm run format`    | Formats the code with Prettier                       |
| `npm test`          | Runs the test suite                                  |

## Project structure

```
shared/   Types and schemas shared by server and client (the API contract)
server/   Express API — content, AI calls, and serving the built client
client/   React (Vite) front end
```
