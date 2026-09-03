export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireProjectAccess } from "@/lib/project-access";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reqId: string }> }
) {
  const { id, reqId } = await params;
  const access = await requireProjectAccess(id);
  if (access.error) return access.error;

  const body = await req.json();
  const { action, statement, priority } = body;

  const existing = await prisma.requirement.findFirst({ where: { id: reqId, projectId: id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let data: Record<string, unknown> = {};

  if (action === "remove") {
    data = { isActive: false };
  } else if (action === "restore") {
    data = { isActive: true };
  } else if (action === "edit") {
    if (!statement?.trim()) return NextResponse.json({ error: "statement required" }, { status: 400 });
    data = { statement: statement.trim() };
  } else if (action === "priority") {
    const valid = ["C", "H", "M", "L"];
    if (!valid.includes(priority)) return NextResponse.json({ error: "priority must be C|H|M|L" }, { status: 400 });
    data = { priority };
  } else {
    return NextResponse.json({ error: "action must be remove|restore|edit|priority" }, { status: 400 });
  }

  const updated = await prisma.requirement.update({ where: { id: reqId }, data });
  return NextResponse.json(updated);
}
