# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RCC Volunteer Onboarding Portal for River Christian Church. Tracks volunteer progress through required onboarding steps using Planning Center Online (PCO) as the source of truth.

## Commands

```bash
npm run dev          # Start both frontend (:1700) and API (:1701) concurrently
npm run build        # Build with type checking (vue-tsc + vite build)
npm run type-check   # TypeScript checking only
```

## Architecture

**Frontend** (`src/`): Vue 3 + TypeScript + Vite SPA with Pinia state management and Tailwind CSS

**Backend API** (`api/`): Express.js server that runs locally during dev and as Vercel serverless function in production. Handles secure OAuth token exchange and PCO API calls.

**Data Storage**: Upstash Redis for caching volunteer data and team requirements

### Key Files

- `api/index.js` - All API routes (auth, admin, leader endpoints)
- `api/config/field-ids.js` - PCO custom field ID mappings (hardcoded for performance)
- `src/lib/auth.ts` - OAuth helpers, session management, permission caching
- `src/lib/teamMatrix.ts` - Team requirements matrix logic; determines which onboarding steps each team requires
- `data/teamRequirements.json` - Override default team requirements

### Routes

| Path | Purpose |
|------|---------|
| `/` | Volunteer dashboard (HomeView) |
| `/auth/callback` | PCO OAuth callback |
| `/admin` | Admin volunteer list |
| `/admin/matrix` | Team requirements matrix editor |
| `/leader` | Team leader view |
| `/leader/volunteer/:id` | Individual volunteer detail for leaders |

## PCO Integration

- **OAuth**: Volunteers authenticate via PCO OAuth 2.0
- **Admin PAT**: Server uses Personal Access Token (`PCO_SECRET`) to read custom fields (volunteers can't read their own via OAuth)
- **Custom Fields**: Onboarding step completion is tracked in PCO People custom fields (IDs in `api/config/field-ids.js`)

### Team Name Normalization

PCO team names like "Care Ministry" are normalized to kebab-case keys like `care` for matching against requirements. Special mappings exist in `normalizeTeamName()` functions in both `api/index.js` and `src/lib/teamMatrix.ts`.

## Environment Variables

Required in `.env.local`:
- `PCO_SECRET` - Personal Access Token for admin API access
- `VITE_PCO_OAUTH_CLIENT_ID` - OAuth client ID
- `VITE_PCO_OAUTH_SECRET` - OAuth client secret
