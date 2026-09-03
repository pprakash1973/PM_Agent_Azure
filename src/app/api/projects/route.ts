export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateProjectFromNL } from "@/lib/ai";
import { syncProjectDeliveryOwners } from "@/lib/delivery-owners";
import { DEFAULT_DETAILED_ARTIFACTS, DEFAULT_HIGH_LEVEL_ARTIFACTS } from "@/lib/utils";
import { downloadDiCache } from "@/lib/azure-blob";
import { diResultToChunks } from "@/lib/azure-di";
import { chunkText } from "@/lib/chunking";
import { z } from "zod";

// One requirements document uploaded through the creation wizard, already
// extracted by /api/parse-requirements (Azure DI for PDF/DOCX, else local).
interface WizardReqDoc {
  fileName: string;
  fileFormat: string;
  engine?: "azure-di" | "text" | "text-fallback";
  storageUri?: string | null;
  text?: string;
  ocrApplied?: boolean;
  extractionConfidence?: number | null;
}

/**
 * Persist a wizard-uploaded requirements document and its DocumentChunk index.
 * DI-parsed docs rebuild chunks from the cached DI result (no second DI call);
 * locally-extracted docs are chunked from their text. Chunking failures are
 * non-fatal — the document is still stored so the upload isn't lost.
 */
async function persistWizardDoc(
  db: any,
  projectId: string,
  uploadedById: string,
  d: WizardReqDoc,
): Promise<void> {
  const engine = d.engine ?? "text";
  let chunks: Array<{ chunkIndex: number; pageNumber: number; charStart: number; charEnd: number; sectionTitle: string | null; text: string; tokenCount: number }> = [];

  if (engine === "azure-di" && d.storageUri) {
    const cached = await downloadDiCache(d.storageUri).catch(() => null);
    if (cached) {
      try { chunks = diResultToChunks(cached); } catch { chunks = []; }
    }
  }
  if (chunks.length === 0 && d.text) {
    chunks = chunkText(d.text);
  }

  const doc = await db.requirementsDocument.create({
    data: {
      projectId,
      fileName: d.fileName,
      fileFormat: d.fileFormat || "txt",
      storageUri: d.storageUri ?? `inline:${projectId}:${Date.now()}`,
      extractedContent: (d.text ? { rawText: d.text.slice(0, 200000) } : {}) as object,
      extractionConfidence: d.extractionConfidence ?? (engine === "azure-di" ? 0.92 : 0.85),
      ocrApplied: d.ocrApplied ?? engine === "azure-di",
      pmConfirmed: true,
      uploadedById,
      ingestionState: "ready",
      chunkCount: chunks.length,
    },
  });

  if (chunks.length > 0) {
    await db.documentChunk.createMany({
      data: chunks.map((c) => ({ id: `${doc.id}-${c.chunkIndex}`, documentId: doc.id, projectId, ...c })),
      skipDuplicates: true,
    });
  }
}

const createSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  naturalLanguage: z.string().optional(),
  customer: z.string().optional(),
  accountId: z.string().optional(),   // UI sends "accountId"
  clientId: z.string().optional(),    // legacy alias — keep for compat
  programId: z.string().optional(),
  pmOwnerId: z.string().optional(),
  projectType: z.string().default("fixed_price"),
  methodology: z.string().default("waterfall"),
  deliveryMethod: z.enum(["predictive", "agile_scrum", "hybrid"]).optional(),
  commercialModel: z.enum(["fixed_price", "time_and_materials", "capped_tm"]).optional(),
  sprintLengthWeeks: z.number().optional(),
  engagementType: z.enum(["application_development", "product_development"]).default("application_development"),
  engagementMode: z.enum(["detailed", "high_level"]).default("detailed"),
  industry: z.string().optional(),
  projectSize: z.string().optional(),
  budget: z.number().optional(),
  currency: z.string().default("USD"),
  deliveryModel: z.string().optional(),
  teamSize: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
  externalExecutionTool: z.string().optional(),
  // Requirements doc fields (from file upload flow)
  requirementsText: z.string().optional(),
  requirementsFileName: z.string().optional(),
  requirementsFileFormat: z.string().optional(),
  requirementsExtracted: z.record(z.string(), z.unknown()).optional(),
  // Per-document provenance from /api/parse-requirements (DI engine, blob URL, etc.)
  requirementsDocs: z.array(z.object({
    fileName: z.string(),
    fileFormat: z.string(),
    engine: z.enum(["azure-di", "text", "text-fallback"]).optional(),
    storageUri: z.string().nullable().optional(),
    text: z.string().optional(),
    ocrApplied: z.boolean().optional(),
    extractionConfidence: z.number().nullable().optional(),
  })).optional(),
  // SOW-extracted registers (seeded at creation time)
  sowAssumptions: z.array(z.string()).optional(),
  sowDependencies: z.array(z.object({
    description: z.string(),
    type: z.string().default("external"),
    owner: z.string().optional(),
  })).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const user = session.user as any;

  let where: Record<string, unknown> = { orgId: user.orgId, deletedAt: null };

  if (user.role === "pm") {
    where.pmOwnerId = user.id;
  } else if (user.role === "pgm") {
    const programAssignments = await prisma.programAssignment.findMany({
      where: { userId: user.id },
      select: { programId: true },
    });
    where.programId = { in: programAssignments.map((a) => a.programId) };
  } else if (user.role === "dh") {
    const clusterAssignments = await prisma.clusterAssignment.findMany({
      where: { userId: user.id },
      select: { clusterId: true },
    });
    where.clusterId = { in: clusterAssignments.map((a) => a.clusterId) };
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      pmOwner: { select: { fullName: true, email: true } },
      milestones: { where: { status: "pending" }, orderBy: { dueDate: "asc" }, take: 3 },
      _count: { select: { risks: true, issues: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const user = session.user as any;

  try {
    const body = await req.json();
    let data = createSchema.parse(body);

    // If natural language, enrich with AI
    if (data.naturalLanguage && !data.name) {
      const inferred = await generateProjectFromNL(data.naturalLanguage);
      data = {
        ...data,
        name: (inferred.name as string) || "New Project",
        customer: (inferred.customer as string) || data.customer,
        projectType: (inferred.projectType as string) || data.projectType,
        methodology: (inferred.methodology as string) || data.methodology,
        industry: (inferred.industry as string) || data.industry,
        projectSize: (inferred.projectSize as string) || data.projectSize,
        budget: (inferred.budget as number) || data.budget,
        teamSize: (inferred.teamSize as number) || data.teamSize,
        description: (inferred.description as string) || data.description,
        startDate: (inferred.startDate as string) || data.startDate,
        endDate: (inferred.endDate as string) || data.endDate,
      };
    }

    if (!data.name) {
      return NextResponse.json({ error: { code: "VALIDATION", message: "Project name is required" } }, { status: 400 });
    }

    // Generate unique code if not provided
    const code = data.code || data.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) + "-" + Date.now().toString(36).toUpperCase();

    // Resolve pmOwnerId: DM/DH can specify a PM; PM and admin default to self.
    // Verify the target PM belongs to the same org (prevents cross-tenant assignment).
    let pmOwnerId = user.id;
    if ((user.role === "pgm" || user.role === "dh" || user.role === "admin") && data.pmOwnerId) {
      const targetPm = await prisma.user.findUnique({
        where: { id: data.pmOwnerId },
        select: { orgId: true, status: true },
      });
      if (!targetPm || targetPm.orgId !== user.orgId || targetPm.status !== "active") {
        return NextResponse.json({ error: { code: "FORBIDDEN", message: "PM must belong to the same organization" } }, { status: 403 });
      }
      pmOwnerId = data.pmOwnerId;
    }

    // PM: auto-resolve programId from their single assignment (legacy — PMs normally have no mapping now)
    let resolvedProgramId = data.programId;
    let resolvedClientId = data.accountId ?? data.clientId;
    if (user.role === "pm" && !resolvedProgramId) {
      const assignment = await prisma.programAssignment.findFirst({
        where: { userId: user.id },
        include: { program: { include: { account: true } } },
      });
      if (assignment) {
        resolvedProgramId = assignment.programId;
        resolvedClientId = resolvedClientId || assignment.program.accountId;
      }
    }

    // Derive clusterId from the chosen account (denormalised; required for DH aggregation).
    // If a program was chosen without an explicit account, fall back to the program's account.
    let resolvedClusterId: string | null = null;
    if (!resolvedClientId && resolvedProgramId) {
      const prog = await prisma.program.findUnique({ where: { id: resolvedProgramId }, select: { accountId: true } });
      if (prog) resolvedClientId = prog.accountId;
    }
    if (resolvedClientId) {
      const acct = await prisma.orgAccount.findUnique({ where: { id: resolvedClientId }, select: { clusterId: true } });
      resolvedClusterId = acct?.clusterId ?? null;
    }

    // Derive deliveryMethod from methodology if not explicitly provided
    const deliveryMethod = data.deliveryMethod
      ?? (data.methodology === "agile_scrum" ? "agile_scrum"
        : data.methodology === "hybrid" ? "hybrid"
        : "predictive");

    // Derive commercialModel from projectType if not explicitly provided
    const commercialModel = data.commercialModel
      ?? (data.projectType === "time_and_material" || data.projectType === "time_and_materials" ? "time_and_materials"
        : data.projectType === "capped_tm" ? "capped_tm"
        : "fixed_price");

    const db = prisma as any;
    const project = await db.project.create({
      data: {
        orgId: user.orgId,
        pmOwnerId,
        name: data.name,
        code,
        clusterId: resolvedClusterId,
        accountId: resolvedClientId,
        programId: resolvedProgramId,
        customer: data.customer,
        projectType: data.projectType,
        methodology: data.methodology,
        engagementType: data.engagementType,
        deliveryMethod,
        commercialModel,
        engagementMode: data.engagementMode,
        externalExecutionTool: data.externalExecutionTool,
        industry: data.industry,
        projectSize: data.projectSize,
        budget: data.budget,
        currency: data.currency,
        deliveryModel: data.deliveryModel,
        teamSize: data.teamSize,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        description: data.description,
      },
    });

    // Materialise the delivery-owner cache (DM from account, DH from cluster).
    // Source of truth stays the assignment tables; this snapshot auto-refreshes
    // whenever the account's primary DM or cluster's primary DH changes.
    if (resolvedClientId || resolvedClusterId) {
      await syncProjectDeliveryOwners({ projectId: project.id });
    }

    // Create default artifact selections
    const defaults = data.engagementMode === "high_level"
      ? DEFAULT_HIGH_LEVEL_ARTIFACTS
      : DEFAULT_DETAILED_ARTIFACTS;

    const { ARTIFACT_CATALOG } = await import("@/lib/utils");
    await db.artifactSelection.createMany({
      data: ARTIFACT_CATALOG.map((a) => ({
        projectId: project.id,
        artifactType: a.type,
        selectionStatus: defaults.includes(a.type) ? "active" : "available",
      })),
    });

    // Save requirements documents + chunk index from wizard upload.
    // New path: requirementsDocs carries DI provenance (one entry per file).
    // Legacy path: single requirementsText/requirementsFileName (no DI, inline storage).
    if (data.requirementsDocs && data.requirementsDocs.length > 0) {
      for (const doc of data.requirementsDocs) {
        await persistWizardDoc(db, project.id, user.id, doc);
      }
    } else if (data.requirementsText && data.requirementsFileName) {
      await persistWizardDoc(db, project.id, user.id, {
        fileName: data.requirementsFileName,
        fileFormat: data.requirementsFileFormat || "txt",
        engine: "text",
        storageUri: null,
        text: data.requirementsText,
        ocrApplied: false,
        extractionConfidence: 0.85,
      });
    }

    // Seed assumptions and dependencies extracted from SOW (raw SQL — avoids stale Prisma client)
    if (data.sowAssumptions && data.sowAssumptions.length > 0) {
      const now = new Date();
      for (let i = 0; i < data.sowAssumptions.length; i++) {
        const aId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${i}`;
        const stmt = data.sowAssumptions[i];
        await prisma.$executeRaw`
          INSERT INTO assumptions (id, "projectId", statement, category, source, status, "sortOrder", "createdAt", "updatedAt")
          VALUES (${aId}, ${project.id}, ${stmt}, 'general', 'sow_extract', 'open', ${i}, ${now}, ${now})
        `;
      }
    }
    if (data.sowDependencies && data.sowDependencies.length > 0) {
      const now = new Date();
      for (let i = 0; i < data.sowDependencies.length; i++) {
        const dep = data.sowDependencies[i] as any;
        const dId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${i}`;
        await prisma.$executeRaw`
          INSERT INTO dependencies (id, "projectId", description, type, owner, "dueDate", status, source, "sortOrder", "createdAt", "updatedAt")
          VALUES (${dId}, ${project.id}, ${dep.description}, ${dep.type ?? "external"}, ${dep.owner ?? null}, ${null}, 'open', 'sow_extract', ${i}, ${now}, ${now})
        `;
      }
    }

    // Seed scope requirements extracted from SOW into the Requirement table
    const scopeItems = (data.requirementsExtracted as any)?.scopeItems;
    if (Array.isArray(scopeItems) && scopeItems.length > 0) {
      function sowPriority(stmt: string): string {
        const s = stmt.toLowerCase();
        if (/\bmust\s+have\b|\bcritical\b/.test(s)) return "C";
        if (/\bshould\s+have\b|\bhigh\b/.test(s)) return "H";
        if (/\bwon.?t\s+have\b|\blow\b/.test(s)) return "L";
        if (/\bcould\s+have\b|\bmedium\b/.test(s)) return "M";
        return "M";
      }
      await db.requirement.createMany({
        data: scopeItems.map((item: string, i: number) => ({
          projectId: project.id,
          requirementKey: `REQ-${String(i + 1).padStart(3, "0")}`,
          statement: String(item),
          type: "functional",
          priority: sowPriority(String(item)),
          source: "sow_extract",
          status: "proposed",
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json(
      { ...project, hasRequirements: !!data.requirementsText },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "VALIDATION", message: err.issues[0]?.message || "Validation error" } }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: { code: "SERVER_ERROR", message: "Internal error" } }, { status: 500 });
  }
}
