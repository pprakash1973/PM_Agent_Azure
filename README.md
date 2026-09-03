# PM Agent — AI-Powered PMO Platform

Enterprise project management office (PMO) platform where AI performs the majority of routine PM work — artifact generation, tracking, reporting, prediction, and recommendation — while human PMs validate and approve.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Prisma 7 |
| Auth | NextAuth v5 (credentials + Google OAuth) |
| AI | Anthropic Claude API (claude-sonnet-4-6) |
| UI | Tailwind CSS v4 + Radix UI primitives |
| Deployment | Azure App Service + Azure Database for PostgreSQL |
| Email | Resend |

## Features

- **4-persona RBAC**: Project Manager · Program Manager · Delivery Head · Admin
- **Dual engagement modes**: Detailed (full tracking in PM Agent) or Governance (client tools + lightweight reporting)
- **AI artifact generation**: 22-artifact catalog — Charter, RAID, WBS, Milestones, RACI, Status Reports, EVM, and more
- **Natural-language project creation**: describe your project in plain text; AI infers all structured fields
- **AI copilot chat**: contextual assistant per project for on-demand commands
- **Weekly status reporting**: structured form → AI-generated executive summary + RAG score + recommendations
- **Portfolio dashboard**: health distribution, at-risk projects, SPI/CPI, upcoming milestones
- **Program Manager dashboard**: cross-project view, escalations, watchlist
- **Executive dashboard**: org-wide delivery health, budget roll-up, trend view
- **Artifact versioning**: every edit (AI, manual, or upload) creates an immutable version
- **Cost tracking**: EVM strip — CPI, SPI, cost burndown chart
- **Phase gates**: structured phase progression with gate reviews

---

## Quick Start (Local)

### Prerequisites
- Node.js 20+
- PostgreSQL database (Azure Database for PostgreSQL, Railway, or local)

### Setup

```bash
git clone https://github.com/pprakash1973/PMAgent.git
cd PMAgent

npm install

# Copy and configure environment
cp .env.example .env.local
# Edit .env.local — set DATABASE_URL, NEXTAUTH_SECRET, ANTHROPIC_API_KEY
```

### Environment Variables

```env
DATABASE_URL="postgresql://user:pass@host:5432/pm_agent?schema=public"
NEXTAUTH_SECRET="your-32-char-secret"          # openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
ANTHROPIC_API_KEY="sk-ant-..."

# Optional
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
RESEND_API_KEY=""
EMAIL_FROM="noreply@yourdomain.com"
```

### Database

```bash
# Push schema to your PostgreSQL database
npm run db:push

# Seed with demo users and sample project
npm run db:seed
```

### Run

```bash
npm run dev
# → http://localhost:3000
```

### Demo Logins (after seeding)

| Role | Email | Password |
|---|---|---|
| Project Manager | pm@pmAgent.dev | Password123! |
| Program Manager | dm@pmAgent.dev | Password123! |
| Delivery Head | head@pmAgent.dev | Password123! |
| Admin | admin@pmAgent.dev | Password123! |

---

## Deploy to Azure App Service

### 1. Database — Azure Database for PostgreSQL

1. In the Azure Portal, create an **Azure Database for PostgreSQL – Flexible Server**
2. Create a database (e.g. `pmAgent`)
3. Copy the connection string as `DATABASE_URL`:
   ```
   postgresql://user@server:password@server.postgres.database.azure.com:5432/pmAgent?sslmode=require
   ```

### 2. Azure App Service — App Deployment

1. Create an **Azure App Service** (Node 20 LTS, Linux)
2. In **Configuration → Application settings**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Azure PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random 32-char string (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Your App Service URL, e.g. `https://pm-agent.azurewebsites.net` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (`sk-ant-...`) |
| `WEBSITE_RUN_FROM_PACKAGE` | `1` |

3. **CI/CD** — The included GitHub Actions workflow (`.github/workflows/azure-deploy.yml`) builds and deploys on every push to `main`. Add these **GitHub secrets**:
   - `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ANTHROPIC_API_KEY`
   - `RESEND_API_KEY`, `EMAIL_FROM`, `OPENAI_API_KEY`
   - `AZURE_WEBAPP_PUBLISH_PROFILE` (download from Azure portal → App Service → Get publish profile)
   - `AZURE_WEBAPP_NAME` (as a GitHub **variable**, not secret)

### 3. Seed Database (first deploy only)

After the first successful deploy, run from your local machine with the production `DATABASE_URL`:

```bash
DATABASE_URL="<your-prod-url>" npm run db:seed
```

This creates demo users and a sample project so you can log in immediately.

---

## Project Structure

```
prisma/
├── schema.prisma              # Full database schema (25+ models)
├── seed.ts                    # Demo users + sample project
└── prisma.config.ts           # Prisma 7 datasource config

scripts/
├── migrate-azure-all.js       # Consolidated Azure PostgreSQL migration (idempotent, runs on every deploy)
├── migrate-azure-phase.js     # Adds currentPhase column (idempotent)
├── migrate-azure-admin-enh.js # Admin module enhancements (User.uid, delivery-owner cache)
└── db-reset.mjs               # Wipe all data from Azure PostgreSQL (dev/UAT use only)

src/
├── app/
│   ├── api/                   # REST API routes
│   │   ├── auth/              # NextAuth + register
│   │   ├── projects/          # CRUD + artifacts + status + risks + cost
│   │   ├── portfolio/         # Program Manager + Delivery Head aggregates
│   │   ├── pgm/               # Program Manager dashboard APIs
│   │   ├── escalations/       # Escalation lifecycle APIs
│   │   └── chat/              # AI copilot endpoint
│   ├── dashboard/
│   │   ├── page.tsx           # PM home dashboard
│   │   ├── projects/          # Project list + detail + new
│   │   ├── program/           # Program Manager views
│   │   ├── portfolio/         # Delivery Manager view
│   │   └── executive/         # Delivery Head view
│   ├── login/
│   └── register/
├── components/
│   ├── ui/                    # Button, Card, Badge, Input, Select, Toaster…
│   ├── app-shell.tsx          # Role-aware layout shell with nav rail
│   ├── artifact-panel.tsx     # Artifact generation + viewer
│   ├── chat-panel.tsx         # AI copilot sidebar
│   └── status-form.tsx        # Weekly status + AI summary
└── lib/
    ├── ai.ts                  # Anthropic Claude integration (streaming)
    ├── auth.ts                # NextAuth config
    ├── db.ts                  # Prisma client singleton
    ├── artifact-sync.ts       # Syncs artifact content into live DB tables
    ├── export-xlsx.ts         # Artifact XLSX export
    ├── guardrails.ts          # Pre-generation artifact guardrails
    ├── model-router.ts        # AI model routing per task type
    └── utils.ts               # Helpers, artifact catalog, constants
```

## Roadmap

- **V2**: Predictive engine (schedule/cost/risk), document upload & reconcile, Jira/ADO/Teams integrations
- **V3**: Executive AI reporting, Power BI/SAP integrations, advanced portfolio insights, SOC 2 Type II

## License

Private — Enterprise Edition
