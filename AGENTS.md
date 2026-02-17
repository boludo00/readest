# Readest

Readest is an open-source, cross-platform ebook reader designed for immersive reading experiences. Built as a modern rewrite of [Foliate](https://github.com/johnfactotum/foliate), it uses Next.js and Tauri v2 to deliver a unified experience across macOS, Windows, Linux, Android, iOS, and the Web. Key features include multi-format support (EPUB, MOBI, PDF, etc.), annotations, TTS, speed reading (RSVP), AI chat with RAG, X-Ray entity analysis, chapter recaps, translations, and cloud sync.

**Key Links:** [Website](https://readest.com) | [Web App](https://web.readest.com) | [Discord](https://discord.gg/gntyVNk3BJ) | [GitHub](https://github.com/readest/readest)

## Tech Stack

| Layer            | Technology            | Version   | Purpose                              |
| ---------------- | --------------------- | --------- | ------------------------------------ |
| Runtime          | Node.js               | 22.x      | JavaScript runtime                   |
| Package Manager  | pnpm                  | 10.x      | Monorepo package management          |
| Framework        | Next.js               | 16.x      | React framework with SSG/SSR         |
| UI Library       | React                 | 19.x      | Component framework                  |
| Desktop/Mobile   | Tauri                 | 2.x       | Cross-platform native wrapper        |
| Language         | TypeScript            | 5.x       | Strict mode enabled                  |
| Backend Language | Rust                  | 1.77+     | Tauri backend and plugins            |
| State            | Zustand               | 5.x       | Lightweight state management         |
| Styling          | Tailwind CSS          | 3.x       | Utility-first CSS                    |
| UI Components    | Radix UI + DaisyUI    | -         | Accessible primitives + themes       |
| Auth & Database  | Appwrite              | 22.x      | Authentication, database, cloud sync |
| Testing          | Vitest                | 4.x       | Unit testing                         |
| Linting          | ESLint + Prettier     | 9.x / 3.x | Code quality and formatting          |
| Deployment       | Cloudflare (OpenNext) | -         | Web app hosting                      |

### Key Dependencies

- **UI:** `@radix-ui/*` (primitives), `daisyui` (themes), `lucide-react` (icons), `clsx`/`tailwind-merge` (class utilities), `cmdk` (command palette)
- **AI:** `ai` (Vercel AI SDK), `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@assistant-ui/react` (chat UI), `ai-sdk-ollama` (local LLM)
- **State:** `zustand` (16 stores), React Context (5 providers)
- **Auth/Cloud:** `appwrite` (client SDK), `node-appwrite` (server SDK), `@aws-sdk/client-s3`, `aws4fetch`
- **Payments:** `stripe`, `app-store-server-api`, `googleapis` (IAP verification)
- **i18n:** `i18next`, `react-i18next`
- **Validation:** `zod`

## Quick Start

```bash
# Prerequisites: Node.js 22+, pnpm 10+, Rust toolchain (for Tauri builds)

# Clone and setup
git clone https://github.com/readest/readest.git
cd readest
git submodule update --init --recursive
pnpm install
pnpm --filter @readest/readest-app setup-vendors

# Development (desktop app)
pnpm tauri dev

# Development (web app)
pnpm dev-web

# Run tests
pnpm --filter @readest/readest-app test

# Build for production
pnpm tauri build                              # Desktop
pnpm --filter @readest/readest-app build-web  # Web
```

## Project Structure

```
readest/
├── apps/
│   └── readest-app/               # Main Next.js + Tauri application
│       ├── src/
│       │   ├── app/               # Next.js App Router pages
│       │   │   ├── reader/        # Book reader (main feature)
│       │   │   │   ├── page.tsx   # Reader page
│       │   │   │   ├── components/  # Reader UI (FoliateViewer, HeaderBar, etc.)
│       │   │   │   ├── hooks/     # Reader-specific hooks
│       │   │   │   └── utils/     # Reader utilities
│       │   │   ├── library/       # Book library management
│       │   │   ├── opds/          # OPDS catalog browser
│       │   │   ├── auth/          # Authentication pages (Appwrite OAuth)
│       │   │   ├── user/          # User profile/subscription
│       │   │   └── api/           # App Router API routes (AI, TTS, payments)
│       │   ├── pages/api/         # Pages Router API routes (sync, DeepL, storage)
│       │   ├── components/        # Shared React components
│       │   │   ├── primitives/    # shadcn/ui base components
│       │   │   ├── settings/      # Settings UI
│       │   │   └── assistant/     # AI chat components
│       │   ├── store/             # Zustand stores (16 stores)
│       │   ├── hooks/             # Custom React hooks (27 hooks)
│       │   ├── services/          # Business logic
│       │   │   ├── ai/            # AI/LLM integration (multi-provider, RAG, X-Ray, Recap)
│       │   │   ├── tts/           # Text-to-speech (Edge, Web Speech, Native)
│       │   │   ├── rsvp/          # Speed reading controller
│       │   │   ├── sync/          # KOSync client
│       │   │   ├── translators/   # Translation services (DeepL, Google, etc.)
│       │   │   ├── transformers/  # Text processing (proofread, simplecc)
│       │   │   └── constants.ts   # Application constants
│       │   ├── context/           # React Context (Auth, Env, Sync, PH, Dropdown)
│       │   ├── libs/              # Library wrappers (document, payment, sync, storage)
│       │   ├── utils/             # Utility functions (70+ files)
│       │   ├── types/             # TypeScript definitions (12 files)
│       │   ├── styles/            # Global styles & themes
│       │   ├── helpers/           # Auth, settings, shortcuts helpers
│       │   └── i18n/              # Internationalization config
│       ├── src-tauri/             # Tauri Rust backend
│       │   ├── src/               # Rust source code
│       │   │   ├── lib.rs         # Main Tauri plugin registration
│       │   │   ├── macos/         # macOS-specific (menu, traffic light, auth)
│       │   │   ├── android/       # Android-specific (e-ink support)
│       │   │   └── windows/       # Windows-specific features
│       │   ├── plugins/           # Custom Tauri plugins
│       │   │   ├── tauri-plugin-native-bridge/  # Native platform bridge
│       │   │   └── tauri-plugin-native-tts/     # Native TTS
│       │   └── tauri.conf.json    # Tauri configuration
│       ├── scripts/               # Setup and migration scripts
│       └── public/                # Static assets & vendor libs
├── packages/
│   ├── foliate-js/                # Ebook rendering library (EPUB, PDF, MOBI)
│   ├── simplecc-wasm/             # Chinese text conversion (WASM)
│   ├── tauri/                     # Custom Tauri fork
│   └── tauri-plugins/             # Custom Tauri plugins
└── package.json                   # Root monorepo config
```

## Architecture Overview

Readest uses a hybrid architecture combining a web-based UI (Next.js/React) with native capabilities via Tauri. The frontend handles all UI rendering and ebook display through foliate-js, while Tauri provides native file system access, window management, and platform-specific features. Authentication and cloud data sync are handled by Appwrite (migrated from Supabase).

### Data Flow

```
User Input → React Components → Zustand Stores → Services → Tauri Backend/APIs
                    ↑                                           ↓
                    └──────────── State Updates ←───────────────┘
```

### Platform Detection

The app uses `NEXT_PUBLIC_APP_PLATFORM` to determine the runtime:

- `tauri`: Desktop/mobile app with native Tauri APIs (SSG export)
- `web`: Web browser with PWA support (SSR via Cloudflare)

### Key Architectural Decisions

- **Static Site Generation (SSG)** for Tauri builds, SSR for web
- **Zustand** for lightweight, hook-based state management (not Redux)
- **foliate-js** for ebook rendering (EPUB, PDF, MOBI, AZW3, FB2, CBZ support)
- **Appwrite** for authentication (OAuth + email/password + magic links) and database (cloud sync)
- **Edge TTS** as primary TTS provider, with Web Speech API fallback
- **Radix UI primitives** wrapped with shadcn/ui patterns in `components/primitives/`
- **Hybrid API routing**: App Router (`src/app/api/`) for AI, TTS, payments; Pages Router (`src/pages/api/`) for sync, DeepL, storage
- **PWA** via Serwist (web platform only)
- **Multi-provider AI**: Ollama (local), AI Gateway, OpenAI, Anthropic, Google Gemini, OpenAI-compatible (OpenRouter, Groq, etc.)

### Key Modules

| Module          | Location                          | Purpose                                                            |
| --------------- | --------------------------------- | ------------------------------------------------------------------ |
| Reader          | `src/app/reader/`                 | Core book reading with FoliateViewer, annotations, RSVP, TTS UI    |
| Library         | `src/app/library/`                | Book management, import, cloud sync, OPDS catalogs                 |
| User            | `src/app/user/`                   | Account, subscriptions, storage quota, plans                       |
| Auth            | `src/app/auth/`                   | Login, Appwrite OAuth (Google, Apple, GitHub, Discord), email auth |
| OPDS            | `src/app/opds/`                   | OPDS catalog browser for online libraries                          |
| API Routes      | `src/app/api/`, `src/pages/api/`  | AI chat, TTS, sync, Stripe/IAP webhooks, metadata search           |
| foliate-js      | `packages/foliate-js/`            | EPUB/PDF/MOBI parsing and rendering engine                         |
| TTS             | `src/services/tts/`               | Text-to-speech (Edge, Web Speech, Native)                          |
| RSVP            | `src/services/rsvp/`              | Speed reading (Rapid Serial Visual Presentation)                   |
| AI              | `src/services/ai/`                | AI chat, RAG, X-Ray entity extraction, chapter recaps              |
| Translators     | `src/services/translators/`       | DeepL, Google, Azure, Yandex translation                           |
| Transformers    | `src/services/transformers/`      | Proofreading, SimpleCC, punctuation, sanitization                  |
| Sync            | `src/hooks/useSync.ts`            | Cloud sync for books/progress/notes via Appwrite                   |
| AppService      | `src/services/appService.ts`      | Platform abstraction (native vs web)                               |
| CommandRegistry | `src/services/commandRegistry.ts` | Keyboard shortcuts and command palette                             |

### Zustand Stores

| Store                | File                          | Purpose                           |
| -------------------- | ----------------------------- | --------------------------------- |
| `readerStore`        | `store/readerStore.ts`        | Open books, view states, progress |
| `libraryStore`       | `store/libraryStore.ts`       | Book library, metadata cache      |
| `settingsStore`      | `store/settingsStore.ts`      | User settings persistence         |
| `themeStore`         | `store/themeStore.ts`         | Theme and appearance              |
| `bookDataStore`      | `store/bookDataStore.ts`      | Book content and config cache     |
| `sidebarStore`       | `store/sidebarStore.ts`       | Sidebar UI state                  |
| `notebookStore`      | `store/notebookStore.ts`      | User notes                        |
| `aiChatStore`        | `store/aiChatStore.ts`        | AI conversation history           |
| `xrayStore`          | `store/xrayStore.ts`          | X-Ray entity browser state        |
| `parallelViewStore`  | `store/parallelViewStore.ts`  | Multi-book reading                |
| `proofreadStore`     | `store/proofreadStore.ts`     | Proofreading state                |
| `deviceStore`        | `store/deviceStore.ts`        | Device information                |
| `customFontStore`    | `store/customFontStore.ts`    | Custom fonts                      |
| `customTextureStore` | `store/customTextureStore.ts` | Background textures               |
| `trafficLightStore`  | `store/trafficLightStore.ts`  | macOS traffic light state         |
| `transferStore`      | `store/transferStore.ts`      | File transfer queue               |

### React Context Providers

| Context           | File                          | Purpose                                 |
| ----------------- | ----------------------------- | --------------------------------------- |
| `EnvContext`      | `context/EnvContext.tsx`      | Environment config, AppService instance |
| `AuthContext`     | `context/AuthContext.tsx`     | Appwrite authentication state           |
| `SyncContext`     | `context/SyncContext.tsx`     | Cloud sync coordination                 |
| `PHContext`       | `context/PHContext.tsx`       | PostHog analytics                       |
| `DropdownContext` | `context/DropdownContext.tsx` | Dropdown menu state                     |

### Reader Component Hierarchy

The reader page (`src/app/reader/`) contains the most complex component structure:

```
Reader.tsx                     # Main reader container
├── HeaderBar.tsx              # Title bar, navigation, settings toggle
├── ReaderContent.tsx          # Content area wrapper
│   └── FoliateViewer.tsx      # Core ebook renderer (foliate-js integration)
├── Sidebar/                   # Left panel (TOC, bookmarks, notes, search)
├── Notebook/                  # Right panel (notes, AI assistant, X-Ray, Recap)
│   └── AIAssistant.tsx        # AI chat with RAG context
├── FooterBar/                 # Bottom controls (nav, font, layout, color)
├── annotator/                 # Annotation popups (highlight, translate, etc.)
├── tts/                       # TTS controls (TTSController, TTSBar, TTSPanel)
├── rsvp/                      # Speed reading overlay (RSVPController, RSVPOverlay)
└── paragraph/                 # Paragraph mode components
```

## Development Guidelines

### File Naming

- Component files: **PascalCase** (`Button.tsx`, `BookCover.tsx`, `HeaderBar.tsx`)
- Hook files: **camelCase** with `use` prefix (`useSync.ts`, `useTheme.ts`)
- Store files: **camelCase** with `Store` suffix (`readerStore.ts`, `libraryStore.ts`)
- Utility files: **camelCase** (`book.ts`, `paragraph.ts`, `misc.ts`)
- Service files: **camelCase** (`appService.ts`, `constants.ts`)
- Type files: **camelCase** (`book.ts`, `settings.ts`)
- Rust files: **snake_case** (`traffic_light.rs`, `apple_auth.rs`)
- Next.js special files: **lowercase** (`page.tsx`, `layout.tsx`, `error.tsx`)

### Code Naming

- Components/Interfaces: **PascalCase** (`const Button: React.FC`, `interface ViewState`)
- Functions/Variables: **camelCase** (`const handleClick`, `let isLoading`)
- Constants: **SCREAMING_SNAKE_CASE** (`const MAX_ZOOM_LEVEL = 500`)
- Boolean variables: `is/has/should` prefix (`isPrimary`, `hasError`, `shouldUpdate`)
- Rust: **snake_case** for functions/variables, **PascalCase** for types/traits

### Import Order

```typescript
// 1. External packages
import { create } from 'zustand';
import React from 'react';
import clsx from 'clsx';

// 2. Internal absolute imports (@/)
import { BookContent, ViewSettings } from '@/types/book';
import { useSettingsStore } from '@/store/settingsStore';
import { useEnv } from '@/context/EnvContext';

// 3. Relative imports
import { formatTitle } from './utils';
```

### Path Aliases

- `@/*` → `./src/*`
- `@/components/ui/*` → `./src/components/primitives/*` (shadcn compatibility)
- `@pdfjs/*` → `./public/vendor/pdfjs/*`
- `@simplecc/*` → `./public/vendor/simplecc/*`

### Commit Conventions

This project uses conventional commits: `type(scope): description`

Types: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `test`

Examples:

- `feat(reader): add RSVP speed reading mode`
- `fix(tts): resolve Edge TTS connection timeout`
- `chore(deps): update zustand to v5`

## Available Commands

### Development

| Command                  | Description                            |
| ------------------------ | -------------------------------------- |
| `pnpm tauri dev`         | Start Tauri desktop app in development |
| `pnpm dev-web`           | Start Next.js web app in development   |
| `pnpm tauri android dev` | Start Android development              |
| `pnpm tauri ios dev`     | Start iOS development                  |

### Testing & Linting

| Command                                     | Description                      |
| ------------------------------------------- | -------------------------------- |
| `pnpm --filter @readest/readest-app test`   | Run Vitest unit tests            |
| `pnpm --filter @readest/readest-app lint`   | Run ESLint                       |
| `pnpm --filter @readest/readest-app clippy` | Run Rust clippy linter           |
| `pnpm format`                               | Format all files with Prettier   |
| `pnpm format:check`                         | Check formatting without changes |

### Building

| Command                                                     | Description                            |
| ----------------------------------------------------------- | -------------------------------------- |
| `pnpm tauri build`                                          | Build desktop app for current platform |
| `pnpm --filter @readest/readest-app build-web`              | Build web app                          |
| `pnpm --filter @readest/readest-app build-win-x64`          | Build Windows x64 installer            |
| `pnpm --filter @readest/readest-app build-macos-universial` | Build macOS universal binary           |
| `pnpm --filter @readest/readest-app build-linux-x64`        | Build Linux AppImage                   |

### Vendor Setup

| Command                                             | Description                        |
| --------------------------------------------------- | ---------------------------------- |
| `pnpm --filter @readest/readest-app setup-vendors`  | Copy PDF.js and SimpleCC to public |
| `pnpm --filter @readest/readest-app setup-pdfjs`    | Copy PDF.js vendor files only      |
| `pnpm --filter @readest/readest-app setup-simplecc` | Copy SimpleCC WASM files only      |

### Deployment

| Command                                      | Description                    |
| -------------------------------------------- | ------------------------------ |
| `pnpm --filter @readest/readest-app preview` | Preview OpenNext build locally |
| `pnpm --filter @readest/readest-app deploy`  | Deploy to Cloudflare           |

### Quality Checks

| Command                                                 | Description                    |
| ------------------------------------------------------- | ------------------------------ |
| `pnpm --filter @readest/readest-app build-check`        | Full build + validation checks |
| `pnpm --filter @readest/readest-app check:translations` | Verify all strings translated  |
| `pnpm --filter @readest/readest-app i18n:extract`       | Extract i18n strings           |

## Environment Variables

Copy `apps/readest-app/.env.local.example` to `.env.local` and configure:

| Variable                          | Required | Description                                                 |
| --------------------------------- | -------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_APP_PLATFORM`        | Yes      | `tauri` or `web`                                            |
| `NEXT_PUBLIC_APPWRITE_ENDPOINT`   | Yes      | Appwrite endpoint (default: `https://cloud.appwrite.io/v1`) |
| `NEXT_PUBLIC_APPWRITE_PROJECT_ID` | Yes      | Appwrite project ID                                         |
| `APPWRITE_API_KEY`                | Yes      | Appwrite server API key (server-side only)                  |
| `APPWRITE_DATABASE_ID`            | Yes      | Appwrite database ID                                        |
| `NEXT_PUBLIC_APPWRITE_DEV_KEY`    | No       | Dev key for localhost CORS bypass                           |
| `NEXT_PUBLIC_API_BASE_URL`        | Yes      | Backend API base URL                                        |
| `NEXT_PUBLIC_POSTHOG_KEY`         | No       | PostHog analytics key                                       |
| `NEXT_PUBLIC_STORAGE_FIXED_QUOTA` | No       | Fixed storage quota in bytes                                |
| `DEEPL_PRO_API_KEYS`              | No       | DeepL Pro API keys (comma-separated)                        |
| `DEEPL_FREE_API_KEYS`             | No       | DeepL Free API keys                                         |
| `NEXT_PUBLIC_OBJECT_STORAGE_TYPE` | No       | `r2` or `s3` for cloud storage                              |
| `R2_ACCESS_KEY_ID`                | No       | Cloudflare R2 access key                                    |
| `R2_SECRET_ACCESS_KEY`            | No       | Cloudflare R2 secret key                                    |
| `R2_BUCKET_NAME`                  | No       | Cloudflare R2 bucket name                                   |
| `S3_ENDPOINT`                     | No       | S3-compatible endpoint URL                                  |
| `S3_ACCESS_KEY_ID`                | No       | S3 access key                                               |
| `S3_SECRET_ACCESS_KEY`            | No       | S3 secret key                                               |
| `S3_BUCKET_NAME`                  | No       | S3 bucket name                                              |
| `AI_GATEWAY_API_KEY`              | No       | AI gateway API key                                          |

### Environment Files

- `.env.tauri` - Tauri desktop app variables
- `.env.web` - Web app variables
- `.env.test.local` - Test environment variables
- `.env.local` - Local overrides (gitignored)

## Testing

- **Framework**: Vitest with jsdom environment
- **Location**: `apps/readest-app/src/__tests__/**/*.test.ts`
- **Run tests**: `pnpm --filter @readest/readest-app test`
- **Watch mode**: `pnpm --filter @readest/readest-app test -- --watch`
- **Component testing**: `@testing-library/react` + `@testing-library/dom`
- **Config**: `vitest.config.ts` with path aliases via `vite-tsconfig-paths`

### Test File Organization

```
src/__tests__/
├── ai/                # AI service tests
├── api/               # API route tests
├── components/        # Component tests
├── helpers/           # Test helpers and mocks
├── integration/       # Integration tests
└── utils/             # Utility function tests
```

## Supported Formats

| Format   | Extension       | Description                             |
| -------- | --------------- | --------------------------------------- |
| EPUB     | `.epub`         | Standard ebook format                   |
| MOBI     | `.mobi`         | Amazon legacy format                    |
| AZW/AZW3 | `.azw`, `.azw3` | Amazon Kindle format                    |
| FB2      | `.fb2`          | FictionBook format                      |
| CBZ      | `.cbz`          | Comic book archive                      |
| PDF      | `.pdf`          | Portable Document Format (experimental) |
| TXT      | `.txt`          | Plain text                              |

## Deployment

### Web (Cloudflare)

```bash
pnpm --filter @readest/readest-app deploy
```

Uses OpenNext for Cloudflare Workers deployment.

### Desktop

- **macOS**: `pnpm --filter @readest/readest-app build-macos-universial`
- **Windows**: `pnpm --filter @readest/readest-app build-win-x64`
- **Linux**: `pnpm --filter @readest/readest-app build-linux-x64`

### Mobile

- **iOS**: `pnpm --filter @readest/readest-app build-ios-appstore`
- **Android**: `pnpm --filter @readest/readest-app release-google-play`

## Common Tasks

### Adding a New Page

1. Create directory in `src/app/[page-name]/`
2. Add `page.tsx` with default export component
3. Add `layout.tsx` if custom layout needed
4. Update navigation in relevant components

### Adding a New Zustand Store

1. Create file in `src/store/[name]Store.ts`
2. Define interface with state and actions
3. Export hook: `export const use[Name]Store = create<[Name]Store>(...)`
4. Import and use in components

### Adding a New API Route

This project uses **both** Next.js routing systems:

- **App Router** (`src/app/api/`): For new API routes. Add `route.ts` with exported HTTP method handlers.
- **Pages Router** (`src/pages/api/`): Used by sync, DeepL, and storage endpoints. Add handler files exporting default function.

Both use `validateUserAndToken` from `@/utils/access` for Appwrite JWT auth.

### Adding a New Service

1. Create file(s) in `src/services/[service-name]/`
2. Define types in `types.ts`
3. Export from `index.ts` barrel file
4. Add tests in `src/__tests__/`

## Migration Notes: Supabase → Appwrite

The codebase has been migrated from Supabase to Appwrite for authentication and database:

- **Auth**: All authentication now uses Appwrite OAuth (Google, Apple, GitHub, Discord), email/password, and magic links via `appwrite` SDK
- **Database**: Cloud sync uses Appwrite Databases with collections: `books`, `book_configs`, `book_notes`
- **Client SDK**: `src/utils/appwrite.ts` — client-side Appwrite initialization
- **Server SDK**: `createAppwriteAdminClient()` / `createAppwriteSessionClient()` in `src/utils/appwrite.ts` — server-side operations via `node-appwrite`
- **Legacy stubs**: `src/utils/supabase.ts` contains non-functional Supabase stubs (throws at runtime). Some modules (storage, payments, usage tracking) still reference these stubs and are not yet fully migrated.
- **JWT auth**: API routes validate Appwrite JWTs via `validateUserAndToken` in `src/utils/access.ts`

## Additional Resources

- [Website](https://readest.com)
- [Web App](https://web.readest.com)
- [Discord Community](https://discord.gg/gntyVNk3BJ)
- [GitHub Issues](https://github.com/readest/readest/issues)
- [GitHub Wiki](https://github.com/readest/readest/wiki)
- [DeepWiki Documentation](https://deepwiki.com/readest/readest)
- [Tauri v2 Documentation](https://v2.tauri.app/)
- [Contributing Guide](CONTRIBUTING.md)

## Troubleshooting

### Common Issues

**Tauri build fails with missing dependencies:**

```bash
pnpm tauri info  # Check Tauri prerequisites
rustup update    # Update Rust toolchain
```

**Vendor files missing (PDF.js, SimpleCC):**

```bash
pnpm --filter @readest/readest-app setup-vendors
```

**Web build uses SSR when SSG expected:**
Ensure `NEXT_PUBLIC_APP_PLATFORM=tauri` is set in environment.

**Tests fail with module not found:**

```bash
pnpm install                    # Reinstall dependencies
git submodule update --init     # Update submodules
```

**Appwrite CORS errors in web dev mode:**
The Next.js dev server proxies `/appwrite/*` to the Appwrite endpoint (configured in `next.config.mjs`). Ensure `NEXT_PUBLIC_APPWRITE_ENDPOINT` is set, or create a dev key in Appwrite Console and set `NEXT_PUBLIC_APPWRITE_DEV_KEY`.

## Steps after every code change

After every code change I would like you to please make sure the CI/CD steps run successfully. Specifically, the run format check.

## Skill Usage Guide

When working on tasks involving these technologies, invoke the corresponding skill:

| Skill           | Invoke When                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| nextjs          | Configures Next.js App Router, Pages Router, SSG/SSR, and API routes             |
| tauri           | Configures Tauri v2 desktop/mobile builds, plugins, and native bridges           |
| typescript      | Enforces TypeScript strict mode, type definitions, and path aliases              |
| rust            | Writes Rust backend code for Tauri plugins and platform-specific features        |
| react           | Manages React 19 hooks, components, context providers, and state patterns        |
| zustand         | Manages Zustand stores for lightweight hook-based state management               |
| tailwind        | Applies Tailwind CSS utility classes for responsive styling                      |
| radix-ui        | Uses Radix UI accessible primitives wrapped with shadcn/ui patterns              |
| daisyui         | Applies DaisyUI theme components and design tokens                               |
| appwrite        | Integrates Appwrite client/server SDKs for auth, database, and cloud sync        |
| frontend-design | Designs UI with Tailwind CSS, Radix UI primitives, DaisyUI themes, and shadcn/ui |
| zod             | Defines Zod schemas for runtime validation and type inference                    |
| vitest          | Writes and configures Vitest unit tests with jsdom and testing-library           |
| node            | Configures Node.js 22 runtime and server-side API handlers                       |
| i18next         | Manages i18next and react-i18next internationalization and translations          |
| vercel-ai-sdk   | Integrates Vercel AI SDK with multi-provider LLM chat and streaming              |
| stripe          | Handles Stripe payment integration and webhook processing                        |
| eslint          | Configures ESLint rules for code quality and consistency                         |
| prettier        | Enforces Prettier formatting rules across the codebase                           |
| pnpm            | Manages pnpm monorepo workspaces, filters, and dependency resolution             |
| serwist         | Configures Serwist for progressive web app service worker support                |
| cloudflare      | Deploys to Cloudflare Workers via OpenNext and manages R2 storage                |
| cmdk            | Implements cmdk command palette for keyboard-driven navigation                   |
| lucide-react    | Uses Lucide React icon components throughout the UI                              |

## Skill Usage Guide

When working on tasks involving these technologies, invoke the corresponding skill:

| Skill           | Invoke When                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| nextjs          | Configures Next.js App Router, Pages Router, SSG/SSR, and API routes             |
| tauri           | Configures Tauri v2 desktop/mobile builds, plugins, and native bridges           |
| typescript      | Enforces TypeScript strict mode, type definitions, and path aliases              |
| rust            | Writes Rust backend code for Tauri plugins and platform-specific features        |
| react           | Manages React 19 hooks, components, context providers, and state patterns        |
| zustand         | Manages Zustand stores for lightweight hook-based state management               |
| tailwind        | Applies Tailwind CSS utility classes for responsive styling                      |
| radix-ui        | Uses Radix UI accessible primitives wrapped with shadcn/ui patterns              |
| daisyui         | Applies DaisyUI theme components and design tokens                               |
| appwrite        | Integrates Appwrite client/server SDKs for auth, database, and cloud sync        |
| frontend-design | Designs UI with Tailwind CSS, Radix UI primitives, DaisyUI themes, and shadcn/ui |
| zod             | Defines Zod schemas for runtime validation and type inference                    |
| vitest          | Writes and configures Vitest unit tests with jsdom and testing-library           |
| node            | Configures Node.js 22 runtime and server-side API handlers                       |
| i18next         | Manages i18next and react-i18next internationalization and translations          |
| vercel-ai-sdk   | Integrates Vercel AI SDK with multi-provider LLM chat and streaming              |
| stripe          | Handles Stripe payment integration and webhook processing                        |
| eslint          | Configures ESLint rules for code quality and consistency                         |
| prettier        | Enforces Prettier formatting rules across the codebase                           |
| pnpm            | Manages pnpm monorepo workspaces, filters, and dependency resolution             |
| serwist         | Configures Serwist for progressive web app service worker support                |
| cloudflare      | Deploys to Cloudflare Workers via OpenNext and manages R2 storage                |
| cmdk            | Implements cmdk command palette for keyboard-driven navigation                   |
| lucide-react    | Uses Lucide React icon components throughout the UI                              |
