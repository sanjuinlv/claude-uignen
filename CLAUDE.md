# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Initial setup (install deps, generate Prisma client, run migrations)
npm run setup

# Development server (uses Turbopack)
NODE_OPTIONS='--require ./node-compat.cjs' next dev --turbopack
# or simply:
npm run dev

# Build and start production
npm run build
npm start

# Run tests
npm test                     # all tests
npx vitest run <file>        # single test file

# Database
npx prisma migrate dev       # apply migrations
npx prisma studio            # open DB browser
npm run db:reset             # reset database (destructive)
```

Requires `ANTHROPIC_API_KEY` in `.env` (falls back to a mock model if absent).

## Architecture

This is an AI-powered React component generator with live preview, built on Next.js 15 App Router.

### Request Flow

1. User types a prompt in the chat UI
2. Chat message POSTs to `/api/chat` with messages, current virtual file system state, and projectId
3. API constructs a system prompt (from `src/lib/prompts/generation.tsx`) and calls Claude via Vercel AI SDK (`streamText`)
4. Claude invokes **AI tools** to create/modify files:
   - `str_replace_editor` — view, create, str_replace, insert operations on files
   - `file_manager` — delete, move, list files
5. Tool calls update the **VirtualFileSystem** (in-memory, no disk writes)
6. Updated files are streamed back and reflected in the client-side `FileSystemContext`
7. `PreviewFrame` transforms files via Babel (JSX→JS) and renders them in a sandboxed iframe
8. For authenticated users, messages and file state are persisted to SQLite via Prisma

### Key Modules

| Path | Role |
|------|------|
| `src/app/api/chat/route.ts` | Main streaming chat endpoint; orchestrates AI + tools + persistence |
| `src/lib/provider.ts` | Wraps `@ai-sdk/anthropic`; includes `MockLanguageModel` fallback (no API key) |
| `src/lib/file-system.ts` | In-memory VirtualFileSystem with serialization support |
| `src/lib/tools/` | AI tool definitions (`str-replace-editor.ts`, `file-manager.ts`) |
| `src/lib/transform/jsx-transformer.ts` | Babel JSX transform + import map → preview HTML for iframe |
| `src/lib/contexts/file-system-context.tsx` | Client-side file state management (React context) |
| `src/lib/contexts/chat-context.tsx` | Chat message state management |
| `src/lib/auth.ts` | JWT session handling (jose, 7-day expiry, HttpOnly cookies) |
| `src/lib/prompts/generation.tsx` | System prompt sent to Claude for component generation |
| `src/middleware.ts` | Protects `/api/projects` and `/api/filesystem` routes |

### AI Model

- Default model: **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`)
- Max tokens: 10,000 | Max steps: 40 (real) or 4 (mock)
- Prompt caching enabled (ephemeral cache control on system prompt)
- Mock model generates static Counter/Form/Card components when no API key is set

### Preview Pipeline

`jsx-transformer.ts` handles the live preview:
1. Babel transforms JSX to `React.createElement` calls
2. Import map resolves React/ReactDOM from `esm.sh` and user files as blob URLs
3. Output is an HTML string rendered in a sandboxed iframe (`allow-scripts allow-same-origin`)

### Database Schema (SQLite via Prisma)

- **User**: `id`, `email`, `password` (bcrypt), → many Projects
- **Project**: `id`, `name`, `userId` (nullable — anonymous supported), `messages` (JSON), `data` (JSON file system snapshot)

### UI Layout

`src/app/main-content.tsx` is the top-level layout:
- Left panel: `ChatInterface` (message history + input)
- Right panel: tabbed `PreviewFrame` (live render) / `CodeEditor` (Monaco)
- Panels are resizable via `react-resizable-panels`

### Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json` and Vitest).

### UI Components

shadcn/ui ("new-york" style) with Tailwind CSS v4. Add new components via `npx shadcn@latest add <component>`.
