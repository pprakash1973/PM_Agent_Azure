/**
 * Consolidated Azure PostgreSQL migration script.
 * Every statement is idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 * Safe to run on every deploy.
 */
require("dotenv/config");
const { Pool } = require("pg");

async function run(pool, sql, label) {
  try {
    await pool.query(sql);
    console.log(`✓ ${label}`);
  } catch (e) {
    console.error(`✗ ${label}:`, e.message);
    throw e;
  }
}

/**
 * Migrations run by default in all environments (local, CI, Azure).
 * Set SKIP_MIGRATIONS=1 to suppress, or RUN_MIGRATIONS=1 to force even when
 * DATABASE_URL is absent (useful for debugging).
 */
function migrationsEnabled() {
  if (process.env.RUN_MIGRATIONS === "1") return true;
  if (process.env.SKIP_MIGRATIONS === "1") return false;
  return true;
}

async function main() {
  if (!migrationsEnabled()) {
    console.log("Skipping migration — SKIP_MIGRATIONS=1");
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping migration — not a postgres URL");
    return;
  }

  const usesSsl = url.includes("sslmode=") || url.includes(".azure.com") || url.includes("railway.app");
  const pool = new Pool({ connectionString: url, ssl: usesSsl ? { rejectUnauthorized: true } : undefined });

  try {
    // ── 1. Extend core tables (columns added incrementally) ─────────────────────

    await run(pool, `
      ALTER TABLE "User"
        ADD COLUMN IF NOT EXISTS "status"          TEXT    NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS "copilotEnabled"  BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "assistantName"   TEXT    NOT NULL DEFAULT 'Copilot'
    `, "User columns");

    await run(pool, `
      ALTER TABLE "Project"
        ADD COLUMN IF NOT EXISTS "currentPhase"              TEXT  NOT NULL DEFAULT 'initiation',
        ADD COLUMN IF NOT EXISTS "evidenceReadinessScore"    FLOAT,
        ADD COLUMN IF NOT EXISTS "evidenceReadinessBand"     TEXT
    `, "Project columns");

    await run(pool, `
      ALTER TABLE "RequirementsDocument"
        ADD COLUMN IF NOT EXISTS "docClass"            TEXT NOT NULL DEFAULT 'other',
        ADD COLUMN IF NOT EXISTS "effectiveDate"       TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "confidentialityTier" TEXT NOT NULL DEFAULT 'standard',
        ADD COLUMN IF NOT EXISTS "ingestionState"      TEXT NOT NULL DEFAULT 'ready',
        ADD COLUMN IF NOT EXISTS "chunkCount"          INT  NOT NULL DEFAULT 0
    `, "RequirementsDocument columns");

    await run(pool, `
      ALTER TABLE "Artifact"
        ADD COLUMN IF NOT EXISTS "gapCount"       INT   NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "groundingScore" FLOAT
    `, "Artifact columns");

    await run(pool, `
      ALTER TABLE "ScheduleTask"
        ADD COLUMN IF NOT EXISTS "plannedCost" FLOAT
    `, "ScheduleTask columns");

    await run(pool, `
      ALTER TABLE "ArtifactVersion"
        ADD COLUMN IF NOT EXISTS "contentHash"         TEXT,
        ADD COLUMN IF NOT EXISTS "approvalStatus"      TEXT NOT NULL DEFAULT 'unreviewed',
        ADD COLUMN IF NOT EXISTS "parentVersionId"     TEXT REFERENCES "ArtifactVersion"("id"),
        ADD COLUMN IF NOT EXISTS "supersededReason"    TEXT,
        ADD COLUMN IF NOT EXISTS "generationInputsRef" JSONB
    `, "ArtifactVersion columns (baselining)");

    await run(pool, `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'ArtifactVersion_artifactId_versionNumber_key'
        ) THEN
          ALTER TABLE "ArtifactVersion"
            ADD CONSTRAINT "ArtifactVersion_artifactId_versionNumber_key"
            UNIQUE ("artifactId", "versionNumber");
        END IF;
      END $$;
    `, "ArtifactVersion unique constraint");

    await run(pool, `
      CREATE INDEX IF NOT EXISTS "ArtifactVersion_artifactId_approvalStatus_idx"
        ON "ArtifactVersion" ("artifactId", "approvalStatus")
    `, "ArtifactVersion approval index");

    await run(pool, `
      ALTER TABLE "ArtifactVersion"
        ADD COLUMN IF NOT EXISTS "extractionStatus"   TEXT NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS "extractionCoverage" FLOAT
    `, "ArtifactVersion extraction columns");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "artifact_version_items" (
        "id"                TEXT         NOT NULL PRIMARY KEY,
        "artifactVersionId" TEXT         NOT NULL REFERENCES "ArtifactVersion"("id") ON DELETE CASCADE,
        "declaredId"        TEXT,
        "sequence"          INT          NOT NULL,
        "sourceRef"         JSONB        NOT NULL DEFAULT '{}',
        "rawText"           TEXT         NOT NULL,
        "normalizedTitle"   TEXT         NOT NULL,
        "normalizedDesc"    TEXT         NOT NULL DEFAULT '',
        "entryTimestamp"    TIMESTAMP(3),
        "attributes"        JSONB        NOT NULL DEFAULT '{}',
        "lineageItemId"     TEXT,
        "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `, "artifact_version_items table");

    await run(pool, `
      CREATE INDEX IF NOT EXISTS "artifact_version_items_artifactVersionId_idx"
        ON "artifact_version_items" ("artifactVersionId")
    `, "artifact_version_items index");

    await run(pool, `
      CREATE INDEX IF NOT EXISTS "artifact_version_items_artifactVersionId_declaredId_idx"
        ON "artifact_version_items" ("artifactVersionId", "declaredId")
    `, "artifact_version_items declared_id index");

    // ── 2. New tables (in dependency order) ─────────────────────────────────────

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "Cluster" (
        "id"          TEXT NOT NULL PRIMARY KEY,
        "orgId"       TEXT NOT NULL,
        "name"        TEXT NOT NULL,
        "code"        TEXT NOT NULL UNIQUE,
        "type"        TEXT NOT NULL DEFAULT 'geography',
        "clusterLead" TEXT,
        "description" TEXT,
        "status"      TEXT NOT NULL DEFAULT 'active',
        "createdBy"   TEXT,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt"   TIMESTAMP(3)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "Cluster_orgId_name_key" ON "Cluster"("orgId","name")
    `, "Cluster table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "Client" (
        "id"           TEXT NOT NULL PRIMARY KEY,
        "orgId"        TEXT NOT NULL,
        "clusterId"    TEXT NOT NULL REFERENCES "Cluster"("id"),
        "name"         TEXT NOT NULL,
        "code"         TEXT NOT NULL UNIQUE,
        "industry"     TEXT,
        "region"       TEXT NOT NULL DEFAULT 'other',
        "accountOwner" TEXT,
        "status"       TEXT NOT NULL DEFAULT 'active',
        "createdBy"    TEXT,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt"    TIMESTAMP(3)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "Client_orgId_name_key" ON "Client"("orgId","name")
    `, "Client table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "Program" (
        "id"          TEXT NOT NULL PRIMARY KEY,
        "orgId"       TEXT NOT NULL,
        "clientId"    TEXT NOT NULL REFERENCES "Client"("id"),
        "name"        TEXT NOT NULL,
        "code"        TEXT NOT NULL UNIQUE,
        "description" TEXT,
        "sponsor"     TEXT,
        "status"      TEXT NOT NULL DEFAULT 'active',
        "createdBy"   TEXT,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt"   TIMESTAMP(3)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "Program_orgId_name_key" ON "Program"("orgId","name")
    `, "Program table");

    // Add FK-dependent Project columns now that Client and Program tables exist
    await run(pool, `
      ALTER TABLE "Project"
        ADD COLUMN IF NOT EXISTS "clientId"  TEXT REFERENCES "Client"("id"),
        ADD COLUMN IF NOT EXISTS "programId" TEXT REFERENCES "Program"("id")
    `, "Project clientId/programId FK columns");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "ProgramAssignment" (
        "id"         TEXT NOT NULL PRIMARY KEY,
        "programId"  TEXT NOT NULL REFERENCES "Program"("id"),
        "userId"     TEXT NOT NULL REFERENCES "User"("id"),
        "assignedBy" TEXT,
        "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("programId","userId")
      )
    `, "ProgramAssignment table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "Invitation" (
        "id"             TEXT NOT NULL PRIMARY KEY,
        "userId"         TEXT NOT NULL REFERENCES "User"("id"),
        "tokenHash"      TEXT NOT NULL UNIQUE,
        "expiresAt"      TIMESTAMP(3) NOT NULL,
        "acceptedAt"     TIMESTAMP(3),
        "invalidatedAt"  TIMESTAMP(3),
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `, "Invitation table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "ClientAssignment" (
        "id"         TEXT NOT NULL PRIMARY KEY,
        "clientId"   TEXT NOT NULL REFERENCES "Client"("id"),
        "userId"     TEXT NOT NULL REFERENCES "User"("id"),
        "assignedBy" TEXT,
        "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("clientId","userId")
      )
    `, "ClientAssignment table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "ModelConfig" (
        "id"        TEXT    NOT NULL PRIMARY KEY,
        "agent"     TEXT    NOT NULL UNIQUE,
        "model"     TEXT    NOT NULL,
        "provider"  TEXT    NOT NULL DEFAULT 'anthropic',
        "maxTokens" INTEGER NOT NULL DEFAULT 8192,
        "notes"     TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedBy" TEXT
      );
      ALTER TABLE "ModelConfig"
        ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'anthropic'
    `, "ModelConfig table + provider column");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "SystemSetting" (
        "key"       TEXT        NOT NULL PRIMARY KEY,
        "value"     TEXT        NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedBy" TEXT
      )
    `, "SystemSetting table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "ProjectPmAssignment" (
        "id"            TEXT        NOT NULL PRIMARY KEY,
        "projectId"     TEXT        NOT NULL REFERENCES "Project"("id"),
        "userId"        TEXT        NOT NULL REFERENCES "User"("id"),
        "assignedBy"    TEXT,
        "reason"        TEXT        NOT NULL DEFAULT '',
        "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "effectiveTo"   TIMESTAMP(3),
        "assignedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE "ProjectPmAssignment"
        ADD COLUMN IF NOT EXISTS "reason"        TEXT         NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "effectiveTo"   TIMESTAMP(3);
      ALTER TABLE "ProjectPmAssignment"
        DROP CONSTRAINT IF EXISTS "ProjectPmAssignment_projectId_userId_key"
    `, "ProjectPmAssignment table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "Escalation" (
        "id"                    TEXT NOT NULL PRIMARY KEY,
        "orgId"                 TEXT NOT NULL,
        "projectId"             TEXT REFERENCES "Project"("id"),
        "riskId"                TEXT REFERENCES "Risk"("id"),
        "raisedById"            TEXT NOT NULL REFERENCES "User"("id"),
        "ownerId"               TEXT REFERENCES "User"("id"),
        "title"                 TEXT NOT NULL,
        "description"           TEXT NOT NULL,
        "severity"              TEXT NOT NULL DEFAULT 'high',
        "status"                TEXT NOT NULL DEFAULT 'open',
        "targetType"            TEXT NOT NULL DEFAULT 'project',
        "situation"             TEXT NOT NULL DEFAULT '',
        "impact"                TEXT NOT NULL DEFAULT '',
        "supportRequired"       TEXT NOT NULL DEFAULT '',
        "slaBreachedAt"         TIMESTAMP(3),
        "slaDueAt"              TIMESTAMP(3),
        "acknowledgedById"      TEXT REFERENCES "User"("id"),
        "acknowledgedAt"        TIMESTAMP(3),
        "resolvedById"          TEXT REFERENCES "User"("id"),
        "resolvedAt"            TIMESTAMP(3),
        "resolutionNote"        TEXT,
        "withdrawnAt"           TIMESTAMP(3),
        "withdrawalReason"      TEXT,
        "targetResolutionDate"  TIMESTAMP(3),
        "contextSnapshot"       JSONB,
        "dueDate"               TIMESTAMP(3),
        "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `, "Escalation table");

    // Safety net: add each Escalation column for existing DBs missing them
    const escalationCols = [
      [`"targetType"           TEXT NOT NULL DEFAULT 'project'`,    "targetType"],
      [`"situation"            TEXT NOT NULL DEFAULT ''`,           "situation"],
      [`"impact"               TEXT NOT NULL DEFAULT ''`,           "impact"],
      [`"supportRequired"      TEXT NOT NULL DEFAULT ''`,           "supportRequired"],
      [`"slaBreachedAt"        TIMESTAMP(3)`,                       "slaBreachedAt"],
      [`"slaDueAt"             TIMESTAMP(3)`,                       "slaDueAt"],
      [`"acknowledgedById"     TEXT REFERENCES "User"("id")`,       "acknowledgedById"],
      [`"acknowledgedAt"       TIMESTAMP(3)`,                       "acknowledgedAt"],
      [`"resolvedById"         TEXT REFERENCES "User"("id")`,       "resolvedById"],
      [`"resolutionNote"       TEXT`,                               "resolutionNote"],
      [`"withdrawnAt"          TIMESTAMP(3)`,                       "withdrawnAt"],
      [`"withdrawalReason"     TEXT`,                               "withdrawalReason"],
      [`"targetResolutionDate" TIMESTAMP(3)`,                       "targetResolutionDate"],
      [`"contextSnapshot"      JSONB`,                              "contextSnapshot"],
    ];
    for (const [def, name] of escalationCols) {
      await pool.query(`ALTER TABLE "Escalation" ADD COLUMN IF NOT EXISTS ${def}`).catch(() => {});
    }
    console.log("✓ Escalation columns");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "EscalationComment" (
        "id"           TEXT NOT NULL PRIMARY KEY,
        "escalationId" TEXT NOT NULL REFERENCES "Escalation"("id"),
        "userId"       TEXT NOT NULL REFERENCES "User"("id"),
        "body"         TEXT NOT NULL,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `, "EscalationComment table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "NotificationPreference" (
        "id"                TEXT NOT NULL PRIMARY KEY,
        "userId"            TEXT NOT NULL UNIQUE REFERENCES "User"("id"),
        "escalationEmail"   BOOLEAN NOT NULL DEFAULT true,
        "escalationInApp"   BOOLEAN NOT NULL DEFAULT true,
        "statusReportEmail" BOOLEAN NOT NULL DEFAULT false,
        "statusReportInApp" BOOLEAN NOT NULL DEFAULT true
      )
    `, "NotificationPreference table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "AssistantConversation" (
        "id"           TEXT NOT NULL PRIMARY KEY,
        "userId"       TEXT NOT NULL REFERENCES "User"("id"),
        "projectId"    TEXT REFERENCES "Project"("id"),
        "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "status"       TEXT NOT NULL DEFAULT 'active'
      );
      CREATE INDEX IF NOT EXISTS "AssistantConversation_userId_idx"     ON "AssistantConversation"("userId");
      CREATE INDEX IF NOT EXISTS "AssistantConversation_projectId_idx"  ON "AssistantConversation"("projectId")
    `, "AssistantConversation table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "AssistantMessage" (
        "id"             TEXT NOT NULL PRIMARY KEY,
        "conversationId" TEXT NOT NULL REFERENCES "AssistantConversation"("id") ON DELETE CASCADE,
        "role"           TEXT NOT NULL,
        "content"        TEXT NOT NULL,
        "tabContext"     TEXT,
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "AssistantMessage_conversationId_idx" ON "AssistantMessage"("conversationId")
    `, "AssistantMessage table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "AssistantAction" (
        "id"             TEXT NOT NULL PRIMARY KEY,
        "conversationId" TEXT NOT NULL REFERENCES "AssistantConversation"("id") ON DELETE CASCADE,
        "actionType"     TEXT NOT NULL,
        "tier"           TEXT NOT NULL,
        "payload"        JSONB NOT NULL DEFAULT '{}',
        "status"         TEXT NOT NULL DEFAULT 'proposed',
        "confirmedAt"    TIMESTAMP(3),
        "undoneAt"       TIMESTAMP(3),
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "AssistantAction_conversationId_idx" ON "AssistantAction"("conversationId")
    `, "AssistantAction table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "action_items" (
        "id"              TEXT        NOT NULL PRIMARY KEY,
        "reference"       TEXT        NOT NULL UNIQUE,
        "projectId"       TEXT        NOT NULL REFERENCES "Project"("id"),
        "title"           TEXT        NOT NULL,
        "description"     TEXT,
        "category"        TEXT        NOT NULL DEFAULT 'schedule',
        "priority"        TEXT        NOT NULL DEFAULT 'p2',
        "status"          TEXT        NOT NULL DEFAULT 'open',
        "expectedOutcome" TEXT,
        "dueDate"         TIMESTAMP(3),
        "originalDueDate" TIMESTAMP(3),
        "assignedToId"    TEXT        NOT NULL REFERENCES "User"("id"),
        "raisedById"      TEXT        NOT NULL REFERENCES "User"("id"),
        "source"          TEXT        NOT NULL DEFAULT 'manual',
        "closedById"      TEXT        REFERENCES "User"("id"),
        "closureNote"     TEXT,
        "acknowledgedAt"  TIMESTAMP(3),
        "submittedAt"     TIMESTAMP(3),
        "closedAt"        TIMESTAMP(3),
        "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "action_items_projectId_status_idx"     ON "action_items"("projectId","status");
      CREATE INDEX IF NOT EXISTS "action_items_assignedToId_status_idx"  ON "action_items"("assignedToId","status");
      CREATE INDEX IF NOT EXISTS "action_items_raisedById_idx"           ON "action_items"("raisedById")
    `, "action_items table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "action_item_events" (
        "id"           TEXT        NOT NULL PRIMARY KEY,
        "actionItemId" TEXT        NOT NULL REFERENCES "action_items"("id") ON DELETE CASCADE,
        "actorId"      TEXT        NOT NULL REFERENCES "User"("id"),
        "fromStatus"   TEXT        NOT NULL,
        "toStatus"     TEXT        NOT NULL,
        "reason"       TEXT,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "action_item_events_actionItemId_idx" ON "action_item_events"("actionItemId")
    `, "action_item_events table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "dm_review_notes" (
        "id"         TEXT        NOT NULL PRIMARY KEY,
        "projectId"  TEXT        NOT NULL REFERENCES "Project"("id"),
        "authorId"   TEXT        NOT NULL REFERENCES "User"("id"),
        "reviewType" TEXT        NOT NULL DEFAULT 'ad_hoc',
        "body"       TEXT        NOT NULL,
        "visibility" TEXT        NOT NULL DEFAULT 'shared_with_pm',
        "lockedAt"   TIMESTAMP(3),
        "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "dm_review_notes_projectId_idx" ON "dm_review_notes"("projectId")
    `, "dm_review_notes table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "DocumentChunk" (
        "id"           TEXT NOT NULL PRIMARY KEY,
        "documentId"   TEXT NOT NULL REFERENCES "RequirementsDocument"("id") ON DELETE CASCADE,
        "projectId"    TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "chunkIndex"   INT  NOT NULL,
        "pageNumber"   INT,
        "charStart"    INT,
        "charEnd"      INT,
        "sectionTitle" TEXT,
        "text"         TEXT NOT NULL,
        "tokenCount"   INT,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("documentId","chunkIndex")
      );
      CREATE INDEX IF NOT EXISTS "DocumentChunk_projectId_idx"  ON "DocumentChunk"("projectId");
      CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");
      CREATE INDEX IF NOT EXISTS "DocumentChunk_text_search_idx"
        ON "DocumentChunk" USING gin(to_tsvector('english', "text"))
    `, "DocumentChunk table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "Requirement" (
        "id"               TEXT  NOT NULL PRIMARY KEY,
        "projectId"        TEXT  NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "requirementKey"   TEXT  NOT NULL,
        "statement"        TEXT  NOT NULL,
        "type"             TEXT  NOT NULL DEFAULT 'functional',
        "category"         TEXT,
        "source"           TEXT  NOT NULL DEFAULT 'extracted',
        "status"           TEXT  NOT NULL DEFAULT 'proposed',
        "confidence"       FLOAT,
        "sourceChunkId"    TEXT,
        "sourceQuote"      TEXT,
        "confirmedById"    TEXT,
        "confirmedAt"      TIMESTAMP(3),
        "amendedStatement" TEXT,
        "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("projectId","requirementKey")
      );
      CREATE INDEX IF NOT EXISTS "Requirement_projectId_idx" ON "Requirement"("projectId");
      CREATE INDEX IF NOT EXISTS "Requirement_status_idx"    ON "Requirement"("status")
    `, "Requirement table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "Gap" (
        "id"           TEXT NOT NULL PRIMARY KEY,
        "projectId"    TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "artifactId"   TEXT,
        "artifactType" TEXT,
        "fieldId"      TEXT NOT NULL,
        "question"     TEXT NOT NULL,
        "material"     BOOLEAN NOT NULL DEFAULT true,
        "status"       TEXT NOT NULL DEFAULT 'open',
        "answer"       TEXT,
        "answeredBy"   TEXT,
        "answeredAt"   TIMESTAMP(3),
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Gap_projectId_idx"  ON "Gap"("projectId");
      CREATE INDEX IF NOT EXISTS "Gap_artifactId_idx" ON "Gap"("artifactId");
      CREATE INDEX IF NOT EXISTS "Gap_status_idx"     ON "Gap"("status")
    `, "Gap table");

    // ── BL-P3: PMB Snapshot tables ───────────────────────────────────────────────

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "pmb_snapshots" (
        "id"             TEXT        NOT NULL PRIMARY KEY,
        "projectId"      TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "snapshotNumber" INT         NOT NULL,
        "label"          TEXT        NOT NULL,
        "trigger"        TEXT        NOT NULL DEFAULT 'ad_hoc',
        "isCurrent"      BOOLEAN     NOT NULL DEFAULT false,
        "baselinedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "notes"          TEXT,
        "createdById"    TEXT,
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("projectId","snapshotNumber")
      );
      CREATE INDEX IF NOT EXISTS "pmb_snapshots_projectId_isCurrent_idx"
        ON "pmb_snapshots" ("projectId","isCurrent")
    `, "pmb_snapshots table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "pmb_snapshot_members" (
        "id"                TEXT        NOT NULL PRIMARY KEY,
        "snapshotId"        TEXT        NOT NULL REFERENCES "pmb_snapshots"("id") ON DELETE CASCADE,
        "artifactVersionId" TEXT        NOT NULL REFERENCES "ArtifactVersion"("id"),
        "artifactType"      TEXT        NOT NULL,
        "dimension"         TEXT        NOT NULL,
        "isRequired"        BOOLEAN     NOT NULL DEFAULT false,
        "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("snapshotId","artifactVersionId")
      );
      CREATE INDEX IF NOT EXISTS "pmb_snapshot_members_snapshotId_idx"
        ON "pmb_snapshot_members" ("snapshotId")
    `, "pmb_snapshot_members table");

    // ── BL-P4: Comparison Engine tables ──────────────────────────────────────────

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "comparison_runs" (
        "id"             TEXT        NOT NULL PRIMARY KEY,
        "projectId"      TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "leftVersionId"  TEXT        NOT NULL,
        "rightVersionId" TEXT        NOT NULL,
        "artifactType"   TEXT        NOT NULL,
        "status"         TEXT        NOT NULL DEFAULT 'complete',
        "matchedCount"   INT         NOT NULL DEFAULT 0,
        "addedCount"     INT         NOT NULL DEFAULT 0,
        "deletedCount"   INT         NOT NULL DEFAULT 0,
        "modifiedCount"  INT         NOT NULL DEFAULT 0,
        "unchangedCount" INT         NOT NULL DEFAULT 0,
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "comparison_runs_projectId_artifactType_idx"
        ON "comparison_runs" ("projectId","artifactType")
    `, "comparison_runs table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "comparison_pairs" (
        "id"               TEXT        NOT NULL PRIMARY KEY,
        "runId"            TEXT        NOT NULL REFERENCES "comparison_runs"("id") ON DELETE CASCADE,
        "leftItemId"       TEXT        REFERENCES "artifact_version_items"("id"),
        "rightItemId"      TEXT        REFERENCES "artifact_version_items"("id"),
        "matchTier"        INT,
        "temporalClass"    TEXT        NOT NULL,
        "dispositionClass" TEXT,
        "similarity"       FLOAT,
        "overrideBy"       TEXT,
        "overrideAt"       TIMESTAMP(3),
        "overrideReason"   TEXT,
        "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "comparison_pairs_runId_idx"
        ON "comparison_pairs" ("runId")
    `, "comparison_pairs table");

    // ── BL-P5: Impact Reports ─────────────────────────────────────────────────────

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "impact_reports" (
        "id"            TEXT        NOT NULL PRIMARY KEY,
        "runId"         TEXT        NOT NULL UNIQUE REFERENCES "comparison_runs"("id") ON DELETE CASCADE,
        "projectId"     TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "scopeScore"    FLOAT,
        "scheduleScore" FLOAT,
        "costScore"     FLOAT,
        "overallRisk"   TEXT        NOT NULL DEFAULT 'low',
        "confidence"    FLOAT,
        "findings"      JSONB       NOT NULL DEFAULT '[]',
        "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "impact_reports_projectId_idx" ON "impact_reports"("projectId")
    `, "impact_reports table");

    // ── BL-P7: Accuracy Hardening ─────────────────────────────────────────────────

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "comparison_gold_entries" (
        "id"                    TEXT        NOT NULL PRIMARY KEY,
        "projectId"             TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "artifactType"          TEXT        NOT NULL,
        "leftItemTitle"         TEXT        NOT NULL,
        "rightItemTitle"        TEXT,
        "expectedMatchDecision" TEXT        NOT NULL,
        "expectedTemporalClass" TEXT,
        "notes"                 TEXT,
        "createdById"           TEXT,
        "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "comparison_gold_entries_projectId_artifactType_idx"
        ON "comparison_gold_entries" ("projectId","artifactType")
    `, "comparison_gold_entries table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "accuracy_reports" (
        "id"             TEXT        NOT NULL PRIMARY KEY,
        "runId"          TEXT        NOT NULL UNIQUE REFERENCES "comparison_runs"("id") ON DELETE CASCADE,
        "projectId"      TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "goldEntryCount" INT         NOT NULL DEFAULT 0,
        "truePositives"  INT         NOT NULL DEFAULT 0,
        "falsePositives" INT         NOT NULL DEFAULT 0,
        "falseNegatives" INT         NOT NULL DEFAULT 0,
        "precision"      FLOAT,
        "recall"         FLOAT,
        "f1Score"        FLOAT,
        "computedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `, "accuracy_reports table");

    // ── Agile Scrum: extend existing tables ──────────────────────────────────────

    await run(pool, `
      ALTER TABLE "Project"
        ADD COLUMN IF NOT EXISTS "deliveryMethod"        TEXT NOT NULL DEFAULT 'predictive',
        ADD COLUMN IF NOT EXISTS "commercialModel"       TEXT NOT NULL DEFAULT 'fixed_price',
        ADD COLUMN IF NOT EXISTS "stage"                 TEXT,
        ADD COLUMN IF NOT EXISTS "readinessGatePassedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "activeContractId"      TEXT
    `, "Project agile columns");

    await run(pool, `
      ALTER TABLE "Program"
        ADD COLUMN IF NOT EXISTS "defaultDeliveryMethod"  TEXT,
        ADD COLUMN IF NOT EXISTS "defaultCommercialModel"  TEXT,
        ADD COLUMN IF NOT EXISTS "defaultRateCardId"       TEXT,
        ADD COLUMN IF NOT EXISTS "pmMarginVisibility"      BOOLEAN NOT NULL DEFAULT true
    `, "Program agile columns");

    await run(pool, `
      ALTER TABLE "Sprint"
        ADD COLUMN IF NOT EXISTS "label"                 TEXT,
        ADD COLUMN IF NOT EXISTS "releaseId"             TEXT,
        ADD COLUMN IF NOT EXISTS "cadenceConfigId"       TEXT,
        ADD COLUMN IF NOT EXISTS "plannedCapacityPoints" FLOAT,
        ADD COLUMN IF NOT EXISTS "committedPoints"       FLOAT,
        ADD COLUMN IF NOT EXISTS "acceptedPoints"        FLOAT,
        ADD COLUMN IF NOT EXISTS "carriedPoints"         FLOAT,
        ADD COLUMN IF NOT EXISTS "availableDays"         INT,
        ADD COLUMN IF NOT EXISTS "focusFactor"           FLOAT,
        ADD COLUMN IF NOT EXISTS "state"                 TEXT NOT NULL DEFAULT 'planned',
        ADD COLUMN IF NOT EXISTS "goalMet"               TEXT,
        ADD COLUMN IF NOT EXISTS "closedAt"              TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "closedBy"              TEXT,
        ADD COLUMN IF NOT EXISTS "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    `, "Sprint agile columns");

    await run(pool, `
      ALTER TABLE "BacklogItem"
        ADD COLUMN IF NOT EXISTS "projectId"          TEXT REFERENCES "Project"("id") ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS "parentId"           TEXT,
        ADD COLUMN IF NOT EXISTS "level"              TEXT NOT NULL DEFAULT 'story',
        ADD COLUMN IF NOT EXISTS "itemType"           TEXT NOT NULL DEFAULT 'story',
        ADD COLUMN IF NOT EXISTS "externalRef"        TEXT,
        ADD COLUMN IF NOT EXISTS "externalUrl"        TEXT,
        ADD COLUMN IF NOT EXISTS "description"        TEXT,
        ADD COLUMN IF NOT EXISTS "acceptanceCriteria" TEXT,
        ADD COLUMN IF NOT EXISTS "points"             FLOAT,
        ADD COLUMN IF NOT EXISTS "baselinePoints"     FLOAT,
        ADD COLUMN IF NOT EXISTS "inContractedBaseline" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "changeRequestId"    TEXT,
        ADD COLUMN IF NOT EXISTS "disposition"        TEXT NOT NULL DEFAULT 'in_scope',
        ADD COLUMN IF NOT EXISTS "priorityRank"       INT,
        ADD COLUMN IF NOT EXISTS "state"              TEXT NOT NULL DEFAULT 'todo',
        ADD COLUMN IF NOT EXISTS "acceptedAt"         TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "acceptedBy"         TEXT,
        ADD COLUMN IF NOT EXISTS "dorPassed"          BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "dodPassed"          BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "wbsWorkPackageId"   TEXT,
        ADD COLUMN IF NOT EXISTS "sourceProvenance"   TEXT,
        ADD COLUMN IF NOT EXISTS "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    `, "BacklogItem agile columns");

    // ── Agile Scrum: new tables (FK order) ───────────────────────────────────────

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "RateCard" (
        "id"          TEXT        NOT NULL PRIMARY KEY,
        "orgId"       TEXT        NOT NULL,
        "name"        TEXT        NOT NULL,
        "currency"    TEXT        NOT NULL DEFAULT 'USD',
        "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "status"      TEXT        NOT NULL DEFAULT 'active',
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `, "RateCard table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "RateCardLine" (
        "id"         TEXT    NOT NULL PRIMARY KEY,
        "rateCardId" TEXT    NOT NULL REFERENCES "RateCard"("id") ON DELETE CASCADE,
        "role"       TEXT    NOT NULL,
        "ratePerHour" FLOAT NOT NULL,
        "currency"   TEXT    NOT NULL DEFAULT 'USD',
        "effectiveDate" TIMESTAMP(3),
        "endDate"    TIMESTAMP(3)
      )
    `, "RateCardLine table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "Contract" (
        "id"              TEXT        NOT NULL PRIMARY KEY,
        "projectId"       TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "contractRef"     TEXT        NOT NULL,
        "title"           TEXT        NOT NULL,
        "commercialModel" TEXT        NOT NULL DEFAULT 'fixed_price',
        "currency"        TEXT        NOT NULL DEFAULT 'USD',
        "contractValue"   FLOAT,
        "ceilingValue"    FLOAT,
        "rateCardId"      TEXT        REFERENCES "RateCard"("id"),
        "status"          TEXT        NOT NULL DEFAULT 'active',
        "signedAt"        TIMESTAMP(3),
        "startDate"       TIMESTAMP(3),
        "endDate"         TIMESTAMP(3),
        "notes"           TEXT,
        "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Contract_projectId_idx" ON "Contract"("projectId")
    `, "Contract table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "CadenceConfig" (
        "id"                TEXT        NOT NULL PRIMARY KEY,
        "projectId"         TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "sprintLengthWeeks" INT         NOT NULL DEFAULT 2,
        "cadenceStart"      TIMESTAMP(3),
        "holidays"          JSONB       NOT NULL DEFAULT '[]',
        "defaultCapacity"   FLOAT,
        "notes"             TEXT,
        "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `, "CadenceConfig table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "Release" (
        "id"           TEXT        NOT NULL PRIMARY KEY,
        "projectId"    TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "name"         TEXT        NOT NULL,
        "targetDate"   TIMESTAMP(3),
        "releasedAt"   TIMESTAMP(3),
        "status"       TEXT        NOT NULL DEFAULT 'planned',
        "notes"        TEXT,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Release_projectId_idx" ON "Release"("projectId")
    `, "Release table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "BacklogItemHistory" (
        "id"            TEXT        NOT NULL PRIMARY KEY,
        "backlogItemId" TEXT        NOT NULL REFERENCES "BacklogItem"("id") ON DELETE CASCADE,
        "field"         TEXT        NOT NULL,
        "oldValue"      TEXT,
        "newValue"      TEXT,
        "changeClass"   TEXT        NOT NULL DEFAULT 'update',
        "sprintId"      TEXT,
        "changedBy"     TEXT        NOT NULL,
        "changedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "BacklogItemHistory_backlogItemId_idx"
        ON "BacklogItemHistory" ("backlogItemId")
    `, "BacklogItemHistory table");
    await run(pool, `
      ALTER TABLE "BacklogItemHistory" ADD COLUMN IF NOT EXISTS "sprintId" TEXT
    `, "BacklogItemHistory.sprintId column");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "ProjectRoleAssignment" (
        "id"          TEXT        NOT NULL PRIMARY KEY,
        "projectId"   TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "userId"      TEXT        NOT NULL REFERENCES "User"("id"),
        "role"        TEXT        NOT NULL,
        "allocationPct" FLOAT     NOT NULL DEFAULT 100,
        "startDate"   TIMESTAMP(3),
        "endDate"     TIMESTAMP(3),
        "rateCardId"  TEXT        REFERENCES "RateCard"("id"),
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("projectId","userId","role")
      );
      CREATE INDEX IF NOT EXISTS "ProjectRoleAssignment_projectId_idx"
        ON "ProjectRoleAssignment" ("projectId")
    `, "ProjectRoleAssignment table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "CostLedger" (
        "id"              TEXT        NOT NULL PRIMARY KEY,
        "projectId"       TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "sprintId"        TEXT        REFERENCES "Sprint"("id"),
        "entryType"       TEXT        NOT NULL,
        "amount"          FLOAT       NOT NULL,
        "currency"        TEXT        NOT NULL DEFAULT 'USD',
        "description"     TEXT,
        "confirmedBy"     TEXT        NOT NULL,
        "confirmedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "pmConfirmed"     BOOLEAN     NOT NULL DEFAULT false,
        "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "CostLedger_projectId_idx" ON "CostLedger"("projectId");
      CREATE INDEX IF NOT EXISTS "CostLedger_sprintId_idx" ON "CostLedger"("sprintId")
    `, "CostLedger table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "Ceremony" (
        "id"              TEXT        NOT NULL PRIMARY KEY,
        "projectId"       TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "sprintId"        TEXT        REFERENCES "Sprint"("id"),
        "type"            TEXT        NOT NULL,
        "scheduledAt"     TIMESTAMP(3),
        "heldAt"          TIMESTAMP(3),
        "durationMinutes" INT,
        "attendancePct"   FLOAT,
        "outcomeSummary"  TEXT,
        "artifactId"      TEXT,
        "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Ceremony_projectId_idx" ON "Ceremony"("projectId");
      CREATE INDEX IF NOT EXISTS "Ceremony_sprintId_idx" ON "Ceremony"("sprintId")
    `, "Ceremony table");
    await run(pool, `
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='Ceremony' AND column_name='durationMin')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name='Ceremony' AND column_name='durationMinutes')
        THEN
          ALTER TABLE "Ceremony" RENAME COLUMN "durationMin" TO "durationMinutes";
        END IF;
      END $$;
      ALTER TABLE "Ceremony" ADD COLUMN IF NOT EXISTS "durationMinutes" INT;
      ALTER TABLE "Ceremony" ADD COLUMN IF NOT EXISTS "heldAt" TIMESTAMP(3);
      ALTER TABLE "Ceremony" ADD COLUMN IF NOT EXISTS "attendancePct" FLOAT;
      ALTER TABLE "Ceremony" ADD COLUMN IF NOT EXISTS "outcomeSummary" TEXT;
      ALTER TABLE "Ceremony" ADD COLUMN IF NOT EXISTS "artifactId" TEXT
    `, "Ceremony schema fix");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "RetrospectiveAction" (
        "id"          TEXT        NOT NULL PRIMARY KEY,
        "projectId"   TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "sprintId"    TEXT        REFERENCES "Sprint"("id"),
        "category"    TEXT        NOT NULL DEFAULT 'improvement',
        "description" TEXT        NOT NULL,
        "owner"       TEXT,
        "status"      TEXT        NOT NULL DEFAULT 'open',
        "dueDate"     TIMESTAMP(3),
        "closedAt"    TIMESTAMP(3),
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "RetrospectiveAction_projectId_idx"
        ON "RetrospectiveAction" ("projectId")
    `, "RetrospectiveAction table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "Impediment" (
        "id"           TEXT        NOT NULL PRIMARY KEY,
        "projectId"    TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "sprintId"     TEXT        REFERENCES "Sprint"("id"),
        "title"        TEXT        NOT NULL DEFAULT '',
        "description"  TEXT,
        "raisedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "raisedBy"     TEXT,
        "severity"     TEXT        NOT NULL DEFAULT 'medium',
        "escalatedTo"  TEXT,
        "escalatedAt"  TIMESTAMP(3),
        "status"       TEXT        NOT NULL DEFAULT 'open',
        "resolvedAt"   TIMESTAMP(3),
        "resolution"   TEXT,
        "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Impediment_projectId_idx" ON "Impediment"("projectId")
    `, "Impediment table");
    await run(pool, `
      ALTER TABLE "Impediment" ADD COLUMN IF NOT EXISTS "title"       TEXT        NOT NULL DEFAULT '';
      ALTER TABLE "Impediment" ADD COLUMN IF NOT EXISTS "raisedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE "Impediment" ADD COLUMN IF NOT EXISTS "escalatedTo" TEXT;
      ALTER TABLE "Impediment" ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3);
      ALTER TABLE "Impediment" ADD COLUMN IF NOT EXISTS "resolution"  TEXT
    `, "Impediment schema fix");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "AgileMetricSnapshot" (
        "id"                  TEXT        NOT NULL PRIMARY KEY,
        "projectId"           TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "sprintId"            TEXT        REFERENCES "Sprint"("id"),
        "snapshotDate"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "velocity"            FLOAT,
        "plannedPoints"       FLOAT,
        "acceptedPoints"      FLOAT,
        "commitmentReliability" FLOAT,
        "burndownRemaining"   FLOAT,
        "burnupAccepted"      FLOAT,
        "cycleTimeMedian"     FLOAT,
        "cpiEvm"              FLOAT,
        "spiEvm"              FLOAT,
        "computedBy"          TEXT,
        "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "AgileMetricSnapshot_projectId_idx"
        ON "AgileMetricSnapshot" ("projectId");
      CREATE INDEX IF NOT EXISTS "AgileMetricSnapshot_sprintId_idx"
        ON "AgileMetricSnapshot" ("sprintId")
    `, "AgileMetricSnapshot table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS "CommercialSnapshot" (
        "id"               TEXT        NOT NULL PRIMARY KEY,
        "projectId"        TEXT        NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "sprintId"         TEXT        REFERENCES "Sprint"("id"),
        "snapshotDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "actualToDate"     FLOAT,
        "eacForecast"      FLOAT,
        "ceilingRemaining" FLOAT,
        "burnRate"         FLOAT,
        "runwayWeeks"      FLOAT,
        "marginAtCompletion" FLOAT,
        "primaryMetric"    TEXT,
        "primaryValue"     FLOAT,
        "confirmedBy"      TEXT,
        "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "CommercialSnapshot_projectId_idx"
        ON "CommercialSnapshot" ("projectId")
    `, "CommercialSnapshot table");

    // ── 3. Seed data ─────────────────────────────────────────────────────────────

    const orgId = "seed-org-1";
    await pool.query(`
      INSERT INTO "Organization" ("id","name","tier","createdAt")
      VALUES ($1, 'UST PMO Platform', 'enterprise', NOW())
      ON CONFLICT ("id") DO NOTHING
    `, [orgId]);

    const bcrypt   = require("bcryptjs");
    const { randomBytes } = require("crypto");
    const hash     = await bcrypt.hash("Password123!", 10);

    // Admin
    const adminId = randomBytes(12).toString("hex");
    await pool.query(`
      INSERT INTO "User" ("id","orgId","email","fullName","passwordHash","role","status","approved","mfaEnabled","createdAt","updatedAt")
      VALUES ($1,$3,'Admin@pmAgent.dev','Platform Admin',$2,'admin','active',true,false,NOW(),NOW())
      ON CONFLICT ("email") DO UPDATE SET "role"='admin',"status"='active',"passwordHash"=$2
    `, [adminId, hash, orgId]);

    // PM seed user
    const pmId = randomBytes(12).toString("hex");
    const pmExists = await pool.query(`SELECT id FROM "User" WHERE email='prakash@pmAgent.dev'`);
    if (pmExists.rows.length) {
      await pool.query(`UPDATE "User" SET "role"='pm',"status"='active',"passwordHash"=$1 WHERE email='prakash@pmAgent.dev'`, [hash]);
    } else {
      await pool.query(`
        INSERT INTO "User" ("id","orgId","email","fullName","passwordHash","role","status","approved","mfaEnabled","createdAt","updatedAt")
        VALUES ($1,$3,'prakash@pmAgent.dev','Prakash PM',$2,'pm','active',true,false,NOW(),NOW())
      `, [pmId, hash, orgId]);
    }

    console.log("✓ Seed data");

    // ── UAT Cycle 1 Remediation — WP-2/WP-3 schema additions ─────────────────
    await run(pool, `
      ALTER TABLE "ModelConfig"
        ADD COLUMN IF NOT EXISTS "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0
    `, "ModelConfig.temperature column");

    await run(pool, `
      ALTER TABLE "StatusReport"
        ADD COLUMN IF NOT EXISTS "violations" JSONB
    `, "StatusReport.violations column");

    // ── Artifact Templates ─────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "ArtifactTemplate" (
        "id"             TEXT        NOT NULL PRIMARY KEY,
        "orgId"          TEXT        NOT NULL,
        "name"           TEXT        NOT NULL,
        "description"    TEXT,
        "artifactType"   TEXT        NOT NULL,
        "scope"          TEXT        NOT NULL DEFAULT 'global',
        "accountId"      TEXT,
        "systemAddendum" TEXT,
        "userAddendum"   TEXT,
        "isActive"       BOOLEAN     NOT NULL DEFAULT true,
        "createdBy"      TEXT,
        "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS "ArtifactTemplate_orgId_type_scope_idx"
      ON "ArtifactTemplate"("orgId","artifactType","scope","isActive")`);

    // appliedTemplateId column on ArtifactVersion (tracks which template was used)
    await pool.query(`ALTER TABLE "ArtifactVersion"
      ADD COLUMN IF NOT EXISTS "appliedTemplateId" TEXT`);

    console.log("✓ ArtifactTemplate table + ArtifactVersion.appliedTemplateId");

    // ── ChangeRequest table (mapped to change_requests via @@map) ────────────────
    await run(pool, `
      CREATE TABLE IF NOT EXISTS change_requests (
        "id"                 TEXT            NOT NULL PRIMARY KEY,
        "projectId"          TEXT            NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "crId"               TEXT,
        "title"              TEXT,
        "description"        TEXT            NOT NULL DEFAULT '',
        "impactAnalysis"     TEXT,
        "approvalStatus"     TEXT            NOT NULL DEFAULT 'pending',
        "budgetImpact"       DECIMAL(65,30)  NOT NULL DEFAULT 0,
        "scheduleImpactDays" INTEGER         NOT NULL DEFAULT 0,
        "requestedBy"        TEXT,
        "approvedBy"         TEXT,
        "approvedAt"         TIMESTAMP(3),
        "createdAt"          TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"          TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "change_requests_projectId_idx" ON change_requests("projectId")
    `, "change_requests table");
    // Extend if the table already existed without the newer columns
    await pool.query(`ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS "title"               TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS "budgetImpact"        DECIMAL(65,30) NOT NULL DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS "scheduleImpactDays"  INTEGER NOT NULL DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS "approvedAt"          TIMESTAMP(3)`).catch(()=>{});

    // ── RAID registers: Assumptions + Dependencies ───────────────────────────────
    await run(pool, `
      CREATE TABLE IF NOT EXISTS assumptions (
        "id"          TEXT         NOT NULL PRIMARY KEY,
        "projectId"   TEXT         NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "statement"   TEXT         NOT NULL,
        "category"    TEXT         NOT NULL DEFAULT 'general',
        "source"      TEXT         NOT NULL DEFAULT 'manual',
        "status"      TEXT         NOT NULL DEFAULT 'open',
        "sortOrder"   INTEGER      NOT NULL DEFAULT 0,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "assumptions_projectId_idx" ON assumptions("projectId")
    `, "assumptions table");

    await run(pool, `
      CREATE TABLE IF NOT EXISTS dependencies (
        "id"          TEXT         NOT NULL PRIMARY KEY,
        "projectId"   TEXT         NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "description" TEXT         NOT NULL,
        "type"        TEXT         NOT NULL DEFAULT 'external',
        "owner"       TEXT,
        "dueDate"     TIMESTAMP(3),
        "status"      TEXT         NOT NULL DEFAULT 'open',
        "source"      TEXT         NOT NULL DEFAULT 'manual',
        "sortOrder"   INTEGER      NOT NULL DEFAULT 0,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "dependencies_projectId_idx" ON dependencies("projectId")
    `, "dependencies table");

    // ── Budget revisions ─────────────────────────────────────────────────────────
    await run(pool, `
      CREATE TABLE IF NOT EXISTS budget_revisions (
        "id"             TEXT            NOT NULL PRIMARY KEY,
        "projectId"      TEXT            NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
        "changeRequestId" TEXT,
        "previousBudget" DECIMAL(65,30)  NOT NULL,
        "newBudget"      DECIMAL(65,30)  NOT NULL,
        "delta"          DECIMAL(65,30)  NOT NULL,
        "reason"         TEXT            NOT NULL,
        "approvedById"   TEXT,
        "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "budget_revisions_projectId_idx" ON budget_revisions("projectId")
    `, "budget_revisions table");

    console.log("✓ All migrations complete");

  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
