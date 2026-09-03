"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  FileText, ShieldAlert, AlertCircle, Users, CalendarDays,
  CircleDollarSign, Layers, BarChart2, GitCompare, Zap, Briefcase, Info,
  BookOpen, TrendingUp, Plus, Trash2, CheckCircle, ClipboardList,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { useRouter } from "next/navigation";
import { ArtifactPanel } from "@/components/artifact-panel";
import { StatusQuestionnaire } from "@/components/status-questionnaire";
import { PmbSnapshotPanel } from "@/components/pmb-snapshot-panel";
import { ComparisonView } from "@/components/comparison-view";
import { ImpactReportPanel } from "@/components/impact-report-panel";
import { BaselineSummaryCard, BaselineVerifyPanel } from "@/components/baseline-summary-card";
import { BacklogTab, SprintsTab } from "@/components/agile-workspace";
import { AgileCommercialTab } from "@/components/agile-commercial-tab";
import { AgileStatusTab } from "@/components/agile-status-tab";
import { DecisionsTab } from "@/components/decisions-tab";
import { formatDate, formatCurrency, methodologyLabel, ARTIFACT_FORMAT } from "@/lib/utils";
import { useCopilot } from "@/components/copilot/CopilotContext";

const C = {
  primary: "#006E74", primaryLight: "rgba(0,110,116,.08)", primaryBorder: "rgba(0,110,116,.25)",
  tealL: "#0097AC",
  green: "#158a5a", greenLight: "#e3f3ea",
  amber: "#c17d12", amberLight: "#fbf0da",
  red: "#cf3f3a", redLight: "#fbe4e2",
  border: "#e2e5ea", borderLight: "#eceef2",
  surface: "#fff", surface2: "#f7f8fa",
  text: "#1a1d24", text2: "#5b616e", text3: "#8a909c",
  FF: "var(--font-inter),'Inter',system-ui,sans-serif",
};

function resAvatarColor(name: string) {
  const palette = [C.primary, "#006E74", "#0097AC", "#003C51", "#01B27C", "#881E87"];
  if (!name) return C.text3;
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

function ragColor(s: string) {
  if (!s) return C.text3;
  const v = s.toLowerCase();
  if (v === "green" || v === "on track") return C.green;
  if (v === "amber" || v === "at risk") return C.amber;
  return C.red;
}
function ragBg(s: string) {
  const v = (s || "").toLowerCase();
  if (v === "green" || v === "on track") return C.greenLight;
  if (v === "amber" || v === "at risk") return C.amberLight;
  return C.redLight;
}

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color, background: bg,
      borderRadius: 6, padding: "3px 9px", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: "8px 18px 4px",
      font: "700 10px var(--font-inter),'Inter'",
      letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const,
    }}>{label}</div>
  );
}

// ── Phase rail ─────────────────────────────────────────────────────────────────

// Display phases (Monitoring runs alongside Execution in PMBOK, but we show it as a step)
const PHASES = ["Initiation", "Planning", "Execution", "Closure"];
// Map display names to DB values
const PHASE_DB: Record<string, string> = {
  Initiation: "initiation", Planning: "planning", Execution: "execution", Closure: "closure",
};

type GateItem = { key: string; label: string; met: boolean; hint?: string };
type GateData = { current: string; next: string | null; canAdvance: boolean; gates: GateItem[] };

function PhaseRail({ projectId, currentPhase, onPhaseAdvanced }: {
  projectId: string;
  currentPhase: string;
  onPhaseAdvanced: (newPhase: string) => void;
}) {
  const router = useRouter();
  const [gateData, setGateData] = useState<GateData | null>(null);
  const [showGate, setShowGate] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [overrideMode, setOverrideMode] = useState(false);
  const [justification, setJustification] = useState("");
  const [error, setError] = useState("");

  const currentIdx = PHASES.findIndex(p => PHASE_DB[p] === currentPhase);

  async function loadGate() {
    const res = await fetch(`/api/projects/${projectId}/phase-gate`);
    if (res.ok) setGateData(await res.json());
  }

  async function advance(override = false) {
    setAdvancing(true);
    setError("");
    const res = await fetch(`/api/projects/${projectId}/phase-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override, justification: justification || undefined }),
    });
    const data = await res.json();
    if (res.ok) {
      onPhaseAdvanced(data.current);
      router.refresh(); // flush Next.js Router Cache so re-navigation reads fresh DB value
      setShowGate(false);
      setOverrideMode(false);
      setJustification("");
      setGateData(null);
    } else {
      setError(data.error === "GATE_BLOCKED" ? "Gate requirements not met. Use override with justification to proceed." : data.error === "JUSTIFICATION_REQUIRED" ? "Please enter a justification before overriding." : data.error || "Failed");
    }
    setAdvancing(false);
  }

  function openGate() {
    setShowGate(true);
    setOverrideMode(false);
    setError("");
    loadGate();
  }

  const nextPhaseName = PHASES.find(p => PHASE_DB[p] === gateData?.next);

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 26px 16px", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "flex-start" }}>
          {PHASES.map((phase, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div key={phase} style={{ display: "flex", alignItems: "flex-start", flex: i < PHASES.length - 1 ? "1 1 auto" : undefined }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 90, flexShrink: 0 }}>
                  <div style={{
                    width: active ? 38 : 34, height: active ? 38 : 34,
                    marginTop: active ? -2 : 0,
                    borderRadius: "50%",
                    background: done ? C.green : active ? C.surface : "#f2f4f7",
                    border: active ? `3px solid ${C.primary}` : done ? "none" : "1.5px solid #d3d7de",
                    boxShadow: active ? `0 0 0 5px #eef0fc` : done ? `0 2px 6px rgba(21,138,90,.3)` : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {done && <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    {active && <span style={{ width: 11, height: 11, borderRadius: "50%", background: C.primary, display: "block" }} />}
                    {!done && !active && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="#a8adb8" strokeWidth="1.8"/><path d="M8 11V8a4 4 0 018 0v3" stroke="#a8adb8" strokeWidth="1.8"/></svg>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 600, color: active ? C.primary : done ? C.text : "#8a909c", marginTop: 8 }}>{phase}</span>
                  <span style={{ fontSize: 10, color: done ? C.green : active ? C.amber : "#a8adb8", marginTop: 2 }}>
                    {done ? "Gate passed" : active ? "In progress" : "Locked"}
                  </span>
                </div>
                {i < PHASES.length - 1 && (
                  <div style={{ flex: 1, height: 2.5, background: done ? C.green : C.border, marginTop: 16, borderRadius: 2 }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Advance button — hidden if in Closure */}
        {currentIdx < PHASES.length - 1 && (
          <button
            onClick={openGate}
            style={{
              marginLeft: 20, marginTop: 2, height: 34, padding: "0 16px",
              background: C.primary, color: "#fff", border: "none",
              borderRadius: 9, font: `600 12px var(--font-inter),'Inter',sans-serif`,
              cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
              boxShadow: "0 2px 6px rgba(79,91,213,.3)",
            }}
          >
            Advance phase →
          </button>
        )}
      </div>

      {/* Gate checklist panel */}
      {showGate && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                Gate Review: {PHASES[currentIdx]} → {nextPhaseName}
              </span>
              <div style={{ fontSize: 11.5, color: C.text3, marginTop: 2 }}>
                Complete all requirements to advance the project phase.
              </div>
            </div>
            <button onClick={() => setShowGate(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.text3 }}>×</button>
          </div>

          {!gateData ? (
            <div style={{ fontSize: 12.5, color: C.text3, padding: "8px 0" }}>Evaluating gate criteria…</div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {gateData.gates.map((g) => (
                  <div key={g.key} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px",
                    background: g.met ? "#e3f3ea" : "#f7f8fa",
                    borderRadius: 9, border: `1px solid ${g.met ? "#c1e4cf" : C.border}`,
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      background: g.met ? C.green : "#d3d7de",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {g.met
                        ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L19 7" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: g.met ? C.green : C.text }}>{g.label}</div>
                      {!g.met && g.hint && <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{g.hint}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {error && <div style={{ fontSize: 11.5, color: C.red, marginBottom: 10 }}>{error}</div>}

              {overrideMode && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.amber, marginBottom: 6 }}>Override justification (required)</div>
                  <textarea
                    value={justification}
                    onChange={e => setJustification(e.target.value)}
                    placeholder="Explain why gate criteria are being overridden…"
                    rows={2}
                    style={{
                      width: "100%", padding: "8px 10px", fontSize: 12.5,
                      border: `1px solid ${C.border}`, borderRadius: 8,
                      fontFamily: "var(--font-inter),'Inter',sans-serif", resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {gateData.canAdvance ? (
                  <button
                    onClick={() => advance(false)}
                    disabled={advancing}
                    style={{
                      height: 34, padding: "0 18px", background: advancing ? "#8a9ed4" : C.primary,
                      color: "#fff", border: "none", borderRadius: 9,
                      font: `600 12.5px var(--font-inter),'Inter',sans-serif`, cursor: advancing ? "default" : "pointer",
                    }}
                  >{advancing ? "Advancing…" : `Advance to ${nextPhaseName}`}</button>
                ) : overrideMode ? (
                  <button
                    onClick={() => advance(true)}
                    disabled={advancing || !justification.trim()}
                    style={{
                      height: 34, padding: "0 18px",
                      background: advancing || !justification.trim() ? "#e2a060" : C.amber,
                      color: "#fff", border: "none", borderRadius: 9,
                      font: `600 12.5px var(--font-inter),'Inter',sans-serif`,
                      cursor: advancing || !justification.trim() ? "default" : "pointer",
                    }}
                  >{advancing ? "Advancing…" : "Override & Advance"}</button>
                ) : (
                  <button
                    onClick={() => setOverrideMode(true)}
                    style={{
                      height: 34, padding: "0 14px", background: C.surface,
                      color: C.amber, border: `1px solid ${C.amber}40`, borderRadius: 9,
                      font: `500 12px var(--font-inter),'Inter',sans-serif`, cursor: "pointer",
                    }}
                  >Override gate (manager)</button>
                )}
                {overrideMode && (
                  <button onClick={() => { setOverrideMode(false); setJustification(""); }}
                    style={{ background: "none", border: "none", fontSize: 12, color: C.text3, cursor: "pointer" }}>
                    Cancel override
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Project Info tab ────────────────────────────────────────────────────────────

const PROJECT_TYPE_LABELS: Record<string, string> = {
  fixed_bid:          "Fixed Bid (Milestone Based)",
  time_and_material:  "Time and Material",
  fixed_price:        "Fixed Price",
  time_and_materials: "Time & Materials",
  capped_tm:          "Capped T&M",
};

function InfoField({ label, value, emptyHint }: { label: string; value?: string | null; emptyHint?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const }}>{label}</span>
      <span style={{ fontSize: 13.5, color: value ? C.text : (emptyHint ? C.amber : C.text3), fontWeight: value ? 500 : 400, fontStyle: value ? "normal" : (emptyHint ? "italic" : "normal") }}>
        {value || emptyHint || "—"}
      </span>
    </div>
  );
}

function ProjectInfoTab({ project }: { project: any }) {
  const cluster = project.cluster ?? project.account?.cluster ?? null;
  const dhName = project._resolvedDhName ?? cluster?.clusterAssignments?.[0]?.user?.fullName ?? null;
  const dmName = project._resolvedDmName ?? project.account?.dmAssignments?.[0]?.user?.fullName ?? null;

  const [localRevisions, setLocalRevisions] = React.useState<any[]>([]);
  const [localBudget, setLocalBudget] = React.useState<number | null>(project.budget ? Number(project.budget) : null);
  const [localEndDate, setLocalEndDate] = React.useState<string | null>(project.endDate ?? null);
  const originalBudget = localRevisions.length > 0 ? Number(localRevisions[0].previousBudget) : null;
  const [showRevForm, setShowRevForm] = React.useState(false);
  const [revDelta, setRevDelta] = React.useState("");
  const [revReason, setRevReason] = React.useState("");
  const [revCr, setRevCr] = React.useState("");
  const [revNewEndDate, setRevNewEndDate] = React.useState("");
  const [revLoading, setRevLoading] = React.useState(false);
  const [showScheduleRegen, setShowScheduleRegen] = React.useState(false);
  const [regenLoading, setRegenLoading] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/projects/${project.id}/budget-revisions`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setLocalRevisions(data))
      .catch(() => {});
  }, [project.id]);

  async function submitRevision() {
    const delta = parseFloat(revDelta);
    if (!delta || !revReason.trim()) return;
    setRevLoading(true);
    const res = await fetch(`/api/projects/${project.id}/budget-revisions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        delta,
        reason: revReason.trim(),
        crReference: revCr.trim() || undefined,
        newEndDate: revNewEndDate || undefined,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setLocalRevisions(prev => [...prev, data.revision]);
      setLocalBudget(data.newBudget);
      if (data.newEndDate) {
        setLocalEndDate(data.newEndDate);
        setShowScheduleRegen(true);
      }
      setRevDelta(""); setRevReason(""); setRevCr(""); setRevNewEndDate(""); setShowRevForm(false);
    }
    setRevLoading(false);
  }

  async function handleRegenSchedule() {
    setRegenLoading(true);
    await fetch(`/api/projects/${project.id}/schedule/generate`, { method: "POST" });
    setRegenLoading(false);
    setShowScheduleRegen(false);
  }

  return (
    <div style={{ maxWidth: 860, display: "flex", flexDirection: "column" as const, gap: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "24px 28px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: C.text3, textTransform: "uppercase" as const, marginBottom: 20 }}>
          Project Information
        </div>

        {/* Row 1 — Hierarchy */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px 28px", marginBottom: 24 }}>
          <InfoField label="Cluster" value={cluster?.name} />
          <InfoField label="Account" value={project.account?.name} />
          <InfoField label="Program" value={project.program?.name} />
        </div>

        <div style={{ borderTop: `1px solid ${C.borderLight}`, marginBottom: 24 }} />

        {/* Row 2 — People */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px 28px", marginBottom: 24 }}>
          <InfoField label="Delivery Head" value={dhName} emptyHint="Not assigned — set on cluster" />
          <InfoField label="Delivery Manager" value={dmName} emptyHint="Not assigned — set on account" />
          <InfoField label="Project Manager" value={project.pmOwner?.fullName} />
        </div>

        <div style={{ borderTop: `1px solid ${C.borderLight}`, marginBottom: 24 }} />

        {/* Row 3 — Dates & commercial */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px 28px", marginBottom: 24 }}>
          <InfoField label="Start Date" value={project.startDate ? formatDate(project.startDate) : null} />
          <InfoField label="End Date" value={localEndDate ? formatDate(localEndDate) : null} />
          <InfoField label="Billing Type" value={PROJECT_TYPE_LABELS[project.projectType] ?? project.projectType} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px 28px", marginBottom: 24 }}>
          <InfoField label="Methodology" value={methodologyLabel(project.methodology)} />
          <InfoField label="Budget" value={localBudget ? formatCurrency(localBudget, project.currency) : null} />
          <InfoField label="Currency" value={project.currency} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px 28px", marginBottom: 24 }}>
          <InfoField label="Engagement Type" value={project.engagementType === "application_development" ? "Application Development" : project.engagementType === "product_development" ? "Product Development" : project.engagementType ?? null} />
        </div>

        {/* Description */}
        {project.description && (
          <>
            <div style={{ borderTop: `1px solid ${C.borderLight}`, marginBottom: 20 }} />
            <div>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const, display: "block", marginBottom: 8 }}>Description</span>
              <p style={{ fontSize: 13.5, color: C.text, lineHeight: 1.65, margin: 0 }}>{project.description}</p>
            </div>
          </>
        )}
      </div>

      {/* Budget Control card */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <TrendingUp size={15} color={C.primary} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: C.text3, textTransform: "uppercase" as const }}>Budget Control</span>
          </div>
          {!showRevForm && (
            <button onClick={() => setShowRevForm(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.primary}`, background: "#eef0fc", color: C.primary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              <Plus size={12} /> Record Approved CR
            </button>
          )}
        </div>

        {/* Summary row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px 24px", marginBottom: 16 }}>
          <div style={{ background: C.surface2, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: C.text3, marginBottom: 4 }}>ORIGINAL CONTRACT</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{originalBudget !== null ? formatCurrency(originalBudget, project.currency) : localBudget ? formatCurrency(localBudget, project.currency) : "—"}</div>
          </div>
          <div style={{ background: C.surface2, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: C.text3, marginBottom: 4 }}>CR APPROVED ADDITIONS</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: localRevisions.reduce((s, r) => s + Number(r.delta), 0) > 0 ? C.green : C.text }}>
              {formatCurrency(localRevisions.reduce((s, r) => s + Number(r.delta), 0), project.currency)}
            </div>
          </div>
          <div style={{ background: "#eef0fc", borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.primaryBorder}` }}>
            <div style={{ fontSize: 10, color: C.primary, marginBottom: 4 }}>CURRENT BAC (EVM)</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.primary }}>{localBudget ? formatCurrency(localBudget, project.currency) : "—"}</div>
          </div>
        </div>

        {/* Schedule regen banner — shown after a CR extends the end date */}
        {showScheduleRegen && (
          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", marginBottom: 2 }}>
                End date updated to {localEndDate ? formatDate(localEndDate) : "—"}
              </div>
              <div style={{ fontSize: 11, color: "#3b82f6" }}>
                Regenerate WBS &amp; Schedule to align tasks with the new project timeline.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                onClick={handleRegenSchedule}
                disabled={regenLoading}
                style={{ fontSize: 12, fontWeight: 600, background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", cursor: "pointer", opacity: regenLoading ? 0.7 : 1 }}
              >
                {regenLoading ? "Regenerating…" : "Regenerate Schedule"}
              </button>
              <button onClick={() => setShowScheduleRegen(false)} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: "1px solid #93c5fd", background: "#fff", color: "#1d4ed8", cursor: "pointer" }}>Dismiss</button>
            </div>
          </div>
        )}

        {/* Add revision form */}
        {showRevForm && (
          <div style={{ background: "#f8f9ff", border: `1px solid ${C.primaryBorder}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.primary, marginBottom: 12 }}>Record Approved Change Request</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Budget Delta *</div>
                <input type="number" value={revDelta} onChange={e => setRevDelta(e.target.value)}
                  placeholder="e.g. 50000 or -20000"
                  style={{ width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", boxSizing: "border-box" as const }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>CR Reference (optional)</div>
                <input value={revCr} onChange={e => setRevCr(e.target.value)} placeholder="e.g. CR-001"
                  style={{ width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", boxSizing: "border-box" as const }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Reason / Description *</div>
                <input value={revReason} onChange={e => setRevReason(e.target.value)} placeholder="Brief description of what the CR adds..."
                  style={{ width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", boxSizing: "border-box" as const }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>New End Date <span style={{ color: C.text3, fontWeight: 400 }}>(optional — if CR extends timeline)</span></div>
                <input
                  type="date"
                  value={revNewEndDate}
                  onChange={e => setRevNewEndDate(e.target.value)}
                  min={localEndDate ? new Date(new Date(localEndDate).getTime() + 86400000).toISOString().slice(0, 10) : undefined}
                  style={{ width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", boxSizing: "border-box" as const }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={submitRevision} disabled={revLoading || !revDelta || !revReason.trim()} style={{ padding: "6px 16px", borderRadius: 7, background: C.primary, color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: revLoading ? 0.7 : 1 }}>
                {revLoading ? "Saving…" : "Apply CR Budget Change"}
              </button>
              <button onClick={() => { setShowRevForm(false); setRevNewEndDate(""); }} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, fontSize: 12, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Revision history */}
        {localRevisions.length > 0 ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: C.text3, textTransform: "uppercase" as const, marginBottom: 8 }}>Revision History</div>
            <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                  {["Date", "CR Ref", "Reason", "Delta", "New BAC"].map(h => (
                    <th key={h} style={{ padding: "5px 10px", textAlign: "left" as const, fontSize: 10.5, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {localRevisions.map((r: any) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: "8px 10px", color: C.text2 }}>{new Date(r.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td style={{ padding: "8px 10px", color: C.text3 }}>{r.changeRequestId ? "CR" : "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{r.reason}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: Number(r.delta) >= 0 ? C.green : "#dc2626" }}>
                      {Number(r.delta) >= 0 ? "+" : ""}{formatCurrency(Number(r.delta), project.currency)}
                    </td>
                    <td style={{ padding: "8px 10px", fontWeight: 600 }}>{formatCurrency(Number(r.newBudget), project.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.text3, padding: "8px 0" }}>No budget revisions recorded. Use "Record Approved CR" when a change request increases or decreases the contract value.</div>
        )}
      </div>
    </div>
  );
}

// ── Artifacts tab ──────────────────────────────────────────────────────────────

const WBS_SCHEDULE_TYPES = new Set(["wbs", "milestone_plan"]);

function ArtifactsTab({ project, catalog, onNavigate }: { project: any; catalog: any[]; onNavigate?: (tab: string) => void }) {
  const latestStatus = project.statusReports?.[0];
  const healthScore = latestStatus?.healthScore?.compositeScore;
  const healthStatus = project.healthStatus || "green";

  const [latestBaseline, setLatestBaseline] = React.useState<any | null>(null);

  React.useEffect(() => {
    fetch(`/api/projects/${project.id}/scope-baselines`)
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => { if (Array.isArray(data) && data.length > 0) setLatestBaseline(data[0]); })
      .catch(() => {});
  }, [project.id]);

  const staleArtifacts = latestBaseline
    ? (project.artifacts || []).filter((a: any) => a.scopeBaselineId && a.scopeBaselineId !== latestBaseline.id)
    : [];
  const ungeneratedBL = latestBaseline
    ? (project.artifacts || []).filter((a: any) => !a.scopeBaselineId)
    : [];
  const hasScope = !!latestBaseline;

  return (
    <div>
      <div>
        {/* Scope baseline status strip */}
        {hasScope && (staleArtifacts.length > 0 || ungeneratedBL.length > 0) && (
          <div style={{ border: `1px solid #fcd34d`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, background: "#fffbeb", display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e", marginBottom: 4 }}>
                Active baseline: {latestBaseline.label} · some artifacts are stale or not yet generated against this scope
              </div>
              {staleArtifacts.length > 0 && (
                <div style={{ fontSize: 12, color: "#b45309" }}>
                  {staleArtifacts.filter((a: any) => WBS_SCHEDULE_TYPES.has(a.artifactType)).length > 0 && (
                    <span>
                      <strong>WBS / Milestone Plan</strong>{" "}
                      {!latestBaseline.deltaReviewed ? (
                        <>
                          — scope changes pending review.{" "}
                          {onNavigate && (
                            <button
                              onClick={() => onNavigate("Scope Control")}
                              style={{ fontSize: 12, fontWeight: 600, color: "#92400e", background: "#fde68a", border: "1px solid #f59e0b", borderRadius: 5, padding: "1px 8px", cursor: "pointer" }}
                            >
                              Review Delta →
                            </button>
                          )}
                        </>
                      ) : (
                        "— regenerate to align with the new baseline scope."
                      )}
                    </span>
                  )}
                  {staleArtifacts.filter((a: any) => !WBS_SCHEDULE_TYPES.has(a.artifactType)).length > 0 && (
                    <span style={{ display: "block", marginTop: 3 }}>Other stale artifacts can be regenerated to reflect {latestBaseline.label}.</span>
                  )}
                </div>
              )}
              {ungeneratedBL.length > 0 && staleArtifacts.length === 0 && (
                <div style={{ fontSize: 12, color: "#b45309" }}>Regenerate these artifacts to include the scoped requirements from {latestBaseline.label}.</div>
              )}
            </div>
          </div>
        )}
        {hasScope && staleArtifacts.length === 0 && (project.artifacts || []).length > 0 && (
          <div style={{ fontSize: 11, color: "#166534", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "5px 12px", marginBottom: 10, display: "inline-block" }}>
            ✓ All artifacts aligned with {latestBaseline.label}
          </div>
        )}
        <ArtifactPanel
          projectId={project.id}
          artifacts={project.artifacts}
          selections={project.artifactSelections}
          catalog={catalog}
          currentPhase={project.currentPhase || "initiation"}
          engagementMode={project.engagementMode || "detailed"}
        />
      </div>

    </div>
  );
}

// ── Risk tab ────────────────────────────────────────────────────────────────────

const PROB_SCORE: Record<string, number> = { very_low: 2, low: 4, medium: 6, high: 8, very_high: 10 };
const IMP_SCORE: Record<string, number>  = { very_low: 2, low: 4, medium: 6, high: 8, very_high: 10 };
function riskScore(r: any) { return (PROB_SCORE[r.probability] ?? 6) * (IMP_SCORE[r.impact] ?? 6); }
function scoreColor(s: number) {
  if (s >= 60) return { color: C.red, bg: C.redLight };
  if (s >= 36) return { color: C.amber, bg: C.amberLight };
  if (s >= 16) return { color: C.text2, bg: C.surface2 };
  return { color: C.green, bg: C.greenLight };
}
function piColor(v: string) {
  if (v === "very_high" || v === "high") return { color: C.red, bg: C.redLight };
  if (v === "medium") return { color: C.amber, bg: C.amberLight };
  return { color: C.green, bg: C.greenLight };
}

const RISK_STATUSES = ["open", "in_progress", "mitigated", "closed", "escalated"];
const RISK_CATEGORIES = ["Technical", "Schedule", "Cost", "Resource", "External", "Scope", "Organizational", "Other"];
const PI_LEVELS = ["very_low", "low", "medium", "high", "very_high"];

function RiskTab({ project }: { project: any }) {
  const { openPanel, setTabContext } = useCopilot();
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenMsg, setRegenMsg] = useState("");
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState({ description: "", category: "Technical", probability: "medium", impact: "medium", owner: "", mitigation: "", requirementRef: "General" });
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${project.id}/risks`);
    if (res.ok) {
      const data = await res.json();
      setRisks(data);
      setTabContext({
        tab: "risk",
        projectId: project.id,
        projectName: project.name,
        kpiSnapshot: {
          risksOpen: data.filter((r: any) => r.status === "open" || r.status === "in_progress").length,
          risksCritical: data.filter((r: any) => riskScore(r) >= 60).length,
        },
      });
    }
    setLoading(false);
  }, [project.id, project.name, setTabContext]);

  useEffect(() => { load(); }, [load]);

  async function handleImport() {
    setImporting(true); setImportMsg("");
    const res = await fetch(`/api/projects/${project.id}/risks/import`, { method: "POST" });
    const data = await res.json();
    if (res.ok) { setImportMsg(`✓ Imported ${data.imported} risks from artifact`); await load(); }
    else setImportMsg(`✗ ${data.error}`);
    setImporting(false);
  }

  async function handleRegenerate() {
    setRegenerating(true); setRegenMsg("");
    try {
      const res = await fetch(`/api/projects/${project.id}/risks/regenerate`, { method: "POST" });
      let data: any = {};
      try { data = await res.json(); } catch { data = { error: `Server error (${res.status})` }; }
      if (res.ok) {
        setRegenMsg(data.added > 0 ? `✓ Added ${data.added} new risk${data.added !== 1 ? "s" : ""} from baseline` : `✓ ${data.message}`);
        await load();
      } else {
        setRegenMsg(`✗ ${data.error ?? "Regeneration failed"}`);
      }
    } catch (err: any) {
      setRegenMsg(`✗ ${err?.message ?? "Network error — please try again"}`);
    }
    setRegenerating(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.description.trim()) return;
    setSaving("new");
    const res = await fetch(`/api/projects/${project.id}/risks`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newForm),
    });
    if (res.ok) { setAdding(false); setNewForm({ description: "", category: "Technical", probability: "medium", impact: "medium", owner: "", mitigation: "", requirementRef: "General" }); await load(); }
    setSaving(null);
  }

  async function patchRisk(id: string, patch: any) {
    setSaving(id);
    await fetch(`/api/projects/${project.id}/risks/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    await load(); setSaving(null);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch(`/api/projects/${project.id}/risks/${id}`, { method: "DELETE" });
    await load(); setDeleting(null);
  }

  function startEdit(r: any) {
    setEditId(r.id);
    setEditForm({ description: r.description, category: r.category || "", probability: r.probability, impact: r.impact, owner: r.owner || "", mitigation: r.mitigation || "", status: r.status, requirementRef: r.requirementRef || "General" });
  }
  async function saveEdit() {
    if (!editId) return;
    await patchRisk(editId, editForm);
    setEditId(null);
  }

  const filtered = useMemo(() => {
    return risks.filter(r => {
      const sc = riskScore(r);
      const level = sc >= 60 ? "critical" : sc >= 36 ? "high" : sc >= 16 ? "medium" : "low";
      const matchLevel = levelFilter === "all" || level === levelFilter;
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      const matchSearch = !search || r.description?.toLowerCase().includes(search.toLowerCase()) || r.owner?.toLowerCase().includes(search.toLowerCase()) || r.category?.toLowerCase().includes(search.toLowerCase());
      return matchLevel && matchStatus && matchSearch;
    });
  }, [risks, search, levelFilter, statusFilter]);

  const openCount = risks.filter(r => r.status === "open" || r.status === "in_progress").length;
  const criticalCount = risks.filter(r => riskScore(r) >= 60).length;
  const mitigatedCount = risks.filter(r => r.status === "mitigated" || r.status === "closed").length;

  const AI_CHIPS = [
    { icon: "🔍", label: "Review risk quality", msg: `Review the quality of the risk register for project "${project.name}". Are probability and impact ratings calibrated correctly? Are any obvious risks missing?` },
    { icon: "⚡", label: "Identify missing risks", msg: `For project "${project.name}", what risks might we be missing? We currently have ${risks.length} risks logged. Suggest any gaps based on the project type.` },
    { icon: "🛡", label: "Suggest mitigations", msg: `Suggest mitigation strategies for the top open risks in project "${project.name}". Focus on the highest-scoring open risks.` },
    { icon: "🔺", label: "Escalation candidates", msg: `Which risks in project "${project.name}" should be escalated to the sponsor? Look for high score + open status + no mitigation plan.` },
  ];

  if (loading) return <div style={{ padding: "40px 0", textAlign: "center" as const, color: C.text3, fontSize: 14 }}>Loading risks…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      <style>{`@keyframes risk-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        {[
          { label: "Total Risks", value: risks.length, sub: "All categories", color: C.primary, bg: C.primaryLight },
          { label: "Critical / High", value: criticalCount, sub: "Score ≥ 60", color: C.red, bg: C.redLight },
          { label: "Open", value: openCount, sub: "Awaiting mitigation", color: C.amber, bg: C.amberLight },
          { label: "Mitigated", value: mitigatedCount, sub: "Response in place", color: C.green, bg: C.greenLight },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 23, fontWeight: 700, color: k.color, fontFamily: "'IBM Plex Mono',monospace" }}>{k.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, marginTop: 2, letterSpacing: ".04em", textTransform: "uppercase" as const }}>{k.label}</div>
            <div style={{ fontSize: 10.5, color: C.text3, marginTop: 1 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
        <button onClick={() => setAdding(v => !v)} style={{ height: 30, padding: "0 12px", background: C.primary, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>＋ Add Risk</button>
        <button onClick={handleImport} disabled={importing} style={{ height: 30, padding: "0 12px", background: "rgba(0,110,116,.07)", color: C.primary, border: `1px solid rgba(0,110,116,.2)`, borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: importing ? "not-allowed" : "pointer", opacity: importing ? .7 : 1 }}>
          {importing ? "Importing…" : "↓ Import from Risk Register artifact"}
        </button>
        <button onClick={handleRegenerate} disabled={regenerating} title="Runs AI against the current project baseline and appends any new risks — existing risks are not changed" style={{ height: 30, padding: "0 12px", display: "flex", alignItems: "center", gap: 6, background: regenerating ? "rgba(124,58,237,.13)" : "rgba(124,58,237,.07)", color: "#7C3AED", border: "1px solid rgba(124,58,237,.25)", borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: regenerating ? "not-allowed" : "pointer" }}>
          {regenerating ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: "risk-spin 1s linear infinite", flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Analyzing baseline…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M4 4v5h5M20 20v-5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20 12A8 8 0 0 0 6.93 6.93M4 12a8 8 0 0 0 13.07 5.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Regenerate Risks
            </>
          )}
        </button>
        {importMsg && <span style={{ fontSize: 12, color: importMsg.startsWith("✓") ? C.green : C.red }}>{importMsg}</span>}
        <div style={{ flex: 1 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search risks…" style={{ height: 30, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.surface2, color: C.text, width: 180 }} />
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} style={{ height: 30, padding: "0 8px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.surface, color: C.text }}>
          <option value="all">All Levels</option>
          <option value="critical">Critical (≥60)</option>
          <option value="high">High (36–59)</option>
          <option value="medium">Medium (16–35)</option>
          <option value="low">Low (1–15)</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 30, padding: "0 8px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.surface, color: C.text }}>
          <option value="all">All Status</option>
          {RISK_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}</option>)}
        </select>
      </div>

      {/* Regenerate progress banner */}
      {regenerating && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", background: "rgba(124,58,237,.06)", border: "1px solid rgba(124,58,237,.22)", borderRadius: 9 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: "risk-spin 1s linear infinite", flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="#7C3AED" strokeWidth="3" strokeOpacity=".2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#7C3AED" }}>Analyzing baseline and generating risks…</div>
            <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>New risks will be appended below existing ones. Existing risks are not changed. This takes 20–30 seconds.</div>
          </div>
        </div>
      )}

      {/* Regenerate result */}
      {!regenerating && regenMsg && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 14px", background: regenMsg.startsWith("✓") ? "rgba(1,178,124,.08)" : "rgba(252,106,89,.08)", border: `1px solid ${regenMsg.startsWith("✓") ? "rgba(1,178,124,.28)" : "rgba(252,106,89,.28)"}`, borderRadius: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: regenMsg.startsWith("✓") ? C.green : C.red }}>{regenMsg}</span>
          <button onClick={() => setRegenMsg("")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#94a3b8", lineHeight: 1, padding: 0 }}>✕</button>
        </div>
      )}

      {/* AI chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: C.text3 }}>AI Copilot:</span>
        {AI_CHIPS.map(c => (
          <button key={c.label} onClick={() => openPanel(c.msg)} style={{ padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: "rgba(136,30,135,.07)", color: "#881E87", border: "1px solid rgba(136,30,135,.18)", cursor: "pointer" }}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.text }}>New Risk</div>
          <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, color: C.text3, display: "block", marginBottom: 3 }}>Description *</label>
              <input value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} placeholder="Risk description…" required style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text }} />
            </div>
            {[
              { label: "Category", key: "category", options: RISK_CATEGORIES.map(c => ({ value: c, label: c })) },
              { label: "Probability", key: "probability", options: PI_LEVELS.map(p => ({ value: p, label: p.replace("_", " ") })) },
              { label: "Impact", key: "impact", options: PI_LEVELS.map(p => ({ value: p, label: p.replace("_", " ") })) },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11.5, color: C.text3, display: "block", marginBottom: 3 }}>{f.label}</label>
                <select value={(newForm as any)[f.key]} onChange={e => setNewForm(fm => ({ ...fm, [f.key]: e.target.value }))} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text }}>
                  {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11.5, color: C.text3, display: "block", marginBottom: 3 }}>Owner</label>
              <input value={newForm.owner} onChange={e => setNewForm(f => ({ ...f, owner: e.target.value }))} placeholder="Name" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text }} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, color: C.text3, display: "block", marginBottom: 3 }}>Req. Traceability</label>
              <input value={newForm.requirementRef} onChange={e => setNewForm(f => ({ ...f, requirementRef: e.target.value }))} placeholder="REQ-001 or General" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, color: C.text3, display: "block", marginBottom: 3 }}>Mitigation Plan</label>
              <input value={newForm.mitigation} onChange={e => setNewForm(f => ({ ...f, mitigation: e.target.value }))} placeholder="Response / mitigation strategy…" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text }} />
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
              <button type="submit" disabled={saving === "new"} style={{ padding: "7px 16px", background: C.primary, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{saving === "new" ? "Saving…" : "Save Risk"}</button>
              <button type="button" onClick={() => setAdding(false)} style={{ padding: "7px 16px", background: "transparent", color: C.text2, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 88px 72px 72px 50px 100px 110px 90px 72px", gap: 8, padding: "8px 14px", background: C.surface2, fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.text3, borderBottom: `1px solid ${C.border}` }}>
          <span>ID</span><span>Description</span><span>Category</span><span>Prob</span><span>Impact</span><span>Score</span><span>Owner</span><span>Req. Ref</span><span>Status</span><span>Actions</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: "28px 14px", textAlign: "center" as const, color: C.text3, fontSize: 13 }}>
            {risks.length === 0 ? "No risks yet — add one or import from the Risk Register artifact." : "No risks match current filters."}
          </div>
        )}

        {filtered.map((r, i) => {
          const sc = riskScore(r);
          const scC = scoreColor(sc);
          const isEdit = editId === r.id;
          return (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "56px 1fr 88px 72px 72px 50px 100px 110px 90px 72px", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, alignItems: "center", fontSize: 13, background: i % 2 === 1 ? C.surface2 : C.surface }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600, color: C.text3 }}>{r.riskId || `R-${String(i + 1).padStart(3, "0")}`}</span>

              {isEdit ? (
                <input value={editForm.description} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))} style={{ padding: "3px 6px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 13, background: C.surface, color: C.text, width: "100%" }} />
              ) : (
                <span style={{ lineHeight: 1.4 }}>{r.description}</span>
              )}

              {isEdit ? (
                <select value={editForm.category} onChange={e => setEditForm((f: any) => ({ ...f, category: e.target.value }))} style={{ padding: "3px 5px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, background: C.surface, color: C.text }}>
                  {RISK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <span style={{ fontSize: 12, color: C.text3 }}>{r.category || "—"}</span>
              )}

              {isEdit ? (
                <select value={editForm.probability} onChange={e => setEditForm((f: any) => ({ ...f, probability: e.target.value }))} style={{ padding: "3px 5px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, background: C.surface, color: C.text }}>
                  {PI_LEVELS.map(p => <option key={p} value={p}>{p.replace("_", " ")}</option>)}
                </select>
              ) : (
                <span><Badge label={r.probability?.replace("_", " ") || "Med"} color={piColor(r.probability).color} bg={piColor(r.probability).bg} /></span>
              )}

              {isEdit ? (
                <select value={editForm.impact} onChange={e => setEditForm((f: any) => ({ ...f, impact: e.target.value }))} style={{ padding: "3px 5px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, background: C.surface, color: C.text }}>
                  {PI_LEVELS.map(p => <option key={p} value={p}>{p.replace("_", " ")}</option>)}
                </select>
              ) : (
                <span><Badge label={r.impact?.replace("_", " ") || "Med"} color={piColor(r.impact).color} bg={piColor(r.impact).bg} /></span>
              )}

              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: scC.color }}>{sc}</span>

              {isEdit ? (
                <input value={editForm.owner} onChange={e => setEditForm((f: any) => ({ ...f, owner: e.target.value }))} placeholder="Owner" style={{ padding: "3px 6px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, background: C.surface, color: C.text, width: "100%" }} />
              ) : (
                <span style={{ fontSize: 12, color: r.owner ? C.text2 : C.text3, fontStyle: r.owner ? "normal" : "italic" as const }}>{r.owner || "To Be Assigned"}</span>
              )}

              {isEdit ? (
                <input value={editForm.requirementRef} onChange={e => setEditForm((f: any) => ({ ...f, requirementRef: e.target.value }))} placeholder="REQ-001 or General" style={{ padding: "3px 6px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 11, background: C.surface, color: C.text, width: "100%" }} />
              ) : (
                <span style={{ fontSize: 11, color: r.requirementRef && r.requirementRef !== "General" ? C.primary : C.text3, fontFamily: r.requirementRef && r.requirementRef !== "General" ? "'IBM Plex Mono',monospace" : "inherit" }}>{r.requirementRef || "General"}</span>
              )}

              {isEdit ? (
                <select value={editForm.status} onChange={e => setEditForm((f: any) => ({ ...f, status: e.target.value }))} style={{ padding: "3px 5px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, background: C.surface, color: C.text }}>
                  {RISK_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}</option>)}
                </select>
              ) : (
                <select value={r.status} onChange={e => patchRisk(r.id, { status: e.target.value })} disabled={saving === r.id} style={{ padding: "3px 5px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, background: C.surface, color: C.text, cursor: "pointer" }}>
                  {RISK_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}</option>)}
                </select>
              )}

              <div style={{ display: "flex", gap: 4 }}>
                {isEdit ? (
                  <>
                    <button onClick={saveEdit} disabled={saving === r.id} style={{ padding: "3px 8px", background: C.primary, color: "#fff", border: "none", borderRadius: 5, fontSize: 12, cursor: "pointer" }}>✓</button>
                    <button onClick={() => setEditId(null)} style={{ padding: "3px 8px", background: "transparent", color: C.text3, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, cursor: "pointer" }}>✕</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(r)} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, color: C.text3, cursor: "pointer", fontSize: 13 }}>✏</button>
                    <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, color: C.red, cursor: "pointer", fontSize: 13 }}>{deleting === r.id ? "…" : "🗑"}</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length !== risks.length && (
        <div style={{ fontSize: 12, color: C.text3, textAlign: "right" as const }}>Showing {filtered.length} of {risks.length} risks</div>
      )}
    </div>
  );
}

// ── Issues tab ──────────────────────────────────────────────────────────────────

const ISSUE_STATUSES = ["open", "in_progress", "resolved", "closed"];
const ISSUE_SEVERITIES = ["critical", "high", "medium", "low"];

function issueColor(s: string) {
  if (s === "critical") return { color: C.red, bg: C.redLight };
  if (s === "high") return { color: C.amber, bg: C.amberLight };
  if (s === "low") return { color: C.green, bg: C.greenLight };
  return { color: C.text2, bg: C.surface2 };
}

function IssuesTab({ project }: { project: any }) {
  const { openPanel, setTabContext } = useCopilot();
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [search, setSearch] = useState("");
  const [sevFilter, setSevFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState({ description: "", severity: "medium", owner: "", resolution: "" });
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${project.id}/issues`);
    if (res.ok) {
      const data = await res.json();
      setIssues(data);
      setTabContext({
        tab: "issues",
        projectId: project.id,
        projectName: project.name,
        kpiSnapshot: {
          issuesOpen: data.filter((i: any) => i.status === "open" || i.status === "in_progress").length,
          issuesCritical: data.filter((i: any) => i.severity === "critical").length,
        },
      });
    }
    setLoading(false);
  }, [project.id, project.name, setTabContext]);

  useEffect(() => { load(); }, [load]);

  async function handleImport() {
    setImporting(true); setImportMsg("");
    const res = await fetch(`/api/projects/${project.id}/issues/import`, { method: "POST" });
    const data = await res.json();
    if (res.ok) { setImportMsg(`✓ Imported ${data.imported} issues from artifact`); await load(); }
    else setImportMsg(`✗ ${data.error}`);
    setImporting(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.description.trim()) return;
    setSaving("new");
    const res = await fetch(`/api/projects/${project.id}/issues`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newForm),
    });
    if (res.ok) { setAdding(false); setNewForm({ description: "", severity: "medium", owner: "", resolution: "" }); await load(); }
    setSaving(null);
  }

  async function patchIssue(id: string, patch: any) {
    setSaving(id);
    await fetch(`/api/projects/${project.id}/issues/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    await load(); setSaving(null);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch(`/api/projects/${project.id}/issues/${id}`, { method: "DELETE" });
    await load(); setDeleting(null);
  }

  function startEdit(iss: any) {
    setEditId(iss.id);
    setEditForm({ description: iss.description, severity: iss.severity, owner: iss.owner || "", resolution: iss.resolution || "", status: iss.status });
  }
  async function saveEdit() {
    if (!editId) return;
    await patchIssue(editId, editForm);
    setEditId(null);
  }

  const filtered = useMemo(() => {
    return issues.filter(iss => {
      const matchSev = sevFilter === "all" || iss.severity === sevFilter;
      const matchStatus = statusFilter === "all" || iss.status === statusFilter;
      const matchSearch = !search || iss.description?.toLowerCase().includes(search.toLowerCase()) || iss.owner?.toLowerCase().includes(search.toLowerCase());
      return matchSev && matchStatus && matchSearch;
    });
  }, [issues, search, sevFilter, statusFilter]);

  const openCount = issues.filter(i => i.status === "open" || i.status === "in_progress").length;
  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const resolvedCount = issues.filter(i => i.status === "resolved" || i.status === "closed").length;

  const AI_CHIPS = [
    { icon: "🔍", label: "Review issue quality", msg: `Review the quality of the issue register for project "${project.name}". Are severity ratings appropriate? Are resolution plans adequate?` },
    { icon: "💡", label: "Suggest resolutions", msg: `Suggest resolution approaches for the open critical issues in project "${project.name}". We have ${criticalCount} critical issues currently open.` },
    { icon: "🔗", label: "Link issues to risks", msg: `For project "${project.name}", which of the current issues might have corresponding risks that should be raised or updated?` },
    { icon: "📋", label: "Draft escalation memo", msg: `Draft a brief escalation memo for the sponsor covering the critical and overdue issues in project "${project.name}".` },
  ];

  if (loading) return <div style={{ padding: "40px 0", textAlign: "center" as const, color: C.text3, fontSize: 14 }}>Loading issues…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        {[
          { label: "Total Issues", value: issues.length, sub: "All statuses", color: C.primary, bg: C.primaryLight },
          { label: "Critical", value: criticalCount, sub: "Immediate action", color: C.red, bg: C.redLight },
          { label: "Open", value: openCount, sub: "In progress / pending", color: C.amber, bg: C.amberLight },
          { label: "Resolved", value: resolvedCount, sub: "Closed this period", color: C.green, bg: C.greenLight },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 23, fontWeight: 700, color: k.color, fontFamily: "'IBM Plex Mono',monospace" }}>{k.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, marginTop: 2, letterSpacing: ".04em", textTransform: "uppercase" as const }}>{k.label}</div>
            <div style={{ fontSize: 10.5, color: C.text3, marginTop: 1 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
        <button onClick={() => setAdding(v => !v)} style={{ height: 30, padding: "0 12px", background: C.primary, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>＋ Add Issue</button>
        <button onClick={handleImport} disabled={importing} style={{ height: 30, padding: "0 12px", background: "rgba(0,110,116,.07)", color: C.primary, border: `1px solid rgba(0,110,116,.2)`, borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: importing ? "not-allowed" : "pointer", opacity: importing ? .7 : 1 }}>
          {importing ? "Importing…" : "↓ Import from Issue Register artifact"}
        </button>
        {importMsg && <span style={{ fontSize: 12, color: importMsg.startsWith("✓") ? C.green : C.red }}>{importMsg}</span>}
        <div style={{ flex: 1 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search issues…" style={{ height: 30, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.surface2, color: C.text, width: 180 }} />
        <select value={sevFilter} onChange={e => setSevFilter(e.target.value)} style={{ height: 30, padding: "0 8px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.surface, color: C.text }}>
          <option value="all">All Severity</option>
          {ISSUE_SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ height: 30, padding: "0 8px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.surface, color: C.text }}>
          <option value="all">All Status</option>
          {ISSUE_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}</option>)}
        </select>
      </div>

      {/* AI chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: C.text3 }}>AI Copilot:</span>
        {AI_CHIPS.map(c => (
          <button key={c.label} onClick={() => openPanel(c.msg)} style={{ padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: "rgba(136,30,135,.07)", color: "#881E87", border: "1px solid rgba(136,30,135,.18)", cursor: "pointer" }}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.text }}>New Issue</div>
          <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, color: C.text3, display: "block", marginBottom: 3 }}>Description *</label>
              <input value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} placeholder="Issue description…" required style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text }} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, color: C.text3, display: "block", marginBottom: 3 }}>Severity</label>
              <select value={newForm.severity} onChange={e => setNewForm(f => ({ ...f, severity: e.target.value }))} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text }}>
                {ISSUE_SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11.5, color: C.text3, display: "block", marginBottom: 3 }}>Owner</label>
              <input value={newForm.owner} onChange={e => setNewForm(f => ({ ...f, owner: e.target.value }))} placeholder="Name" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11.5, color: C.text3, display: "block", marginBottom: 3 }}>Resolution Plan</label>
              <input value={newForm.resolution} onChange={e => setNewForm(f => ({ ...f, resolution: e.target.value }))} placeholder="Planned resolution approach…" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text }} />
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
              <button type="submit" disabled={saving === "new"} style={{ padding: "7px 16px", background: C.primary, color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{saving === "new" ? "Saving…" : "Save Issue"}</button>
              <button type="button" onClick={() => setAdding(false)} style={{ padding: "7px 16px", background: "transparent", color: C.text2, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 76px 96px 1fr 90px 82px 72px", gap: 8, padding: "8px 14px", background: C.surface2, fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" as const, color: C.text3, borderBottom: `1px solid ${C.border}` }}>
          <span>ID</span><span>Description</span><span>Severity</span><span>Owner</span><span>Resolution Plan</span><span>Status</span><span>Due Date</span><span>Actions</span>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: "28px 14px", textAlign: "center" as const, color: C.text3, fontSize: 13 }}>
            {issues.length === 0 ? "No issues yet — add one or import from the Issue Register artifact." : "No issues match current filters."}
          </div>
        )}

        {filtered.map((iss, i) => {
          const sC = issueColor(iss.severity);
          const isEdit = editId === iss.id;
          return (
            <div key={iss.id} style={{ display: "grid", gridTemplateColumns: "56px 1fr 76px 96px 1fr 90px 82px 72px", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, alignItems: "center", fontSize: 13, background: i % 2 === 1 ? C.surface2 : C.surface }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600, color: C.text3 }}>{iss.issueId || `I-${String(i + 1).padStart(3, "0")}`}</span>

              {isEdit ? (
                <input value={editForm.description} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))} style={{ padding: "3px 6px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 13, background: C.surface, color: C.text, width: "100%" }} />
              ) : <span style={{ lineHeight: 1.4 }}>{iss.description}</span>}

              {isEdit ? (
                <select value={editForm.severity} onChange={e => setEditForm((f: any) => ({ ...f, severity: e.target.value }))} style={{ padding: "3px 5px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, background: C.surface, color: C.text }}>
                  {ISSUE_SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              ) : <span><Badge label={iss.severity || "medium"} color={sC.color} bg={sC.bg} /></span>}

              {isEdit ? (
                <input value={editForm.owner} onChange={e => setEditForm((f: any) => ({ ...f, owner: e.target.value }))} style={{ padding: "3px 6px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, background: C.surface, color: C.text, width: "100%" }} />
              ) : <span style={{ fontSize: 12, color: C.text2 }}>{iss.owner || "—"}</span>}

              {isEdit ? (
                <input value={editForm.resolution} onChange={e => setEditForm((f: any) => ({ ...f, resolution: e.target.value }))} style={{ padding: "3px 6px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, background: C.surface, color: C.text, width: "100%" }} />
              ) : <span style={{ fontSize: 12, color: C.text3 }}>{iss.resolution || "—"}</span>}

              {isEdit ? (
                <select value={editForm.status} onChange={e => setEditForm((f: any) => ({ ...f, status: e.target.value }))} style={{ padding: "3px 5px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, background: C.surface, color: C.text }}>
                  {ISSUE_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}</option>)}
                </select>
              ) : (
                <select value={iss.status} onChange={e => patchIssue(iss.id, { status: e.target.value })} disabled={saving === iss.id} style={{ padding: "3px 5px", border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, background: C.surface, color: C.text, cursor: "pointer" }}>
                  {ISSUE_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}</option>)}
                </select>
              )}

              <span style={{ fontSize: 12, color: C.text2 }}>{iss.dueDate ? new Date(iss.dueDate).toISOString().slice(0, 10) : "—"}</span>

              <div style={{ display: "flex", gap: 4 }}>
                {isEdit ? (
                  <>
                    <button onClick={saveEdit} disabled={saving === iss.id} style={{ padding: "3px 8px", background: C.primary, color: "#fff", border: "none", borderRadius: 5, fontSize: 12, cursor: "pointer" }}>✓</button>
                    <button onClick={() => setEditId(null)} style={{ padding: "3px 8px", background: "transparent", color: C.text3, border: `1px solid ${C.border}`, borderRadius: 5, fontSize: 12, cursor: "pointer" }}>✕</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(iss)} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, color: C.text3, cursor: "pointer", fontSize: 13 }}>✏</button>
                    <button onClick={() => handleDelete(iss.id)} disabled={deleting === iss.id} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, color: C.red, cursor: "pointer", fontSize: 13 }}>{deleting === iss.id ? "…" : "🗑"}</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length !== issues.length && (
        <div style={{ fontSize: 12, color: C.text3, textAlign: "right" as const }}>Showing {filtered.length} of {issues.length} issues</div>
      )}
    </div>
  );
}

// ── Recovery panel ─────────────────────────────────────────────────────────────

type RecoveryStep = { title: string; action: string; effort: string; impact: string };
type RecoveryPlan = {
  headline: string;
  steps: RecoveryStep[];
  estimatedRecovery: string;
  assumptions: string[];
  conflicts: string[];
};

function effortColor(e: string) {
  if (e === "Low") return { color: C.green, bg: C.greenLight };
  if (e === "High") return { color: C.red, bg: C.redLight };
  return { color: C.amber, bg: C.amberLight };
}

function RecoveryPanel({ projectId, spi }: { projectId: string; spi: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<RecoveryPlan | null>(null);
  const [err, setErr] = useState("");
  const PETROL = "#003C51";

  async function load() {
    if (plan) { setOpen(true); return; }
    setOpen(true); setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule/recovery`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPlan(data);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  // Gauge geometry — semicircle over the top, left=SPI 0, right=SPI 1.5
  // Zone boundary points pre-computed: cx=80, cy=92, r=66
  // zone07 @ angle 96°: (73.1, 26.4)  zone09 @ angle 72°: (100.4, 29.2)
  const toRad = (d: number) => d * Math.PI / 180;
  const spiAng = 180 * (1 - Math.min(spi, 1.5) / 1.5);
  const needleX = (80 + 61 * Math.cos(toRad(spiAng))).toFixed(1);
  const needleY = (92 - 61 * Math.sin(toRad(spiAng))).toFixed(1);

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Header strip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "13px 20px",
        background: PETROL, borderRadius: open ? "12px 12px 0 0" : 12,
      }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(207,63,58,.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#ff7875" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-.01em" }}>Schedule at Risk</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, background: "#cf3f3a", color: "#fff", borderRadius: 6, padding: "2px 9px" }}>SPI {spi.toFixed(2)}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)" }}>
            SPI below 0.70 — immediate corrective action required
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {!open && (
            <button onClick={load} style={{
              height: 35, padding: "0 16px", background: C.primary, color: "#fff",
              border: "none", borderRadius: 8, font: `600 13px ${C.FF}`, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Go to Green
            </button>
          )}
          {open && (
            <button onClick={() => setOpen(false)} style={{ background: "rgba(255,255,255,.1)", border: "none", cursor: "pointer", color: "#fff", fontSize: 18, borderRadius: 6, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {open && (
        <div style={{ border: "1.5px solid rgba(0,60,81,.18)", borderTop: "none", borderRadius: "0 0 12px 12px", background: "#f8fafb", overflow: "hidden" }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "22px 24px", color: C.text2, fontSize: 14 }}>
              <span style={{ width: 18, height: 18, border: "2.5px solid #dde2e8", borderTopColor: PETROL, borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
              Analysing schedule and generating recovery plan...
            </div>
          )}
          {err && <div style={{ fontSize: 14, color: C.red, padding: "16px 24px" }}>{err}</div>}
          {plan && (
            <>
              {/* AI headline */}
              <div style={{ padding: "16px 24px", background: "#fff", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: C.primary, marginBottom: 5 }}>AI Recovery Assessment</div>
                <p style={{ fontSize: 14.5, color: C.text, lineHeight: 1.65, margin: 0, fontStyle: "italic" as const }}>"{plan.headline}"</p>
              </div>

              {/* Gauge + steps */}
              <div style={{ display: "flex" }}>
                {/* Left: SPI dial */}
                <div style={{ width: 180, flexShrink: 0, padding: "20px 12px 20px 20px", background: "#fff", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 12 }}>
                  <svg width="140" height="88" viewBox="0 0 160 100">
                    {/* Grey track */}
                    <path d="M 14 92 A 66 66 0 0 0 146 92" fill="none" stroke="#e8edf2" strokeWidth="9" strokeLinecap="round"/>
                    {/* Red zone 0.00–0.70 */}
                    <path d="M 14 92 A 66 66 0 0 0 73.1 26.4" fill="none" stroke="#cf3f3a" strokeWidth="9" strokeLinecap="butt" opacity="0.9"/>
                    {/* Amber zone 0.70–0.90 */}
                    <path d="M 73.1 26.4 A 66 66 0 0 0 100.4 29.2" fill="none" stroke="#c17d12" strokeWidth="9" strokeLinecap="butt" opacity="0.9"/>
                    {/* Green zone 0.90+ */}
                    <path d="M 100.4 29.2 A 66 66 0 0 0 146 92" fill="none" stroke="#158a5a" strokeWidth="9" strokeLinecap="round" opacity="0.9"/>
                    {/* Needle */}
                    <line x1="80" y1="92" x2={needleX} y2={needleY} stroke={PETROL} strokeWidth="2.5" strokeLinecap="round"/>
                    <circle cx="80" cy="92" r="5" fill={PETROL}/>
                    <circle cx="80" cy="92" r="2.5" fill="#fff"/>
                    {/* Value */}
                    <text x="80" y="70" textAnchor="middle" fontSize="20" fontWeight="700" fill="#cf3f3a" fontFamily="monospace">{spi.toFixed(2)}</text>
                    <text x="80" y="82" textAnchor="middle" fontSize="9" fill="#8a909c" letterSpacing="1.5">SPI</text>
                  </svg>
                  <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.9, width: "100%" }}>
                    {[
                      { color: "#cf3f3a", label: "0.00-0.70 Critical" },
                      { color: "#c17d12", label: "0.70-0.90 At risk" },
                      { color: "#158a5a", label: "0.90+     On track" },
                    ].map(({ color, label }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }}/>
                        <span style={{ fontFamily: "monospace", fontSize: 10 }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: step cards */}
                <div style={{ flex: 1, padding: "16px 20px 16px 16px", minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 10 }}>Recovery Steps</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {plan.steps.map((s, i) => {
                      const effortC = effortColor(s.effort);
                      const impactC = effortColor(s.impact);
                      return (
                        <div key={i} style={{
                          background: "#fff", border: `1px solid ${C.border}`,
                          borderLeft: `3px solid ${C.primary}`, borderRadius: "0 10px 10px 0",
                          padding: "11px 13px",
                        }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
                            <div style={{ width: 20, height: 20, borderRadius: "50%", background: PETROL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>{s.title}</div>
                          </div>
                          <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.55, marginBottom: 7 }}>{s.action}</div>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: effortC.color, background: effortC.bg, borderRadius: 4, padding: "1.5px 6px" }}>Effort: {s.effort}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: impactC.color, background: impactC.bg, borderRadius: 4, padding: "1.5px 6px" }}>Impact: {s.impact}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Recovery estimate */}
              <div style={{ padding: "14px 24px", background: "#fff", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke={C.primary} strokeWidth="2"/>
                    <path d="M12 6v6l4 2" stroke={C.primary} strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: C.text3, marginBottom: 2 }}>Estimated Recovery</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.primary }}>{plan.estimatedRecovery}</div>
                </div>
              </div>

              {/* Assumptions & conflicts */}
              {((plan.assumptions?.length ?? 0) > 0 || (plan.conflicts?.length ?? 0) > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${C.border}` }}>
                  {(plan.assumptions?.length ?? 0) > 0 && (
                    <div style={{ padding: "14px 16px 14px 24px", borderRight: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: C.primary, marginBottom: 7 }}>Assumptions</div>
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.text2, lineHeight: 1.7 }}>
                        {plan.assumptions.map((a, i) => <li key={i} style={{ marginBottom: 2 }}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                  {(plan.conflicts?.length ?? 0) > 0 && (
                    <div style={{ padding: "14px 24px 14px 16px", background: "#fffdf7" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" as const, color: C.amber, marginBottom: 7 }}>Risks & Conflicts</div>
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.text2, lineHeight: 1.7 }}>
                        {plan.conflicts.map((c, i) => <li key={i} style={{ marginBottom: 2 }}>{c}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Schedule tab ───────────────────────────────────────────────────────────────

function fmt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function spiColor(spi: number | null) {
  if (spi === null) return C.text3;
  if (spi >= 1) return C.green;
  if (spi >= 0.9) return C.amber;
  return C.red;
}

function addWorkingDays(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

// Build month+week tick headers for the Gantt
function buildGanttHeaders(startMs: number, endMs: number) {
  const weeks: Date[] = [];
  const start = new Date(startMs);
  // snap to Monday
  while (start.getDay() !== 1) start.setDate(start.getDate() - 1);
  const cur = new Date(start);
  const end = new Date(endMs);
  while (cur <= end) {
    weeks.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  // Group by month
  const monthGroups: { label: string; count: number }[] = [];
  for (const w of weeks) {
    const label = w.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    if (monthGroups.length && monthGroups[monthGroups.length - 1].label === label) {
      monthGroups[monthGroups.length - 1].count++;
    } else {
      monthGroups.push({ label, count: 1 });
    }
  }
  return { weeks, monthGroups };
}

// Simple critical-path heuristic: tasks whose baselineFinish is within 2 days of project end
function computeCriticalIds(tasks: any[]): Set<string> {
  if (!tasks.length) return new Set();
  const maxMs = Math.max(...tasks.map(t => new Date(t.baselineFinish).getTime()));
  const threshold = 2 * 24 * 60 * 60 * 1000;
  return new Set(tasks.filter(t => maxMs - new Date(t.baselineFinish).getTime() <= threshold).map(t => t.id));
}

function ScheduleTab({ project }: { project: any }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [kpi, setKpi] = useState<{ pv: number; ev: number; ac: number; sv: number; spi: number | null; completionPct?: number | null; totalActualEffort: number } | null>(null);
  const [costSummary, setCostSummary] = useState<{ totalEV: number; totalAC: number; cpi: number | null; cv: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [milestones, setMilestones] = useState<any[]>(
    [...(project.milestones ?? [])].sort((a: any, b: any) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime())
  );
  const [msCollapsed, setMsCollapsed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cell editing
  const [editCell, setEditCell] = useState<{ taskId: string; field: string } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [assignEditId, setAssignEditId] = useState<string | null>(null);

  // Gantt drag-resize
  const dragRef = useRef<{ taskId: string; startX: number; startDays: number } | null>(null);

  // Regenerate confirmation modal
  const [regenConfirm, setRegenConfirm] = useState<{ tasks: any[] } | null>(null);

  // Collect Actuals
  const [actualsModal, setActualsModal] = useState(false);
  const [cycles, setCycles] = useState<any[]>([]);
  const [cycleStartDate, setCycleStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cycleEndDate, setCycleEndDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [cycleLabel, setCycleLabel] = useState("");
  const [cycleDispatch, setCycleDispatch] = useState(true);
  const [cycleCreating, setCycleCreating] = useState(false);
  const [cycleResult, setCycleResult] = useState<any>(null);
  const [actualsTab, setActualsTab] = useState<"new" | "history">("new");

  // Task selection for actuals
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [actualsStatus, setActualsStatus] = useState<{ cycle: any; taskStatus: Record<string, any> } | null>(null);

  async function loadActualsStatus() {
    const res = await fetch(`/api/projects/${project.id}/actuals/status`);
    if (res.ok) setActualsStatus(await res.json());
  }

  function toggleTaskSelect(taskId: string) {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }

  function selectAllTasks() {
    setSelectedTaskIds(new Set(filteredTasks.map((t: any) => t.id)));
  }

  function clearTaskSelection() {
    setSelectedTaskIds(new Set());
  }

  async function loadCycles() {
    const res = await fetch(`/api/projects/${project.id}/actuals/cycles`);
    if (res.ok) setCycles(await res.json());
  }

  async function createCycle() {
    setCycleCreating(true);
    setCycleResult(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/actuals/cycles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: cycleLabel || undefined,
          startDate: cycleStartDate,
          endDate: cycleEndDate,
          dispatch: true,
          taskIds: selectedTaskIds.size > 0 ? Array.from(selectedTaskIds) : [],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCycleResult(data);
        loadCycles();
        loadActualsStatus();
        clearTaskSelection();
      } else {
        setCycleResult({ error: data.error });
      }
    } finally {
      setCycleCreating(false);
    }
  }

  // Critical path — heuristic highlight (existing) + CPM panel (new)
  const [showCritical, setShowCritical] = useState(false);
  const criticalIds = useMemo(() => computeCriticalIds(tasks), [tasks]);
  const [cpPanelOpen, setCpPanelOpen] = useState(false);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpData, setCpData] = useState<{
    criticalIds: string[];
    nearCriticalIds: string[];
    floatTable: { id: string; name: string; phase: string; duration: number; tf: number; ff: number; critical: boolean; nearCritical: boolean; percentComplete: number }[];
    projectedEnd: string;
    cpDuration: number;
    narrative: string;
  } | null>(null);

  async function runCriticalPath() {
    if (cpLoading) return;
    setCpPanelOpen(true);
    if (cpData) return; // already loaded
    setCpLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/schedule/critical-path`, { method: "POST" });
      if (res.ok) setCpData(await res.json());
    } catch { /* silent */ } finally {
      setCpLoading(false);
    }
  }

  // Schedule filters
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchName = !nameFilter || t.name?.toLowerCase().includes(nameFilter.toLowerCase());
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const matchFrom = !dateFrom || (t.baselineStart && new Date(t.baselineStart) >= new Date(dateFrom));
      const matchTo = !dateTo || (t.baselineFinish && new Date(t.baselineFinish) <= new Date(dateTo));
      return matchName && matchStatus && matchFrom && matchTo;
    });
  }, [tasks, nameFilter, statusFilter, dateFrom, dateTo]);

  // AI Command Bar
  const [aiCmd, setAiCmd] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDiff, setAiDiff] = useState<{ summary: string; patches: any[] } | null>(null);
  const [applyingDiff, setApplyingDiff] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // View mode and phase collapse
  const [viewMode, setViewMode] = useState<"list" | "gantt">("list");
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});

  // Scroll sync refs
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadSchedule = useCallback(async () => {
    const [schedRes, resRes, statusRes, costRes] = await Promise.all([
      fetch(`/api/projects/${project.id}/schedule`),
      fetch(`/api/projects/${project.id}/resources`),
      fetch(`/api/projects/${project.id}/actuals/status`),
      fetch(`/api/projects/${project.id}/costs/burndown`),
    ]);
    if (schedRes.ok) {
      const data = await schedRes.json();
      setTasks(data.tasks ?? []);
      setKpi(data.kpi ?? null);
    }
    if (resRes.ok) setResources(await resRes.json());
    if (statusRes.ok) setActualsStatus(await statusRes.json());
    if (costRes.ok) {
      const costData = await costRes.json();
      if (costData?.summary) setCostSummary(costData.summary);
    }
    setLoading(false);
  }, [project.id]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  // Scroll sync
  useEffect(() => {
    const grid = gridScrollRef.current;
    const gantt = ganttScrollRef.current;
    if (!grid || !gantt) return;
    const onGrid = () => { if (syncingRef.current) return; syncingRef.current = true; gantt.scrollTop = grid.scrollTop; syncingRef.current = false; };
    const onGantt = () => { if (syncingRef.current) return; syncingRef.current = true; grid.scrollTop = gantt.scrollTop; syncingRef.current = false; };
    grid.addEventListener("scroll", onGrid);
    gantt.addEventListener("scroll", onGantt);
    return () => { grid.removeEventListener("scroll", onGrid); gantt.removeEventListener("scroll", onGantt); };
  }, [loading]);

  // Drag-to-resize cleanup
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { taskId, startX, startDays } = dragRef.current;
      const gantt = ganttScrollRef.current;
      if (!gantt) return;
      const pxPerDay = gantt.clientWidth / Math.max(totalDays, 1);
      const deltaDays = Math.round((e.clientX - startX) / pxPerDay);
      const newDays = Math.max(1, startDays + deltaDays);
      setTasks(ts => ts.map(t => {
        if (t.id !== taskId) return t;
        const newFinish = addWorkingDays(new Date(t.baselineStart), newDays);
        return { ...t, baselineDays: newDays, baselineFinish: newFinish.toISOString() };
      }));
    };
    const onUp = async () => {
      if (!dragRef.current) return;
      const { taskId } = dragRef.current;
      dragRef.current = null;
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      setSavingId(taskId);
      const res = await fetch(`/api/projects/${project.id}/schedule/${taskId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineDays: task.baselineDays, baselineFinish: task.baselineFinish }),
      });
      if (res.ok) { const u = await res.json(); setTasks(ts => ts.map(t => t.id === taskId ? { ...t, ...u } : t)); }
      setSavingId(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [tasks, project.id]);

  async function generate(forceConfirm = false) {
    setGenerating(true);
    setError(null);
    const url = forceConfirm
      ? `/api/projects/${project.id}/schedule/generate?confirm=true`
      : `/api/projects/${project.id}/schedule/generate`;
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();

    if (res.status === 409 && data.requiresConfirmation) {
      setGenerating(false);
      setRegenConfirm({ tasks: data.tasksWithProgress as any[] });
      return;
    }

    if (!res.ok) { setError(data.error ?? "Failed to generate schedule"); setGenerating(false); return; }
    await loadSchedule();
    setGenerating(false);
  }

  function computeKpiFromTasks(taskList: any[]) {
    const today = Date.now();
    let totalPV = 0, totalEV = 0, totalAC = 0, totalActualEffort = 0;
    let totalHours = 0, weightedPct = 0;
    for (const t of taskList) {
      const weight = t.estimatedHours != null ? t.estimatedHours : (t.baselineDays || 0) * 8;
      const actualHrs = t.actualHours != null ? Number(t.actualHours) : 0;
      if (!weight || !t.baselineStart || !t.baselineFinish) continue;
      const s = new Date(t.baselineStart).getTime();
      const f = new Date(t.baselineFinish).getTime();
      if (isNaN(s) || isNaN(f) || f <= s) continue;
      const plannedPct = today <= s ? 0 : today >= f ? 1 : (today - s) / (f - s);
      totalPV += weight * plannedPct;
      if (t.percentComplete === 100) {
        totalEV += weight;
        totalAC += actualHrs;
        totalActualEffort += actualHrs;
      }
      totalHours += weight;
      weightedPct += weight * (t.percentComplete / 100);
    }
    const spi = totalPV > 0 ? Math.round((totalEV / totalPV) * 100) / 100 : null;
    const completionPct = totalHours > 0 ? Math.round((weightedPct / totalHours) * 100) : null;
    return {
      pv: Math.round(totalPV * 10) / 10,
      ev: Math.round(totalEV * 10) / 10,
      ac: Math.round(totalAC * 10) / 10,
      sv: Math.round((totalEV - totalPV) * 10) / 10,
      spi,
      completionPct,
      totalActualEffort: Math.round(totalActualEffort * 10) / 10,
    };
  }

  async function patchTask(taskId: string, body: Record<string, unknown>) {
    setSavingId(taskId);
    const res = await fetch(`/api/projects/${project.id}/schedule/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      const newTasks = tasks.map(t => t.id === taskId ? { ...t, ...updated } : t);
      setTasks(newTasks);
      if (
        body.percentComplete !== undefined ||
        body.actualHours !== undefined ||
        body.estimatedHours !== undefined ||
        body.baselineDays !== undefined
      ) {
        setKpi(computeKpiFromTasks(newTasks));
      }
    }
    setSavingId(null);
  }

  async function commitEdit() {
    if (!editCell) return;
    const { taskId, field } = editCell;
    setEditCell(null);
    if (field === "name") {
      if (!editVal.trim()) return;
      await patchTask(taskId, { name: editVal.trim() });
    } else if (field === "baselineDays") {
      // Input is hours; store as estimatedHours and derive baselineDays for schedule span
      const hrs = parseFloat(editVal);
      if (isNaN(hrs) || hrs <= 0) return; // cancel if user entered nothing valid
      const days = Math.max(1, Math.round(hrs / 8));
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      const newFinish = addWorkingDays(new Date(task.baselineStart), days);
      await patchTask(taskId, { baselineDays: days, estimatedHours: Math.round(hrs * 10) / 10, baselineFinish: newFinish.toISOString() });
    } else if (field === "actualHours") {
      const hrs = parseFloat(editVal);
      if (isNaN(hrs) || hrs < 0) return;
      await patchTask(taskId, { actualHours: hrs });
    } else if (field === "percentComplete") {
      const pct = Math.max(0, Math.min(100, parseInt(editVal) || 0));
      await patchTask(taskId, { percentComplete: pct });
    } else if (field === "baselineStart") {
      if (!editVal) return;
      const newStart = new Date(editVal);
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      const newFinish = addWorkingDays(newStart, task.baselineDays);
      await patchTask(taskId, { baselineStart: newStart.toISOString(), baselineFinish: newFinish.toISOString() });
    } else if (field === "actualStart" || field === "actualFinish") {
      if (!editVal) return;
      await patchTask(taskId, { [field]: new Date(editVal).toISOString() });
    } else if (field === "status") {
      await patchTask(taskId, { status: editVal });
    }
  }

  async function deleteTask(taskId: string) {
    setDeletingId(taskId);
    const res = await fetch(`/api/projects/${project.id}/schedule/${taskId}`, { method: "DELETE" });
    if (res.ok) setTasks(ts => ts.filter(t => t.id !== taskId));
    setDeletingId(null);
  }

  async function addTask(phase: string) {
    const existing = tasks.filter(t => t.phase === phase);
    const lastFinish = existing.length
      ? new Date(Math.max(...existing.map(t => new Date(t.baselineFinish).getTime())))
      : (project.startDate ? new Date(project.startDate) : new Date());
    const baselineStart = addWorkingDays(lastFinish, 1);
    const res = await fetch(`/api/projects/${project.id}/schedule`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New task", phase, baselineStart: baselineStart.toISOString(), baselineDays: 5 }),
    });
    if (res.ok) {
      const newTask = await res.json();
      setTasks(ts => [...ts, newTask]);
      setEditCell({ taskId: newTask.id, field: "name" });
      setEditVal("New task");
    }
  }

  async function toggleMilestoneComplete(msId: string, currentStatus: string) {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    setMilestones(ms => ms.map(m => m.id === msId ? { ...m, status: newStatus } : m));
    await fetch(`/api/projects/${project.id}/milestones/${msId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function saveAssignee(taskId: string, resourceId: string | null) {
    setAssignEditId(null);
    const res = await fetch(`/api/projects/${project.id}/schedule/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId }),
    });
    if (res.ok) {
      const updated = await res.json();
      const resource = resourceId ? resources.find(r => r.id === resourceId) ?? null : null;
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, ...updated, resource } : t));
    }
  }

  async function runAiCommand() {
    if (!aiCmd.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiDiff(null);
    const res = await fetch(`/api/projects/${project.id}/schedule/ai-command`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: aiCmd, tasks }),
    });
    const data = await res.json();
    if (!res.ok) { setAiError(data.error ?? "AI command failed"); setAiLoading(false); return; }
    setAiDiff(data);
    setAiLoading(false);
  }

  async function applyAiDiff() {
    if (!aiDiff) return;
    setApplyingDiff(true);
    for (const patch of aiDiff.patches) {
      const body: Record<string, unknown> = {};
      if (patch.field === "baselineStart") {
        body.baselineStart = new Date(patch.newValue).toISOString();
        const task = tasks.find(t => t.id === patch.taskId);
        if (task) body.baselineFinish = addWorkingDays(new Date(patch.newValue), task.baselineDays).toISOString();
      } else if (patch.field === "baselineFinish") {
        body.baselineFinish = new Date(patch.newValue).toISOString();
      } else if (patch.field === "baselineDays") {
        const days = parseInt(patch.newValue) || 1;
        body.baselineDays = days;
        const task = tasks.find(t => t.id === patch.taskId);
        if (task) body.baselineFinish = addWorkingDays(new Date(task.baselineStart), days).toISOString();
      } else if (patch.field === "percentComplete") {
        body.percentComplete = parseInt(patch.newValue) || 0;
      } else if (patch.field === "status") {
        body.status = patch.newValue;
      }
      if (Object.keys(body).length) await patchTask(patch.taskId, body);
    }
    setApplyingDiff(false);
    setAiDiff(null);
    setAiCmd("");
  }

  // Phase colors and list-view helpers
  const PHASE_COLORS: Record<string, string> = { "Initiation": "#006E74", "Planning": "#0097AC", "Execution": "#003C51", "Monitoring": "#0097AC", "Closure": "#01B27C" };
  function phaseColor(p: string) { return PHASE_COLORS[p] ?? "#7A7480"; }
  function cycleTaskStatus(taskId: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const order = ["not_started", "in_progress", "complete"];
    const idx = order.indexOf(task.status ?? "not_started");
    patchTask(taskId, { status: order[(idx + 1) % order.length] });
  }
  function statusChipProps(status: string, pct: number) {
    if (status === "complete" || pct === 100) return { label: "Complete", color: C.green, bg: C.greenLight };
    if (status === "in_progress") return { label: "In progress", color: "#0097AC", bg: "#e0f3f7" };
    if (status === "on_hold") return { label: "On hold", color: C.amber, bg: C.amberLight };
    return { label: "Not started", color: C.text3, bg: C.surface2 };
  }
  // Gantt geometry
  const minStart = tasks.length ? new Date(Math.min(...tasks.map(t => new Date(t.baselineStart).getTime()))) : new Date();
  const maxFinish = tasks.length ? new Date(Math.max(...tasks.map(t => new Date(t.baselineFinish).getTime()))) : new Date();
  const totalMs = Math.max(maxFinish.getTime() - minStart.getTime(), 1);
  const totalDays = totalMs / (24 * 60 * 60 * 1000);
  const today = new Date();
  const todayPct = Math.max(0, Math.min(100, ((today.getTime() - minStart.getTime()) / totalMs) * 100));
  const { weeks, monthGroups } = buildGanttHeaders(minStart.getTime(), maxFinish.getTime());

  const phases = Array.from(new Set(tasks.map(t => t.phase)));
  const ROW_H = 52;
  const GRID_W = 440;

  function barLeft(t: any) { return ((new Date(t.baselineStart).getTime() - minStart.getTime()) / totalMs) * 100; }
  function barWidth(t: any) { return Math.max(0.5, ((new Date(t.baselineFinish).getTime() - new Date(t.baselineStart).getTime()) / totalMs) * 100); }

  if (loading) return <div style={{ padding: "40px 0", textAlign: "center" as const, color: C.text3, fontSize: 14 }}>Loading schedule…</div>;

  const isMilestone = (t: any) => t.baselineDays === 0 || t.phase === "Milestones";
  const isAgile = project.deliveryMethod === "agile_scrum" || project.methodology === "agile_scrum";

  return (
    <div>
      {/* ── Regenerate confirmation modal ── */}
      {regenConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.surface, borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,.18)", width: 420, maxWidth: "90vw", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ background: C.amberLight, borderBottom: `1px solid ${C.amber}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.amber }}>Tasks have recorded progress</div>
                <div style={{ fontSize: 12, color: C.text2, marginTop: 1 }}>Regenerating won&apos;t lose any progress already captured</div>
              </div>
            </div>
            {/* Task list */}
            <div style={{ padding: "14px 18px", maxHeight: 220, overflowY: "auto" as const }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 8 }}>
                {regenConfirm.tasks.length} task{regenConfirm.tasks.length !== 1 ? "s" : ""} with progress
              </div>
              {regenConfirm.tasks.slice(0, 8).map((t: any, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: C.text3, flexShrink: 0 }}>{t.wbsCode}</span>
                  <span style={{ flex: 1, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{t.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.green, flexShrink: 0 }}>{t.percentComplete}%</span>
                </div>
              ))}
              {regenConfirm.tasks.length > 8 && (
                <div style={{ fontSize: 11, color: C.text3, padding: "5px 0" }}>…and {regenConfirm.tasks.length - 8} more</div>
              )}
            </div>
            {/* What happens */}
            <div style={{ padding: "0 18px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 6 }}>What regeneration does</div>
              {[
                ["✓", C.green, "Keeps all existing progress intact"],
                ["+", C.primary, "Adds new tasks from the updated WBS"],
                ["⚑", C.amber, "Flags de-scoped tasks as inactive (not deleted)"],
              ].map(([icon, color, text]) => (
                <div key={text} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color, flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: 12, color: C.text2 }}>{text}</span>
                </div>
              ))}
            </div>
            {/* Actions */}
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setRegenConfirm(null)} style={{ padding: "8px 18px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.surface, color: C.text2, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => { setRegenConfirm(null); generate(true); }} style={{ padding: "8px 20px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, background: C.primary, color: "#fff", cursor: "pointer" }}>
                Regenerate Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Collect Actuals Modal ── */}
      {actualsModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: C.surface, borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,.25)", width: "100%", maxWidth: 460, overflow: "hidden" }}>

            {/* Header */}
            <div style={{ background: C.primary, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>Collect Task Actuals</div>
              <button onClick={() => { setActualsModal(false); setCycleResult(null); }}
                style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 6, color: "#fff", width: 24, height: 24, cursor: "pointer", fontSize: 13 }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
              {(["new", "history"] as const).map(tab => (
                <button key={tab} onClick={() => setActualsTab(tab)}
                  style={{ flex: 1, padding: "9px 0", fontSize: 12, fontWeight: 600, background: "none", border: "none", borderBottom: actualsTab === tab ? `2px solid ${C.primary}` : "2px solid transparent", color: actualsTab === tab ? C.primary : C.text2, cursor: "pointer" }}>
                  {tab === "new" ? "Send Emails" : `History (${cycles.length})`}
                </button>
              ))}
            </div>

            {actualsTab === "new" && (
              <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>

                {/* ── RESULT STATE — shown after send attempt ── */}
                {cycleResult ? (
                  <>
                    {cycleResult.error ? (
                      <div style={{ background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 8, padding: "14px 16px" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 4 }}>Failed to send</div>
                        <div style={{ fontSize: 12, color: C.red }}>{cycleResult.error}</div>
                      </div>
                    ) : (
                      <div style={{ background: C.greenLight, border: `1px solid ${C.green}`, borderRadius: 8, padding: "14px 16px" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 4 }}>✓ Emails sent successfully</div>
                        <div style={{ fontSize: 12, color: C.text2 }}>
                          {cycleResult.emailResults?.filter((r: any) => r.status === "sent").length ?? 0} of {cycleResult.tokensCreated} emails delivered.
                          {cycleResult.emailResults?.some((r: any) => r.status === "failed") && (
                            <span style={{ color: C.red }}> {cycleResult.emailResults.filter((r: any) => r.status === "failed").length} failed — check Admin → Email Config.</span>
                          )}
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
                      <button onClick={() => { setActualsModal(false); setCycleResult(null); }}
                        style={{ padding: "7px 20px", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, background: C.primary, color: "#fff", cursor: "pointer" }}>
                        Done
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* How it works */}
                    <div style={{ background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: C.primary, lineHeight: 1.55 }}>
                      <span style={{ fontWeight: 700 }}>ⓘ How it works — </span>
                      Once you click <strong>Send Emails</strong>, each resource will receive a notification in their email inbox with a secure personal link. Clicking that link opens a public page where they can submit hours worked, % complete, and ETC for the tasks shown — no login required.
                    </div>

                    {/* Tasks */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", marginBottom: 6 }}>
                        Tasks in this request
                      </div>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", maxHeight: 160, overflowY: "auto" as const }}>
                        {(selectedTaskIds.size > 0 ? tasks.filter((t: any) => selectedTaskIds.has(t.id)) : tasks).map((t: any, i: number, arr: any[]) => (
                          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : "none", background: C.surface }}>
                            <span style={{ fontFamily: "monospace", fontSize: 10, color: C.text3, flexShrink: 0 }}>{t.wbsCode}</span>
                            <span style={{ fontSize: 12, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{t.name}</span>
                          </div>
                        ))}
                      </div>
                      {selectedTaskIds.size === 0 && (
                        <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>All {tasks.length} tasks included. Select tasks in the schedule to send a subset.</div>
                      )}
                    </div>

                    {/* Period */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", display: "block", marginBottom: 3 }}>Period Start</label>
                        <input type="date" value={cycleStartDate} onChange={e => setCycleStartDate(e.target.value)}
                          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 9px", fontSize: 13, background: C.surface2, color: C.text, outline: "none", boxSizing: "border-box" as const }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", display: "block", marginBottom: 3 }}>Period End</label>
                        <input type="date" value={cycleEndDate} onChange={e => setCycleEndDate(e.target.value)}
                          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 9px", fontSize: 13, background: C.surface2, color: C.text, outline: "none", boxSizing: "border-box" as const }} />
                      </div>
                    </div>

                    {/* Email config note */}
                    <div style={{ fontSize: 11, color: C.text3, display: "flex", alignItems: "center", gap: 5 }}>
                      <span>⚙</span>
                      Email sender must be configured in <strong style={{ color: C.text2 }}>Admin → Email Configuration</strong> before emails can be dispatched.
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 2 }}>
                      <button onClick={() => { setActualsModal(false); setCycleResult(null); }}
                        style={{ padding: "7px 14px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.surface, color: C.text2, cursor: "pointer" }}>
                        Cancel
                      </button>
                      <button onClick={createCycle} disabled={cycleCreating || !cycleStartDate || !cycleEndDate}
                        style={{ padding: "7px 18px", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 700, background: cycleCreating ? C.surface2 : C.primary, color: cycleCreating ? C.text3 : "#fff", cursor: cycleCreating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                        {cycleCreating && <span style={{ display: "inline-block", width: 11, height: 11, border: "2px solid #ccc", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
                        {cycleCreating ? "Sending…" : "Send Emails"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {actualsTab === "history" && (
              <div style={{ padding: 16, maxHeight: 380, overflowY: "auto" as const }}>
                {cycles.length === 0 && <div style={{ color: C.text3, fontSize: 13, textAlign: "center" as const, padding: "24px 0" }}>No cycles yet. Use &quot;Send Emails&quot; to create one.</div>}
                {cycles.map((c: any) => (
                  <div key={c.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Cycle {c.cycleNumber}</span>
                      {c.label && <span style={{ fontSize: 12, color: C.text2 }}>— {c.label}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999,
                        background: c.status === "open" ? C.greenLight : C.surface2,
                        color: c.status === "open" ? C.green : C.text3 }}>
                        {c.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: C.text3 }}>
                      {new Date(c.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} –{" "}
                      {new Date(c.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <div style={{ fontSize: 12, color: C.text2 }}>Compliance: <strong style={{ color: c.compliance >= 80 ? C.green : c.compliance >= 50 ? C.amber : C.red }}>{c.compliance}%</strong></div>
                      <div style={{ fontSize: 12, color: C.text2 }}>{c.submittedCount}/{c.totalResources} submitted</div>
                      <div style={{ fontSize: 12, color: C.text2 }}>{c.actualsCount} entries</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" as const }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>Project Schedule</div>
          {tasks.length > 0 && <div style={{ fontSize: 12, color: C.text3, marginTop: 1 }}>{tasks.length} tasks · {phases.length} phases</div>}
          {(project.startDate || project.endDate) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, fontSize: 12 }}>
              <CalendarDays size={12} color={C.primary} />
              <span style={{ color: C.text3 }}>Project window:</span>
              <span style={{ fontWeight: 600, color: C.primary }}>
                {project.startDate ? new Date(project.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "TBD"}
              </span>
              <span style={{ color: C.text3 }}>→</span>
              <span style={{ fontWeight: 600, color: C.primary }}>
                {project.endDate ? new Date(project.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "TBD"}
              </span>
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        {tasks.length > 0 && (
          <div style={{ display: "flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {(["list", "gantt"] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                style={{ height: 30, padding: "0 12px", background: viewMode === v ? C.primary : C.surface, color: viewMode === v ? "#fff" : C.text2, border: "none", font: `500 12px var(--font-inter),'Inter'`, cursor: "pointer" }}>
                {v === "list" ? "☰ List" : "≡ Timeline"}
              </button>
            ))}
          </div>
        )}
        {tasks.length > 0 && (
          <button onClick={runCriticalPath}
            style={{ height: 30, padding: "0 12px", background: cpPanelOpen ? C.red : C.surface, color: cpPanelOpen ? "#fff" : C.text2, border: `1px solid ${cpPanelOpen ? C.red : C.border}`, borderRadius: 8, font: `600 12px var(--font-inter),'Inter'`, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            {cpPanelOpen ? "✕ Close CP" : "Critical Path"}
          </button>
        )}
        {tasks.length > 0 && viewMode === "gantt" && (
          <button onClick={() => setShowCritical(v => !v)}
            style={{ height: 30, padding: "0 11px", background: showCritical ? C.redLight : C.surface, color: showCritical ? C.red : C.text2, border: `1px solid ${showCritical ? C.red : C.border}`, borderRadius: 8, font: `500 12px var(--font-inter),'Inter'`, cursor: "pointer" }}>
            {showCritical ? "✕ Critical" : "⚑ Critical"}
          </button>
        )}
        {tasks.length > 0 && (
          <a href={`/api/projects/${project.id}/schedule/export`} download
            style={{ height: 30, padding: "0 12px", background: C.surface, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 8, font: `500 12px var(--font-inter),'Inter'`, cursor: "pointer", display: "flex", alignItems: "center", textDecoration: "none" }}>
            ↓ Export
          </a>
        )}
        <button onClick={() => generate()} disabled={generating}
          style={{ height: 30, padding: "0 12px", background: generating ? C.surface2 : C.primary, color: generating ? C.text3 : "#fff", border: "none", borderRadius: 8, font: `500 12px var(--font-inter),'Inter'`, cursor: generating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          {generating
            ? <><span style={{ display: "inline-block", width: 11, height: 11, border: "2px solid #ccc", borderTopColor: C.primary, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Generating…</>
            : tasks.length > 0 ? "↺ Regenerate" : "✦ Generate from WBS"}
        </button>
        {tasks.length > 0 && (
          <button onClick={() => { setActualsModal(true); setActualsTab("new"); loadCycles(); }}
            style={{ height: 30, padding: "0 12px", background: selectedTaskIds.size > 0 ? C.primary : C.surface, color: selectedTaskIds.size > 0 ? "#fff" : C.primary, border: `1px solid ${C.primaryBorder}`, borderRadius: 8, font: `500 12px var(--font-inter),'Inter'`, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            ⟳ {selectedTaskIds.size > 0 ? `Collect Actuals (${selectedTaskIds.size} task${selectedTaskIds.size !== 1 ? "s" : ""})` : "Collect Actuals"}
          </button>
        )}
      </div>

      {error && <div style={{ padding: "10px 14px", background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 9, fontSize: 14, color: C.red, marginBottom: 14 }}>{error}</div>}

      {tasks.length === 0 && !error && (
        <div style={{ background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: "32px 24px", textAlign: "center" as const }}>
          <div style={{ fontSize: 33, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.primary, marginBottom: 8 }}>No schedule yet</div>
          <div style={{ fontSize: 14, color: C.text2, maxWidth: 480, margin: "0 auto 18px" }}>
            Generate a schedule from your WBS artifact. The AI will sequence all work packages using critical-path scheduling, respecting dependencies and a 5-day working week.
          </div>
          <div style={{ fontSize: 13, color: C.text3 }}>You can also upload a new WBS (via the Artifacts tab) and then regenerate.</div>
        </div>
      )}

      {tasks.length > 0 && (
        <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {/* ── Task selection strip ── */}
          {viewMode === "list" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "7px 12px", background: selectedTaskIds.size > 0 ? C.primaryLight : C.surface2, border: `1px solid ${selectedTaskIds.size > 0 ? C.primaryBorder : C.border}`, borderRadius: 8 }}>
              <input type="checkbox"
                checked={filteredTasks.length > 0 && filteredTasks.every((t: any) => selectedTaskIds.has(t.id))}
                ref={(el) => { if (el) el.indeterminate = selectedTaskIds.size > 0 && selectedTaskIds.size < filteredTasks.length; }}
                onChange={(e) => e.target.checked ? selectAllTasks() : clearTaskSelection()}
                style={{ width: 14, height: 14, cursor: "pointer", accentColor: C.primary }} />
              {selectedTaskIds.size === 0 ? (
                <span style={{ fontSize: 12, color: C.text3 }}>Select tasks to collect actuals for specific tasks, or click &quot;Collect Actuals&quot; to include all</span>
              ) : (
                <>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.primary }}>{selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? "s" : ""} selected</span>
                  <button onClick={clearTaskSelection} style={{ fontSize: 11, color: C.text3, background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>✕ Clear</button>
                </>
              )}
              {actualsStatus?.cycle && (
                <div style={{ marginLeft: "auto", fontSize: 11, color: C.text3, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: actualsStatus.cycle.status === "open" ? C.green : C.text3, display: "inline-block" }} />
                  {actualsStatus.cycle.status === "open" ? "Active" : "Closed"} cycle #{actualsStatus.cycle.cycleNumber}
                  {actualsStatus.cycle.totalResources > 0 && (
                    <span style={{ fontWeight: 600, color: actualsStatus.cycle.submittedResources === actualsStatus.cycle.totalResources ? C.green : C.amber }}>
                      · {actualsStatus.cycle.submittedResources}/{actualsStatus.cycle.totalResources} submitted
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── EVM KPI strip (waterfall only) ── */}
          {!isAgile && <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            {(() => {
              const sv = kpi?.ev != null && kpi?.pv != null ? kpi.ev - kpi.pv : null;
              const svColor = sv == null ? C.text2 : sv >= 0 ? C.green : C.red;
              const svBg   = sv == null ? C.surface2 : sv >= 0 ? C.greenLight : C.redLight;
              const toHrs = (h: number) => `${Math.round(h)}h`;
              // Use server-computed values so EV and AC are always from the same DB snapshot
              const evHrs = kpi?.ev ?? null;
              const ac    = kpi?.ac ?? 0;
              const actualEffort = kpi?.totalActualEffort ?? 0;
              const cv = evHrs != null && ac > 0 ? evHrs - ac : null;
              const cvColor = cv == null ? C.text2 : cv >= 0 ? C.green : C.red;
              const cvBg    = cv == null ? C.surface2 : cv >= 0 ? C.greenLight : C.redLight;
              const cpi = evHrs != null && ac > 0 ? evHrs / ac : null;
              const cpiColor = cpi == null ? C.text2 : cpi >= 1 ? C.green : cpi >= 0.9 ? C.amber : C.red;
              const cpiBg    = cpi == null ? C.surface2 : cpi >= 1 ? C.greenLight : cpi >= 0.9 ? C.amberLight : C.redLight;
              const bac = project.budget ?? null;
              const cur = project.currency ?? "USD";
              const eac = cpi != null && cpi > 0 && bac ? bac / cpi : null;
              const rnd = (n: number) => `${Math.round(n)}h`;
              return [
                { label: "PV",  value: kpi?.pv  != null ? toHrs(kpi.pv)  : "—", sub: "Planned value",   color: C.text2, bg: C.surface2 },
                { label: "EV",  value: kpi?.ev  != null ? toHrs(kpi.ev)  : "—", sub: "Earned value",    color: C.primary, bg: C.primaryLight },
                { label: "SV",  value: sv != null ? `${sv >= 0 ? "+" : ""}${toHrs(sv)}` : "—", sub: sv == null ? "SV = EV − PV" : sv >= 0 ? "Ahead ✓" : "Behind", color: svColor, bg: svBg },
                { label: "SPI", value: kpi?.spi != null ? kpi.spi.toFixed(2) : "—", sub: kpi?.spi == null ? "SPI = EV ÷ PV" : kpi.spi >= 1 ? "On track ✓" : kpi.spi >= 0.9 ? "Slightly behind" : "Behind", color: spiColor(kpi?.spi ?? null), bg: kpi?.spi == null ? C.surface2 : kpi.spi >= 1 ? C.greenLight : kpi.spi >= 0.9 ? C.amberLight : C.redLight },
                { label: "Actual Effort", value: actualEffort > 0 ? rnd(actualEffort) : "—", sub: "Actual hrs on closed tasks", color: C.text2, bg: C.surface2 },
                { label: "CV",  value: cv != null ? `${cv >= 0 ? "+" : ""}${rnd(cv)}` : "—", sub: cv == null ? "EV − AC (closed tasks)" : cv >= 0 ? "Efficient ✓" : "Over effort", color: cvColor, bg: cvBg },
                { label: "CPI", value: cpi != null ? cpi.toFixed(2) : "—", sub: cpi == null ? "EV ÷ AC (closed tasks)" : cpi >= 1 ? "Efficient ✓" : "Over effort", color: cpiColor, bg: cpiBg },
                { label: "EAC", value: eac != null ? formatCurrency(eac, cur) : "—", sub: "Budget ÷ CPI — Estimate at Completion", color: C.text2, bg: C.surface2 },
              ];
            })().map(k => (
              <div key={k.label} style={{ flex: 1, background: k.bg, borderRadius: 10, padding: "11px 13px" }}>
                <div style={{ fontSize: 21, fontWeight: 600, color: k.color, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: k.color, textTransform: "uppercase" as const, letterSpacing: ".06em", marginTop: 2 }}>{k.label}</div>
                <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>}

          {!isAgile && kpi?.spi != null && kpi.spi < 0.7 && <RecoveryPanel projectId={project.id} spi={kpi.spi} />}

          {/* ── Summary strip ── */}
          {(() => {
            const done = tasks.filter(t => t.status === "complete" || t.percentComplete === 100).length;
            const inprog = tasks.filter(t => t.status === "in_progress" && t.percentComplete < 100).length;
            const notstarted = tasks.filter(t => (!t.status || t.status === "not_started") && t.percentComplete === 0).length;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" as const }}>
                {done > 0 && <span style={{ padding: "3px 9px", borderRadius: 20, background: C.greenLight, color: C.green, fontSize: 12, fontWeight: 500 }}>✓ {done} done</span>}
                {inprog > 0 && <span style={{ padding: "3px 9px", borderRadius: 20, background: C.primaryLight, color: C.primary, fontSize: 12, fontWeight: 500 }}>◑ {inprog} in progress</span>}
                {notstarted > 0 && <span style={{ padding: "3px 9px", borderRadius: 20, background: C.surface2, color: C.text3, fontSize: 12, fontWeight: 500 }}>○ {notstarted} not started</span>}
              </div>
            );
          })()}

          {/* ── Filters ── */}
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" as const, marginBottom: 14 }}>
            <input value={nameFilter} onChange={e => setNameFilter(e.target.value)} placeholder="🔍 Filter tasks…"
              style={{ height: 30, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.surface2, color: C.text, width: 180, outline: "none" }} />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ height: 30, padding: "0 8px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.surface, color: C.text }}>
              <option value="all">All statuses</option>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
              <option value="on_hold">On hold</option>
            </select>
            {viewMode === "gantt" && (
              <>
                <span style={{ fontSize: 12, color: C.text3 }}>From</span>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ height: 30, padding: "0 8px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.surface, color: C.text }} />
                <span style={{ fontSize: 12, color: C.text3 }}>To</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ height: 30, padding: "0 8px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13, background: C.surface, color: C.text }} />
              </>
            )}
            {(nameFilter || statusFilter !== "all" || dateFrom || dateTo) && (
              <button onClick={() => { setNameFilter(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}
                style={{ height: 30, padding: "0 10px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 12, background: "transparent", color: C.text3, cursor: "pointer" }}>✕ Clear</button>
            )}
            {filteredTasks.length !== tasks.length && (
              <span style={{ fontSize: 12, color: C.text3 }}>Showing {filteredTasks.length} of {tasks.length}</span>
            )}
          </div>

          {/* ── List view ── */}
          {viewMode === "list" && (
            <div>
              {phases.map(phase => {
                const phaseTasks = filteredTasks.filter(t => t.phase === phase);
                const totalForPhase = tasks.filter(t => t.phase === phase).length;
                const doneForPhase = tasks.filter(t => t.phase === phase && (t.status === "complete" || t.percentComplete === 100)).length;
                const isCollapsed = !!collapsedPhases[phase];
                const pColor = phaseColor(phase);
                const doneBg = doneForPhase === totalForPhase && totalForPhase > 0 ? C.greenLight : doneForPhase > 0 ? C.primaryLight : C.surface2;
                const doneC  = doneForPhase === totalForPhase && totalForPhase > 0 ? C.green : doneForPhase > 0 ? C.primary : C.text3;
                return (
                  <div key={phase} style={{ marginBottom: 6 }}>
                    <div onClick={() => setCollapsedPhases(prev => ({ ...prev, [phase]: !prev[phase] }))}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: isCollapsed ? 8 : "8px 8px 0 0", border: `1px solid ${C.border}`, borderBottom: isCollapsed ? `1px solid ${C.border}` : "none", background: C.surface2, cursor: "pointer", userSelect: "none" as const }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.surface)}
                      onMouseLeave={e => (e.currentTarget.style.background = C.surface2)}>
                      <span style={{ fontSize: 11, color: C.text3, display: "inline-block", transition: "transform .17s", transform: isCollapsed ? "none" : "rotate(90deg)" }}>▶</span>
                      <div style={{ width: 9, height: 9, borderRadius: "50%", background: pColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" as const, color: C.text }}>{phase}</span>
                      <span style={{ fontSize: 12, color: C.text3 }}>{totalForPhase} task{totalForPhase !== 1 ? "s" : ""}</span>
                      <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: doneBg, color: doneC }}>{doneForPhase}/{totalForPhase} done</span>
                      <button onClick={e => { e.stopPropagation(); addTask(phase); }}
                        style={{ height: 24, padding: "0 9px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, font: `500 11px var(--font-inter),'Inter'`, color: C.text3, cursor: "pointer" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.primaryLight; (e.currentTarget as HTMLElement).style.color = C.primary; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.surface; (e.currentTarget as HTMLElement).style.color = C.text3; }}>
                        + Add
                      </button>
                    </div>
                    {!isCollapsed && (
                      <div style={{ border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden", background: C.surface }}>
                        <div style={{ display: "grid", gridTemplateColumns: "36px minmax(200px,400px) 120px 100px 150px 54px 54px 44px 44px 1fr", alignItems: "center", padding: "4px 0", borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
                          <div />
                          <div style={{ minWidth: 0, paddingRight: 8 }}><span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".07em", color: C.text3 }}>Task name</span></div>
                          <div style={{ textAlign: "center" as const }}><span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".07em", color: C.text3 }}>Dates</span></div>
                          <div><span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".07em", color: C.text3 }}>Status</span></div>
                          <div><span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".07em", color: C.text3 }}>Assignee</span></div>
                          <div style={{ textAlign: "center" as const }}><span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".07em", color: C.text3 }}>Est. Hrs</span></div>
                          <div style={{ textAlign: "center" as const }}><span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".07em", color: C.text3 }}>Actual</span></div>
                          <div style={{ textAlign: "center" as const }}><span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".07em", color: C.text3 }}>%</span></div>
                          <div />
                        </div>
                        {phaseTasks.map((t, rowIdx) => {
                          const chip = statusChipProps(t.status, t.percentComplete);
                          const isCrit = (showCritical && criticalIds.has(t.id)) || (cpPanelOpen && cpData && cpData.criticalIds.includes(t.id));
                          const isHover = hoverRowId === t.id;
                          const isSelected = selectedTaskIds.has(t.id);
                          const isDone = t.status === "complete" || t.status === "completed" || t.percentComplete === 100;
                          const isEditName = editCell?.taskId === t.id && editCell?.field === "name";
                          const isEditDays = editCell?.taskId === t.id && editCell?.field === "baselineDays";
                          const isEditPct  = editCell?.taskId === t.id && editCell?.field === "percentComplete";
                          const avc = t.resource ? resAvatarColor(t.resource.name) : C.text3;
                          const avatarInitial = t.resource?.name?.charAt(0).toUpperCase() ?? "?";
                          const actualsInfo = actualsStatus?.taskStatus?.[t.id];
                          const isNearCrit = cpPanelOpen && cpData && cpData.nearCriticalIds.includes(t.id);
                          return (
                            <div key={t.id} onMouseEnter={() => setHoverRowId(t.id)} onMouseLeave={() => setHoverRowId(null)}
                              style={{ display: "grid", gridTemplateColumns: "52px minmax(200px,400px) 120px 100px 150px 54px 54px 44px 44px 1fr", alignItems: "center", minHeight: 52, borderBottom: rowIdx < phaseTasks.length - 1 ? `1px solid ${C.borderLight}` : "none", borderLeft: `3px solid ${isCrit ? C.red : isNearCrit ? C.amber : isSelected ? C.primary : "transparent"}`, background: isSelected ? C.primaryLight : isHover ? C.surface2 : "transparent", transition: "background .1s" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                <input type="checkbox" checked={isSelected} onChange={() => !isDone && toggleTaskSelect(t.id)}
                                  onClick={e => e.stopPropagation()}
                                  disabled={isDone}
                                  title={isDone ? "Task completed" : undefined}
                                  style={{ width: 13, height: 13, cursor: isDone ? "not-allowed" : "pointer", accentColor: C.primary, opacity: isDone ? 0.35 : 1 }} />
                                <div style={{ width: 10, height: 10, borderRadius: "50%", border: `1.5px solid ${chip.color}`, background: chip.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  {(t.status === "complete" || t.percentComplete === 100) && <span style={{ fontSize: 6, color: C.green, fontWeight: 700 }}>✓</span>}
                                  {t.status === "in_progress" && t.percentComplete < 100 && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#0097AC" }} />}
                                </div>
                              </div>
                              <div style={{ minWidth: 0, padding: "8px 8px 8px 0" }}>
                                {isEditName ? (
                                  <input ref={inputRef} autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit}
                                    onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }}
                                    style={{ width: "100%", fontSize: 14, border: `1px solid ${C.primary}`, borderRadius: 5, padding: "2px 5px", fontFamily: "var(--font-inter),'Inter',sans-serif", color: C.text }} />
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                                    <div onClick={() => { setEditCell({ taskId: t.id, field: "name" }); setEditVal(t.name); }}
                                      style={{ fontSize: 14, fontWeight: 500, color: isCrit ? C.red : C.text, cursor: "text", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }} title={t.name}>
                                      {t.name}
                                    </div>
                                    {actualsInfo?.collected && (
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: C.greenLight, color: C.green, flexShrink: 0, whiteSpace: "nowrap" as const }}>
                                        ✓ Actuals
                                      </span>
                                    )}
                                    {!actualsInfo?.collected && actualsInfo?.pendingCount > 0 && (
                                      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: C.amberLight, color: C.amber, flexShrink: 0, whiteSpace: "nowrap" as const }}>
                                        ⏳ Awaiting
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
                                  <div style={{ flex: 1, height: 3, borderRadius: 3, background: C.border, overflow: "hidden", maxWidth: 180 }}>
                                    <div style={{ height: "100%", borderRadius: 3, width: `${t.percentComplete}%`, background: t.status === "complete" || t.percentComplete === 100 ? C.green : t.percentComplete > 0 ? C.primary : C.border, transition: "width .3s" }} />
                                  </div>
                                </div>
                              </div>
                              <div style={{ padding: "0 6px", fontSize: 12, color: C.text2, textAlign: "center" as const, lineHeight: 1.5 }}>
                                {fmt(t.baselineStart)}<br /><span style={{ fontSize: 11, color: C.text3 }}>→ {fmt(t.baselineFinish)}</span>
                              </div>
                              <div style={{ padding: "0 5px" }}>
                                <button onClick={() => cycleTaskStatus(t.id)} title="Click to advance status"
                                  style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 20, fontSize: 11.5, fontWeight: 500, border: "none", cursor: "pointer", color: chip.color, background: chip.bg }}>
                                  {chip.label}
                                </button>
                              </div>
                              <div style={{ padding: "0 4px", display: "flex", alignItems: "center", gap: 5 }}>
                                {assignEditId === t.id ? (
                                  <select autoFocus defaultValue={t.resource?.id ?? ""}
                                    onBlur={e => saveAssignee(t.id, e.target.value || null)}
                                    onChange={e => saveAssignee(t.id, e.target.value || null)}
                                    style={{ fontSize: 12, height: 22, border: `1px solid ${C.primary}`, borderRadius: 4, width: "100%", background: C.surface }}>
                                    <option value="">— Unassigned —</option>
                                    {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                  </select>
                                ) : (
                                  <>
                                    <div onClick={() => resources.length > 0 && setAssignEditId(t.id)} title="Click to assign"
                                      style={{ width: 22, height: 22, borderRadius: "50%", background: avc, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff", flexShrink: 0, cursor: resources.length > 0 ? "pointer" : "default" }}>
                                      {avatarInitial}
                                    </div>
                                    <span onClick={() => resources.length > 0 && setAssignEditId(t.id)}
                                      style={{ fontSize: 12, color: t.resource ? C.text2 : C.text3, cursor: resources.length > 0 ? "pointer" : "default", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 76 }}>
                                      {t.resource ? t.resource.name : resources.length > 0 ? "+ Assign" : ""}
                                    </span>
                                  </>
                                )}
                              </div>
                              {/* Est. Hrs — editable */}
                              <div style={{ textAlign: "center" as const, cursor: "text" }}
                                onClick={() => { setEditCell({ taskId: t.id, field: "baselineDays" }); setEditVal(String(t.estimatedHours != null ? t.estimatedHours : t.baselineDays * 8)); }}>
                                {isEditDays ? (
                                  <input autoFocus type="number" min={1} step={4} value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit}
                                    onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }}
                                    style={{ width: 42, height: 22, textAlign: "center", fontSize: 13, border: `1px solid ${C.primary}`, borderRadius: 5 }} />
                                ) : (
                                  <span style={{ fontSize: 12, color: C.text3, fontVariantNumeric: "tabular-nums" }}>{t.estimatedHours != null ? t.estimatedHours : t.baselineDays * 8}h</span>
                                )}
                              </div>
                              {/* Actual Hrs — editable */}
                              {(() => {
                                const isEditActual = editCell?.taskId === t.id && editCell?.field === "actualHours";
                                return (
                                  <div style={{ textAlign: "center" as const, cursor: "text" }}
                                    onClick={() => { setEditCell({ taskId: t.id, field: "actualHours" }); setEditVal(String((t as any).actualHours ?? 0)); }}>
                                    {isEditActual ? (
                                      <input autoFocus type="number" min={0} step={0.5} value={editVal}
                                        onChange={e => setEditVal(e.target.value)} onBlur={commitEdit}
                                        onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }}
                                        style={{ width: 42, height: 22, textAlign: "center", fontSize: 13, border: `1px solid ${C.primary}`, borderRadius: 5 }} />
                                    ) : (
                                      <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: (t as any).actualHours != null && (t as any).actualHours > 0 ? C.primary : C.text3 }}>
                                        {(t as any).actualHours != null ? `${(t as any).actualHours}h` : "0h"}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                              <div style={{ textAlign: "center" as const, cursor: "text" }}
                                onClick={() => { setEditCell({ taskId: t.id, field: "percentComplete" }); setEditVal(String(t.percentComplete)); }}>
                                {isEditPct ? (
                                  <input autoFocus type="number" min={0} max={100} value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit}
                                    onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }}
                                    style={{ width: 36, height: 22, textAlign: "center", fontSize: 13, border: `1px solid ${C.primary}`, borderRadius: 5 }} />
                                ) : (
                                  <span style={{ fontSize: 12, fontWeight: 500, color: t.percentComplete === 100 ? C.green : t.percentComplete > 0 ? C.primary : C.text3, fontVariantNumeric: "tabular-nums" }}>
                                    {savingId === t.id ? "…" : `${t.percentComplete}%`}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", opacity: isHover ? 1 : 0, transition: "opacity .12s" }}>
                                <button onClick={() => deleteTask(t.id)} disabled={deletingId === t.id} title="Delete task"
                                  style={{ width: 22, height: 22, background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 5, cursor: "pointer", color: C.red, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>×</button>
                              </div>
                            </div>
                          );
                        })}
                        {phaseTasks.length === 0 && (
                          <div style={{ padding: "12px 12px 12px 36px", fontSize: 13, color: C.text3, fontStyle: "italic" }}>No tasks match the current filter.</div>
                        )}
                        <div onClick={() => addTask(phase)}
                          style={{ display: "flex", alignItems: "center", padding: "8px 12px 8px 36px", borderTop: `1px solid ${C.borderLight}`, cursor: "pointer", color: C.text3, fontSize: 13 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surface2; (e.currentTarget as HTMLElement).style.color = C.primary; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = C.text3; }}>
                          + Add task to {phase}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* ── Milestones section (list view) ── */}
              {milestones.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div onClick={() => setMsCollapsed(v => !v)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: msCollapsed ? 8 : "8px 8px 0 0", border: `1px solid ${C.border}`, borderBottom: msCollapsed ? `1px solid ${C.border}` : "none", background: C.surface2, cursor: "pointer", userSelect: "none" as const }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.surface)}
                    onMouseLeave={e => (e.currentTarget.style.background = C.surface2)}>
                    <span style={{ fontSize: 11, color: C.text3, display: "inline-block", transition: "transform .17s", transform: msCollapsed ? "none" : "rotate(90deg)" }}>▶</span>
                    <span style={{ fontSize: 13, color: C.amber }}>◆</span>
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" as const, color: C.text }}>Milestones</span>
                    <span style={{ fontSize: 12, color: C.text3 }}>{milestones.length} milestone{milestones.length !== 1 ? "s" : ""}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: C.greenLight, color: C.green }}>
                      {milestones.filter(m => (m.status ?? "").toLowerCase().includes("complet")).length}/{milestones.length} done
                    </span>
                  </div>
                  {!msCollapsed && (
                    <div style={{ border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden", background: C.surface }}>
                      <div style={{ display: "grid", gridTemplateColumns: "36px minmax(200px,400px) 140px 100px 1fr 120px 44px", alignItems: "center", padding: "4px 0", borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
                        <div />
                        <div><span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".07em", color: C.text3 }}>Milestone</span></div>
                        <div style={{ textAlign: "center" as const }}><span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".07em", color: C.text3 }}>Due Date</span></div>
                        <div><span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".07em", color: C.text3 }}>Status</span></div>
                        <div />
                        <div style={{ textAlign: "center" as const }}><span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".07em", color: C.text3 }}>Action</span></div>
                        <div />
                      </div>
                      {milestones.map((m, mi) => {
                        const isComplete = (m.status ?? "").toLowerCase().includes("complet");
                        const isOverdue = !isComplete && m.dueDate && new Date(m.dueDate) < new Date();
                        const msColor = isComplete ? C.green : isOverdue ? C.red : C.amber;
                        const dueLabel = m.dueDate ? new Date(m.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";
                        return (
                          <div key={m.id}
                            style={{ display: "grid", gridTemplateColumns: "36px minmax(200px,400px) 140px 100px 1fr 120px 44px", alignItems: "center", minHeight: 48, borderBottom: mi < milestones.length - 1 ? `1px solid ${C.borderLight}` : "none", background: isComplete ? C.greenLight : "transparent", transition: "background .1s" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 14, color: msColor, lineHeight: 1 }}>◆</span>
                            </div>
                            <div style={{ padding: "8px 8px 8px 0", minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: isComplete ? C.green : C.amber, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", textDecoration: isComplete ? "line-through" : "none", opacity: isComplete ? 0.7 : 1 }}>
                                {m.name}
                              </div>
                            </div>
                            <div style={{ textAlign: "center" as const, fontSize: 12, color: isOverdue ? C.red : C.text2, fontWeight: isOverdue ? 600 : 400 }}>
                              {dueLabel}{isOverdue && <span style={{ display: "block", fontSize: 10.5, color: C.red }}>overdue</span>}
                            </div>
                            <div style={{ padding: "0 5px" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500, color: msColor, background: isComplete ? C.greenLight : isOverdue ? C.redLight : C.amberLight }}>
                                {isComplete ? "Completed" : isOverdue ? "Overdue" : "Pending"}
                              </span>
                            </div>
                            <div />
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <button onClick={() => toggleMilestoneComplete(m.id, m.status ?? "pending")}
                                title={isComplete ? "Mark as pending" : "Mark as closed"}
                                style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: 8, border: `1.5px solid ${msColor}`, background: isComplete ? C.green : "transparent", cursor: "pointer", color: isComplete ? "#fff" : msColor, fontSize: 11.5, fontWeight: 600, transition: "all .15s" }}>
                                {isComplete ? "✓ Closed" : "Mark closed"}
                              </button>
                            </div>
                            <div />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Timeline (Gantt) view ── */}
          {viewMode === "gantt" && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>

            {/* Column headers */}
            <div style={{ display: "flex", background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
              {/* Grid header */}
              <div style={{ width: GRID_W, flexShrink: 0, display: "flex", alignItems: "center" }}>
                <div style={{ width: 28 }} />
                <div style={{ flex: 1, padding: "7px 8px", font: `600 12px var(--font-inter),'Inter'`, color: C.text3, letterSpacing: ".05em", textTransform: "uppercase" as const }}>Task</div>
                <div style={{ width: 54, textAlign: "center" as const, font: `600 12px var(--font-inter),'Inter'`, color: C.text3, textTransform: "uppercase" as const }}>Est.</div>
                <div style={{ width: 54, textAlign: "center" as const, font: `600 12px var(--font-inter),'Inter'`, color: C.text3, textTransform: "uppercase" as const }}>Actual</div>
                <div style={{ width: 44, textAlign: "center" as const, font: `600 12px var(--font-inter),'Inter'`, color: C.text3, textTransform: "uppercase" as const }}>%</div>
                <div style={{ width: 90, font: `600 12px var(--font-inter),'Inter'`, color: C.text3, textTransform: "uppercase" as const, padding: "7px 6px" }}>Start</div>
              </div>
              {/* Gantt header — 2 rows: month groups + week ticks */}
              <div style={{ flex: 1, borderLeft: `1px solid ${C.border}`, overflow: "hidden" }}>
                {/* Month row */}
                <div style={{ display: "flex", borderBottom: `1px solid ${C.borderLight}` }}>
                  {monthGroups.map((mg, i) => (
                    <div key={i} style={{ flex: mg.count, borderLeft: i > 0 ? `1px solid ${C.borderLight}` : "none", padding: "3px 6px", font: `600 11.5px var(--font-inter),'Inter'`, color: C.text2, whiteSpace: "nowrap" as const, overflow: "hidden" }}>
                      {mg.label}
                    </div>
                  ))}
                </div>
                {/* Week row */}
                <div style={{ display: "flex" }}>
                  {weeks.map((w, i) => (
                    <div key={i} style={{ flex: 1, borderLeft: `1px solid ${C.borderLight}`, padding: "2px 0", font: `400 10.5px 'IBM Plex Mono'`, color: C.text3, textAlign: "center" as const, overflow: "hidden", whiteSpace: "nowrap" as const }}>
                      {weeks.length <= 26 ? w.getDate() : i % 2 === 0 ? w.getDate() : ""}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Body — scrollable rows */}
            <div style={{ display: "flex", maxHeight: 560, overflow: "hidden" }}>
              {/* Task grid — left pane */}
              <div ref={gridScrollRef} style={{ width: GRID_W, flexShrink: 0, overflowY: "auto", overflowX: "hidden" }}>
                {phases.map(phase => (
                  <div key={phase}>
                    {/* Phase header */}
                    <div style={{ display: "flex", alignItems: "center", background: "#f0f1f9", borderTop: `1px solid ${C.borderLight}`, padding: "5px 8px 5px 28px" }}>
                      <div style={{ font: `700 12px var(--font-inter),'Inter'`, color: C.primary, letterSpacing: ".04em", textTransform: "uppercase" as const, flex: 1 }}>{phase}</div>
                    </div>
                    {filteredTasks.filter(t => t.phase === phase).map(t => {
                      const isEditName = editCell?.taskId === t.id && editCell?.field === "name";
                      const isEditDays = editCell?.taskId === t.id && editCell?.field === "baselineDays";
                      const isEditPct = editCell?.taskId === t.id && editCell?.field === "percentComplete";
                      const isEditStart = editCell?.taskId === t.id && editCell?.field === "baselineStart";
                      const pctColor = t.percentComplete === 100 ? C.green : t.percentComplete > 0 ? C.primary : C.text3;
                      const isCrit = (showCritical && criticalIds.has(t.id)) || (cpPanelOpen && cpData && cpData.criticalIds.includes(t.id));

                      return (
                        <div
                          key={t.id}
                          onMouseEnter={() => setHoverRowId(t.id)}
                          onMouseLeave={() => setHoverRowId(null)}
                          style={{ display: "flex", alignItems: "center", borderTop: `1px solid ${C.borderLight}`, height: ROW_H, background: isCrit ? "#fff8f8" : "transparent" }}
                        >
                          {/* Delete button */}
                          <div style={{ width: 28, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                            {hoverRowId === t.id && (
                              <button onClick={() => deleteTask(t.id)} disabled={deletingId === t.id}
                                style={{ width: 18, height: 18, background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 4, cursor: "pointer", color: C.red, fontSize: 11, lineHeight: 1, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                ×
                              </button>
                            )}
                          </div>

                          {/* Name */}
                          <div style={{ flex: 1, padding: "0 4px", overflow: "hidden" }}>
                            {isEditName ? (
                              <input
                                ref={inputRef}
                                autoFocus
                                value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }}
                                style={{ width: "100%", fontSize: 15.5, border: `1px solid ${C.primary}`, borderRadius: 5, padding: "2px 5px", fontFamily: "var(--font-inter),'Inter',sans-serif" }}
                              />
                            ) : (
                              <div onClick={() => { setEditCell({ taskId: t.id, field: "name" }); setEditVal(t.name); }}
                                style={{ fontSize: 15.5, fontWeight: 500, color: isCrit ? C.red : C.text, cursor: "text", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}
                                title={t.name}>
                                {isCrit && <span style={{ marginRight: 4, fontSize: 11 }}>🔴</span>}
                                {t.name}
                              </div>
                            )}
                            {/* Assignee chip */}
                            {assignEditId === t.id ? (
                              <select autoFocus defaultValue={t.resource?.id ?? ""}
                                onBlur={e => saveAssignee(t.id, e.target.value || null)}
                                onChange={e => saveAssignee(t.id, e.target.value || null)}
                                style={{ fontSize: 13, height: 21, border: `1px solid ${C.primary}`, borderRadius: 4, marginTop: 2, width: "100%", background: C.surface }}>
                                <option value="">— Unassigned —</option>
                                {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                              </select>
                            ) : (
                              <div onClick={() => resources.length > 0 && setAssignEditId(t.id)} title="Click to assign resource"
                                style={{ marginTop: 2, fontSize: 13, color: t.resource ? C.primary : C.text3, cursor: resources.length > 0 ? "pointer" : "default", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {t.resource ? `👤 ${t.resource.name}` : resources.length > 0 ? "+ Assign" : ""}
                              </div>
                            )}
                          </div>

                          {/* Est. Hrs — editable */}
                          <div style={{ width: 54, textAlign: "center" as const, cursor: "text" }}
                            onClick={() => { setEditCell({ taskId: t.id, field: "baselineDays" }); setEditVal(String(t.estimatedHours != null ? t.estimatedHours : t.baselineDays * 8)); }}>
                            {isEditDays ? (
                              <input autoFocus type="number" min={1} step={4} value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }}
                                style={{ width: 44, height: 22, textAlign: "center", fontSize: 14, border: `1px solid ${C.primary}`, borderRadius: 5 }} />
                            ) : (
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14.5, color: C.text2 }}>{t.estimatedHours != null ? t.estimatedHours : t.baselineDays * 8}h</span>
                            )}
                          </div>
                          {/* Actual Hrs — editable */}
                          {(() => {
                            const isEditActual = editCell?.taskId === t.id && editCell?.field === "actualHours";
                            return (
                              <div style={{ width: 54, textAlign: "center" as const, cursor: "text" }}
                                onClick={() => { setEditCell({ taskId: t.id, field: "actualHours" }); setEditVal(String((t as any).actualHours ?? 0)); }}>
                                {isEditActual ? (
                                  <input autoFocus type="number" min={0} step={0.5} value={editVal}
                                    onChange={e => setEditVal(e.target.value)} onBlur={commitEdit}
                                    onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }}
                                    style={{ width: 44, height: 22, textAlign: "center", fontSize: 14, border: `1px solid ${C.primary}`, borderRadius: 5 }} />
                                ) : (
                                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14.5, color: (t as any).actualHours != null && (t as any).actualHours > 0 ? C.primary : C.text3 }}>
                                    {(t as any).actualHours != null ? `${(t as any).actualHours}h` : "0h"}
                                  </span>
                                )}
                              </div>
                            );
                          })()}

                          {/* % */}
                          <div style={{ width: 44, textAlign: "center" as const, cursor: "text" }}
                            onClick={() => { setEditCell({ taskId: t.id, field: "percentComplete" }); setEditVal(String(t.percentComplete)); }}>
                            {isEditPct ? (
                              <input autoFocus type="number" min={0} max={100} value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }}
                                style={{ width: 42, height: 22, textAlign: "center", fontSize: 14, border: `1px solid ${C.primary}`, borderRadius: 5 }} />
                            ) : (
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14.5, fontWeight: 600, color: pctColor }}>
                                {savingId === t.id ? "…" : `${t.percentComplete}%`}
                              </span>
                            )}
                          </div>

                          {/* Start date */}
                          <div style={{ width: 90, padding: "0 6px", cursor: "text" }}
                            onClick={() => { setEditCell({ taskId: t.id, field: "baselineStart" }); setEditVal(new Date(t.baselineStart).toISOString().slice(0, 10)); }}>
                            {isEditStart ? (
                              <input autoFocus type="date" value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }}
                                style={{ width: 82, fontSize: 13, border: `1px solid ${C.primary}`, borderRadius: 4, padding: "1px 3px" }} />
                            ) : (
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13.5, color: C.text3 }}>{fmt(t.baselineStart)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* + Add task row */}
                    <div
                      onClick={() => addTask(phase)}
                      style={{ display: "flex", alignItems: "center", height: 32, borderTop: `1px solid ${C.borderLight}`, padding: "0 8px 0 28px", cursor: "pointer", color: C.text3, fontSize: 14.5 }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      + Add task
                    </div>
                  </div>
                ))}

                {/* Milestones — Gantt left pane */}
                {milestones.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", background: "#f0f1f9", borderTop: `1px solid ${C.borderLight}`, padding: "5px 8px 5px 28px", gap: 6 }}>
                      <span style={{ fontSize: 13, color: C.amber }}>◆</span>
                      <div style={{ font: `700 12px var(--font-inter),'Inter'`, color: C.amber, letterSpacing: ".04em", textTransform: "uppercase" as const }}>Milestones</div>
                    </div>
                    {milestones.map(m => {
                      const isComplete = (m.status ?? "").toLowerCase().includes("complet");
                      const isOverdue = !isComplete && m.dueDate && new Date(m.dueDate) < new Date();
                      const msColor = isComplete ? C.green : isOverdue ? C.red : C.amber;
                      const dueLabel = m.dueDate ? new Date(m.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";
                      return (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", borderTop: `1px solid ${C.borderLight}`, height: ROW_H, background: isComplete ? C.greenLight : "transparent" }}>
                          <div style={{ width: 28, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 12, color: msColor }}>◆</span>
                          </div>
                          <div style={{ flex: 1, padding: "0 4px", overflow: "hidden" }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: isComplete ? C.green : C.text, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", display: "block", textDecoration: isComplete ? "line-through" : "none", opacity: isComplete ? 0.7 : 1 }}>{m.name}</span>
                          </div>
                          <div style={{ width: 60, textAlign: "center" as const, fontFamily: "'IBM Plex Mono',monospace", fontSize: 13.5, color: C.text3 }}>0h</div>
                          <div style={{ width: 52, display: "flex", justifyContent: "center" }}>
                            <button onClick={() => toggleMilestoneComplete(m.id, m.status ?? "pending")}
                              title={isComplete ? "Mark pending" : "Mark complete"}
                              style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${msColor}`, background: isComplete ? C.green : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: isComplete ? "#fff" : msColor, fontSize: 11, fontWeight: 700 }}>
                              {isComplete ? "✓" : ""}
                            </button>
                          </div>
                          <div style={{ width: 90, padding: "0 6px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: isOverdue ? C.red : C.text3, fontWeight: isOverdue ? 600 : 400 }}>{dueLabel}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Gantt pane — right */}
              <div ref={ganttScrollRef} style={{ flex: 1, borderLeft: `1px solid ${C.border}`, overflowY: "auto", overflowX: "hidden", position: "relative" }}>
                {/* Today vertical line */}
                {todayPct >= 0 && todayPct <= 100 && (
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: `${todayPct}%`, width: 1.5, background: C.red, opacity: 0.45, zIndex: 5, pointerEvents: "none" }} />
                )}

                {phases.map(phase => (
                  <div key={phase}>
                    {/* Phase header spacer */}
                    <div style={{ height: 29, background: "#f0f1f9", borderTop: `1px solid ${C.borderLight}` }} />
                    {filteredTasks.filter(t => t.phase === phase).map(t => {
                      const left = barLeft(t);
                      const width = barWidth(t);
                      const isCrit = (showCritical && criticalIds.has(t.id)) || (cpPanelOpen && cpData && cpData.criticalIds.includes(t.id));
                      const barColor = isCrit ? C.red : t.percentComplete === 100 ? C.green : t.percentComplete > 0 ? C.primary : "#c5cadb";
                      const milestone = isMilestone(t);

                      return (
                        <div key={t.id} style={{ position: "relative", height: ROW_H, borderTop: `1px solid ${C.borderLight}`, background: isCrit ? "#fff8f8" : "transparent" }}>
                          {/* Week grid lines */}
                          {weeks.map((_, i) => (
                            <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${(i / weeks.length) * 100}%`, width: 1, background: C.borderLight, opacity: 0.6 }} />
                          ))}

                          {milestone ? (
                            /* Milestone diamond */
                            <div title={t.name} style={{
                              position: "absolute", top: "50%", left: `${left}%`,
                              transform: "translate(-50%, -50%) rotate(45deg)",
                              width: 14, height: 14,
                              background: "#f59e0b", border: "2px solid #b45309", zIndex: 4,
                            }} />
                          ) : (
                            /* Gantt bar */
                            <div style={{
                              position: "absolute", top: "50%", transform: "translateY(-50%)",
                              left: `${left}%`, width: `${width}%`,
                              height: 22, borderRadius: 5, background: "#e2e5ea", overflow: "visible", zIndex: 2,
                            }}>
                              {/* Progress fill */}
                              <div style={{
                                position: "absolute", top: 0, left: 0, bottom: 0,
                                width: `${t.percentComplete}%`,
                                background: barColor, borderRadius: 5, transition: "width .3s",
                              }} />
                              {/* Task label inside bar */}
                              {width > 5 && (
                                <div style={{
                                  position: "absolute", top: 0, left: 4, right: 10, bottom: 0,
                                  display: "flex", alignItems: "center",
                                  font: `500 11.5px var(--font-inter),'Inter'`,
                                  color: t.percentComplete > 40 ? "#fff" : C.text3,
                                  whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis",
                                  pointerEvents: "none",
                                }}>
                                  {t.name}
                                </div>
                              )}
                              {/* End date label — actual finish when complete, planned otherwise */}
                              <div style={{
                                position: "absolute", top: "50%", transform: "translateY(-50%)",
                                left: "calc(100% + 4px)",
                                font: `500 10.5px 'IBM Plex Mono'`,
                                color: t.percentComplete === 100 ? C.green : C.text3,
                                whiteSpace: "nowrap" as const,
                                pointerEvents: "none",
                              }}>
                                {t.percentComplete === 100 ? fmt(t.actualFinish ?? t.baselineFinish) : fmt(t.baselineFinish)}
                              </div>
                              {/* Drag-resize handle */}
                              <div
                                onMouseDown={e => {
                                  e.preventDefault();
                                  dragRef.current = { taskId: t.id, startX: e.clientX, startDays: t.baselineDays };
                                }}
                                style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", zIndex: 3 }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Add task spacer row */}
                    <div style={{ height: 32, borderTop: `1px solid ${C.borderLight}` }} />
                  </div>
                ))}

                {/* Milestones — Gantt right pane */}
                {milestones.length > 0 && (
                  <div>
                    <div style={{ height: 29, background: "#f0f1f9", borderTop: `1px solid ${C.borderLight}` }} />
                    {milestones.map(m => {
                      const isComplete = (m.status ?? "").toLowerCase().includes("complet");
                      const isOverdue = !isComplete && m.dueDate && new Date(m.dueDate) < new Date();
                      const msColor = isComplete ? C.green : isOverdue ? C.red : C.amber;
                      const duePct = m.dueDate ? Math.max(0, Math.min(100, ((new Date(m.dueDate).getTime() - minStart.getTime()) / totalMs) * 100)) : -1;
                      return (
                        <div key={m.id} style={{ position: "relative", height: ROW_H, borderTop: `1px solid ${C.borderLight}`, background: isComplete ? C.greenLight : "transparent" }}>
                          {weeks.map((_, i) => (
                            <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: `${(i / weeks.length) * 100}%`, width: 1, background: C.borderLight, opacity: 0.6 }} />
                          ))}
                          {duePct >= 0 && (
                            <>
                              <div title={m.name} style={{
                                position: "absolute", top: "50%", left: `${duePct}%`,
                                transform: "translate(-50%, -50%) rotate(45deg)",
                                width: 14, height: 14,
                                background: msColor === C.green ? "#22c55e" : msColor === C.red ? "#ef4444" : "#f59e0b",
                                border: `2px solid ${msColor === C.green ? "#15803d" : msColor === C.red ? "#b91c1c" : "#b45309"}`,
                                zIndex: 4,
                              }} />
                              <div style={{
                                position: "absolute", top: "50%", transform: "translateY(-50%)",
                                left: `calc(${duePct}% + 10px)`,
                                font: `500 10.5px 'IBM Plex Mono'`,
                                color: isOverdue ? C.red : C.text3,
                                whiteSpace: "nowrap" as const,
                                pointerEvents: "none",
                              }}>
                                {m.dueDate ? new Date(m.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : ""}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "9px 16px", borderTop: `1px solid ${C.borderLight}`, background: C.surface2 }}>
              {[
                { color: C.green, label: "Complete" },
                { color: C.primary, label: "In Progress" },
                { color: "#c5cadb", label: "Not Started" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 18, height: 8, borderRadius: 3, background: l.color }} />
                  <span style={{ fontSize: 13.5, color: C.text3 }}>{l.label}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, background: "#f59e0b", border: "2px solid #b45309", transform: "rotate(45deg)" }} />
                <span style={{ fontSize: 13.5, color: C.text3, marginLeft: 2 }}>Milestone</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 1.5, height: 14, background: C.red, opacity: 0.5 }} />
                <span style={{ fontSize: 13.5, color: C.text3 }}>Today</span>
              </div>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 13.5, color: C.text3 }}>Click cells to edit · drag right edge of bar to resize</span>
            </div>
          </div>
          )}

          {/* ── AI Command Bar ── */}
          <div style={{ marginTop: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.primary }}>✦ AI Schedule Command</div>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 14, color: C.text3 }}>Describe a change in plain language</span>
            </div>
            <div style={{ padding: "10px 14px", display: "flex", gap: 8 }}>
              <input
                value={aiCmd}
                onChange={e => setAiCmd(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") runAiCommand(); }}
                placeholder='e.g. "Shift Phase 2 by 2 weeks" or "Mark all design tasks complete"'
                style={{ flex: 1, height: 36, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 12px", fontSize: 16, fontFamily: "var(--font-inter),'Inter',sans-serif", outline: "none" }}
              />
              <button onClick={runAiCommand} disabled={aiLoading || !aiCmd.trim()}
                style={{ height: 36, padding: "0 18px", background: aiLoading ? C.surface2 : C.primary, color: aiLoading ? C.text3 : "#fff", border: "none", borderRadius: 8, font: `600 15px var(--font-inter),'Inter'`, cursor: aiLoading || !aiCmd.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                {aiLoading ? <><span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #ccc", borderTopColor: C.primary, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Running…</> : "Run AI"}
              </button>
            </div>

            {aiError && <div style={{ margin: "0 14px 10px", padding: "8px 12px", background: C.redLight, border: `1px solid ${C.red}`, borderRadius: 8, fontSize: 15, color: C.red }}>{aiError}</div>}

            {/* Diff card */}
            {aiDiff && (
              <div style={{ margin: "0 14px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600, color: C.text, flex: 1 }}>{aiDiff.summary}</div>
                  <button onClick={applyAiDiff} disabled={applyingDiff}
                    style={{ height: 30, padding: "0 14px", background: C.green, color: "#fff", border: "none", borderRadius: 7, font: `600 14px var(--font-inter),'Inter'`, cursor: applyingDiff ? "not-allowed" : "pointer" }}>
                    {applyingDiff ? "Applying…" : "✓ Apply"}
                  </button>
                  <button onClick={() => setAiDiff(null)}
                    style={{ height: 30, padding: "0 14px", background: C.surface, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 7, font: `600 14px var(--font-inter),'Inter'`, cursor: "pointer" }}>
                    Discard
                  </button>
                </div>
                {aiDiff.patches.length === 0 ? (
                  <div style={{ padding: "10px 14px", fontSize: 15, color: C.text3 }}>No changes to apply.</div>
                ) : (
                  <div style={{ padding: "6px 0" }}>
                    {aiDiff.patches.map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", borderTop: i > 0 ? `1px solid ${C.borderLight}` : "none" }}>
                        <span style={{ fontSize: 14.5, fontWeight: 500, color: C.text, minWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.taskName}</span>
                        <span style={{ fontSize: 14, color: C.text3, minWidth: 80 }}>{p.field}</span>
                        <span style={{ fontSize: 14, fontFamily: "'IBM Plex Mono',monospace", color: C.red, textDecoration: "line-through" }}>{p.oldValue}</span>
                        <span style={{ fontSize: 14, color: C.text3 }}>→</span>
                        <span style={{ fontSize: 14, fontFamily: "'IBM Plex Mono',monospace", color: C.green }}>{p.newValue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>

          {/* ── Critical Path Side Panel ── */}
          {cpPanelOpen && (
            <div style={{ width: 340, flexShrink: 0, borderLeft: `1px solid ${C.border}`, background: C.surface, alignSelf: "stretch", overflowY: "auto", display: "flex", flexDirection: "column" as const }}>
              {/* Panel header */}
              <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky" as const, top: 0, background: C.surface, zIndex: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: C.text }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  Critical Path Analysis
                </div>
                <button onClick={() => { setCpPanelOpen(false); setCpData(null); }} style={{ width: 22, height: 22, border: `1px solid ${C.border}`, borderRadius: 6, background: C.surface2, color: C.text3, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>

              {cpLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flex: 1, color: C.text3, fontSize: 13 }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${C.border}`, borderTopColor: C.primary, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  Running CPM analysis…
                </div>
              ) : cpData ? (
                <div style={{ padding: "14px 14px", display: "flex", flexDirection: "column" as const, gap: 16 }}>

                  {/* Summary chips */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      { label: "CP Duration", value: `${cpData.cpDuration}d`, sub: `${cpData.criticalIds.length} tasks on path`, color: C.red },
                      { label: "Project Float", value: "0d", sub: "No schedule buffer", color: C.amber },
                      { label: "Near-Critical", value: String(cpData.nearCriticalIds.length), sub: "tasks ≤ 2 days float", color: C.amber },
                      { label: "Projected End", value: new Date(cpData.projectedEnd).toLocaleDateString("en-AU", { day: "numeric", month: "short" }), sub: new Date(cpData.projectedEnd).toLocaleDateString("en-AU", { year: "numeric" }), color: C.primary },
                    ].map(chip => (
                      <div key={chip.label} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: C.text3, marginBottom: 3 }}>{chip.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: chip.color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{chip.value}</div>
                        <div style={{ fontSize: 10.5, color: C.text3, marginTop: 3 }}>{chip.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Legend */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.text3 }}>
                      <div style={{ width: 3, height: 14, borderRadius: 2, background: C.red }} />Critical path
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.text3 }}>
                      <div style={{ width: 3, height: 14, borderRadius: 2, background: C.amber }} />Near-critical (≤2d)
                    </div>
                  </div>

                  {/* Critical chain */}
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: C.text3, marginBottom: 7 }}>Critical chain</div>
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                      {cpData.floatTable.filter(r => r.critical).map(r => (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", background: C.redLight, border: `1px solid rgba(197,57,43,.18)`, borderRadius: 8 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.red, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{r.name}</span>
                          <span style={{ fontSize: 11, color: C.text3, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{r.duration}d</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Float table */}
                  {cpData.floatTable.filter(r => r.nearCritical).length > 0 && (
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: C.text3, marginBottom: 7 }}>Near-critical watch list</div>
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 48px", padding: "6px 9px", background: C.surface2, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".05em", color: C.text3 }}>
                          <span>Task</span><span>TF</span><span>Risk</span>
                        </div>
                        {cpData.floatTable.filter(r => r.nearCritical).map(r => (
                          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 40px 48px", padding: "7px 9px", borderTop: `1px solid ${C.border}`, fontSize: 11.5 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, color: C.text }}>{r.name}</span>
                            <span style={{ fontWeight: 700, color: C.amber, fontVariantNumeric: "tabular-nums" }}>{r.tf}d</span>
                            <span style={{ fontWeight: 700, fontSize: 10, color: C.amber }}>HIGH</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI narrative */}
                  {cpData.narrative && (
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".06em", color: C.text3, marginBottom: 7 }}>AI insight</div>
                      <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                          <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: ".07em", padding: "2px 6px", borderRadius: 4, background: C.primaryLight, color: C.primary, border: `1px solid ${C.primaryBorder}` }}>PMI CPM Analysis</span>
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.6, color: C.text2, whiteSpace: "pre-wrap" as const }}>{cpData.narrative}</div>
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: C.text3, textAlign: "center" as const }}>CPM via forward/backward pass · Just now</div>
                </div>
              ) : (
                <div style={{ padding: "24px 16px", textAlign: "center" as const, color: C.text3, fontSize: 13 }}>Analysis failed. Check server logs.</div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes blink-cursor { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}

// ── Resources tab ──────────────────────────────────────────────────────────────

const ROLES = ["Project Manager", "Business Analyst", "Developer", "QA Engineer", "Architect", "Designer", "DevOps", "Scrum Master", "Data Engineer", "Product Owner", "Consultant", "Other"];

function ResourcesTab({ project }: { project: any }) {
  const [resources, setResources] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const emptyForm = { name: "", role: "Developer", email: "", allocationPct: 100, startDate: "", endDate: "", ratePerDay: "", skills: "", notes: "" };
  const [form, setForm] = React.useState(emptyForm);

  async function load() {
    const res = await fetch(`/api/projects/${project.id}/resources`);
    if (res.ok) setResources(await res.json());
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [project.id]);

  function openAdd() { setForm(emptyForm); setEditId(null); setShowForm(true); }
  function openEdit(r: any) {
    setForm({
      name: r.name, role: r.role, email: r.email || "", allocationPct: r.allocationPct,
      startDate: r.startDate ? r.startDate.slice(0, 10) : "",
      endDate: r.endDate ? r.endDate.slice(0, 10) : "",
      ratePerDay: r.ratePerDay ?? "", skills: r.skills || "", notes: r.notes || "",
    });
    setEditId(r.id); setShowForm(true);
  }

  async function save() {
    setSaving(true);
    const url = editId ? `/api/projects/${project.id}/resources/${editId}` : `/api/projects/${project.id}/resources`;
    const method = editId ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) { await load(); setShowForm(false); }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Remove this resource? Tasks assigned to them will become unassigned.")) return;
    setDeleting(id);
    await fetch(`/api/projects/${project.id}/resources/${id}`, { method: "DELETE" });
    await load();
    setDeleting(null);
  }

  const allocationColor = (pct: number) => pct > 100 ? C.red : pct >= 80 ? C.amber : C.green;

  if (loading) return <div style={{ padding: "40px 0", textAlign: "center" as const, color: C.text3, fontSize: 14 }}>Loading…</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Resource Roster</div>
        {resources.length > 0 && <span style={{ fontSize: 12.5, color: C.text3, marginLeft: 10 }}>{resources.length} team member{resources.length !== 1 ? "s" : ""}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={openAdd} style={{ height: 32, padding: "0 14px", background: C.primary, color: "#fff", border: "none", borderRadius: 8, font: `600 12.5px var(--font-inter),'Inter'`, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          + Add Resource
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div style={{ background: C.surface, border: `1.5px solid ${C.primaryBorder}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.primary, marginBottom: 14 }}>{editId ? "Edit Resource" : "Add Team Member"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            {[
              { label: "Name *", key: "name", type: "text", placeholder: "Full name" },
              { label: "Email", key: "email", type: "email", placeholder: "m365@company.com" },
              { label: "Rate / Day ($)", key: "ratePerDay", type: "number", placeholder: "0" },
            ].map(f => (
              <label key={f.key} style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text2 }}>{f.label}</span>
                <input type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 10px", fontSize: 14, fontFamily: "var(--font-inter),'Inter',sans-serif", outline: "none" }} />
              </label>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text2 }}>Role *</span>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 8px", fontSize: 14, fontFamily: "var(--font-inter),'Inter',sans-serif", background: C.surface }}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text2 }}>Allocation %</span>
              <input type="number" min={10} max={200} value={form.allocationPct}
                onChange={e => setForm(p => ({ ...p, allocationPct: Number(e.target.value) }))}
                style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 10px", fontSize: 14, fontFamily: "var(--font-inter),'Inter',sans-serif" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text2 }}>Start Date</span>
              <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 8px", fontSize: 14, fontFamily: "var(--font-inter),'Inter',sans-serif" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text2 }}>End Date</span>
              <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 8px", fontSize: 14, fontFamily: "var(--font-inter),'Inter',sans-serif" }} />
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column" as const, gap: 4, marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text2 }}>Skills / Technologies</span>
            <input type="text" placeholder="e.g. React, Node.js, AWS" value={form.skills}
              onChange={e => setForm(p => ({ ...p, skills: e.target.value }))}
              style={{ height: 32, border: `1px solid ${C.border}`, borderRadius: 7, padding: "0 10px", fontSize: 14, fontFamily: "var(--font-inter),'Inter',sans-serif" }} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={saving || !form.name.trim()}
              style={{ height: 32, padding: "0 18px", background: form.name.trim() ? C.primary : C.surface2, color: form.name.trim() ? "#fff" : C.text3, border: "none", borderRadius: 8, font: `600 12.5px var(--font-inter),'Inter'`, cursor: form.name.trim() ? "pointer" : "not-allowed" }}>
              {saving ? "Saving…" : editId ? "Save Changes" : "Add Resource"}
            </button>
            <button onClick={() => setShowForm(false)} style={{ height: 32, padding: "0 14px", background: "none", border: `1px solid ${C.border}`, borderRadius: 8, font: `600 12.5px var(--font-inter),'Inter'`, cursor: "pointer", color: C.text2 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Roster table */}
      {resources.length === 0 && !showForm ? (
        <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: "32px 24px", textAlign: "center" as const }}>
          <div style={{ fontSize: 33, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.primary, marginBottom: 8 }}>No team members yet</div>
          <div style={{ fontSize: 14, color: C.text2, maxWidth: 420, margin: "0 auto 18px" }}>Add your project team here. Once added, you can assign resources directly to schedule tasks.</div>
          <button onClick={openAdd} style={{ height: 34, padding: "0 18px", background: C.primary, color: "#fff", border: "none", borderRadius: 8, font: `600 13px var(--font-inter),'Inter'`, cursor: "pointer" }}>+ Add First Resource</button>
        </div>
      ) : resources.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 2fr 80px 80px 80px 80px", background: C.surface2, borderBottom: `1px solid ${C.border}`, padding: "8px 16px", gap: 8 }}>
            {["Name", "Role", "Email", "Alloc %", "Start", "End", ""].map((h, i) => (
              <div key={i} style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".05em" }}>{h}</div>
            ))}
          </div>
          {resources.map((r, idx) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 2fr 80px 80px 80px 80px", padding: "11px 16px", gap: 8, borderTop: idx === 0 ? "none" : `1px solid ${C.borderLight}`, alignItems: "center", background: idx % 2 === 0 ? C.surface : C.surface2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: resAvatarColor(r.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                  {r.name?.charAt(0).toUpperCase() ?? "?"}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.name}</div>
                  {r.skills && <div style={{ fontSize: 11.5, color: C.text3, marginTop: 1 }}>{r.skills}</div>}
                </div>
              </div>
              <div style={{ fontSize: 13, color: C.text2 }}>{r.role}</div>
              <div style={{ fontSize: 12.5, color: C.text3, fontFamily: "'IBM Plex Mono',monospace" }}>{r.email || "—"}</div>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: allocationColor(r.allocationPct), background: allocationColor(r.allocationPct) + "20", borderRadius: 6, padding: "2px 7px" }}>
                  {r.allocationPct}%
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: C.text3, fontFamily: "'IBM Plex Mono',monospace" }}>{r.startDate ? r.startDate.slice(0, 10) : "—"}</div>
              <div style={{ fontSize: 12.5, color: C.text3, fontFamily: "'IBM Plex Mono',monospace" }}>{r.endDate ? r.endDate.slice(0, 10) : "—"}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => openEdit(r)} title="Edit" style={{ width: 28, height: 28, border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.text2, fontSize: 14 }}>✎</button>
                <button onClick={() => remove(r.id)} disabled={deleting === r.id} title="Remove" style={{ width: 28, height: 28, border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontSize: 14, opacity: deleting === r.id ? 0.5 : 1 }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Priority badge helper ─────────────────────────────────────────────────────

const PRIORITY_META: Record<string, { label: string; bg: string; color: string; title: string }> = {
  C: { label: "C", bg: "#fde8e8", color: "#b91c1c", title: "Critical" },
  H: { label: "H", bg: "#fef3c7", color: "#92400e", title: "High" },
  M: { label: "M", bg: "#e0f2fe", color: "#075985", title: "Medium" },
  L: { label: "L", bg: "#f0fdf4", color: "#166534", title: "Low" },
};

function PriorityBadge({ priority, onClick }: { priority: string; onClick: () => void }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.M;
  return (
    <button
      onClick={onClick}
      title={`Priority: ${m.title} — click to cycle`}
      style={{
        width: 22, height: 22, flexShrink: 0, borderRadius: 5,
        background: m.bg, color: m.color, border: `1px solid ${m.color}40`,
        fontSize: 11, fontWeight: 700, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        lineHeight: 1,
      }}>
      {m.label}
    </button>
  );
}

interface ReqRowProps {
  req: any;
  editingReqId: string | null;
  editText: string;
  setEditText: (t: string) => void;
  reqSaving: boolean;
  isPending?: boolean;
  onEdit: () => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onRemove: () => void;
  onPriority: () => void;
}

function ReqRow({ req, editingReqId, editText, setEditText, reqSaving, isPending, onEdit, onEditSave, onEditCancel, onRemove, onPriority }: ReqRowProps) {
  const isEditing = editingReqId === req.id;
  const bg = isPending ? "#f5f7ff" : "transparent";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", padding: "7px 11px", gap: 8, borderBottom: "1px solid #eaecf0", background: bg }}>
      <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 500, color: "#4f5bd5", width: 52, flexShrink: 0, paddingTop: 1 }}>{req.requirementKey}</span>
      <div style={{ paddingTop: 1 }}>
        <PriorityBadge priority={req.priority ?? "M"} onClick={onPriority} />
      </div>
      {isEditing ? (
        <div style={{ flex: 1 }}>
          <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2}
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 5, padding: "4px 8px", fontSize: 12, resize: "vertical" as const, background: "#fff", boxSizing: "border-box" as const }} />
          <div style={{ display: "flex", gap: 5, marginTop: 4 }}>
            <button onClick={onEditSave} disabled={reqSaving} style={{ fontSize: 11, fontWeight: 600, background: "#22c55e", color: "#fff", border: "none", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>Save</button>
            <button onClick={onEditCancel} style={{ fontSize: 11, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexWrap: "wrap" as const, alignItems: "flex-start", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#1e293b", lineHeight: 1.45 }}>{req.statement}</span>
          {isPending && <span style={{ fontSize: 10, fontWeight: 600, color: "#4f5bd5", background: "#eef0fc", borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>New · pending</span>}
        </div>
      )}
      {!isEditing && (
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          <button onClick={onEdit} style={{ padding: "2px 5px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 11, color: "#64748b", background: "#fff", cursor: "pointer" }}>✎</button>
          <button onClick={onRemove} style={{ padding: "2px 5px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 11, color: "#ef4444", background: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ── Requirements tab ───────────────────────────────────────────────────────────

const DOC_CLASS_OPTIONS = [
  { value: "sow",        label: "Statement of Work (SOW)",   pts: 30 },
  { value: "brd",        label: "Business Requirements (BRD)", pts: 25 },
  { value: "srs",        label: "Software Requirements (SRS)", pts: 20 },
  { value: "estimation", label: "Estimation Sheet",           pts: 15 },
  { value: "proposal",   label: "Proposal",                   pts: 10 },
  { value: "contract",   label: "Contract",                   pts: 10 },
  { value: "cr",         label: "Change Request",              pts: 5  },
  { value: "other",      label: "Other",                      pts: 5  },
];

const EXT_COLORS: Record<string, string> = { PDF: "#b83b3b", DOCX: "#2b5cb8", DOC: "#2b5cb8", XLSX: "#1b7a46", XLS: "#1b7a46", TXT: "#5b616e", CSV: "#5b616e" };
const CLASS_LABELS: Record<string, string> = { sow: "SOW", brd: "BRD", srs: "SRS", estimation: "Est.", proposal: "Proposal", contract: "Contract", cr: "CR", other: "Other" };


const REQ_STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  proposed:  { color: "#c17d12", bg: "#fbf0da", label: "Proposed" },
  confirmed: { color: "#158a5a", bg: "#e3f3ea", label: "Confirmed" },
  rejected:  { color: "#cf3f3a", bg: "#fbe4e2", label: "Rejected" },
};

// ── Registers Tab (Assumptions + Dependencies) ─────────────────────────────────

function RegistersTab({ project }: { project: any }) {
  const [assumptions, setAssumptions] = React.useState<any[]>([]);
  const [dependencies, setDependencies] = React.useState<any[]>([]);
  const [loadingRegs, setLoadingRegs] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${project.id}/assumptions`).then(r => r.ok ? r.json() : []),
      fetch(`/api/projects/${project.id}/dependencies`).then(r => r.ok ? r.json() : []),
    ]).then(([a, d]) => { setAssumptions(a); setDependencies(d); setLoadingRegs(false); })
      .catch(() => setLoadingRegs(false));
  }, [project.id]);
  const [section, setSection] = React.useState<"assumptions" | "dependencies">("assumptions");

  // Assumption form
  const [aStmt, setAStmt] = React.useState("");
  const [aCat, setACat] = React.useState("general");
  const [aAdding, setAAdding] = React.useState(false);
  const [aLoading, setALoading] = React.useState(false);

  // Dependency form
  const [dDesc, setDDesc] = React.useState("");
  const [dType, setDType] = React.useState("external");
  const [dOwner, setDOwner] = React.useState("");
  const [dDue, setDDue] = React.useState("");
  const [dAdding, setDAdding] = React.useState(false);
  const [dLoading, setDLoading] = React.useState(false);

  async function addAssumption() {
    if (!aStmt.trim()) return;
    setALoading(true);
    const res = await fetch(`/api/projects/${project.id}/assumptions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statement: aStmt.trim(), category: aCat }),
    });
    if (res.ok) {
      const item = await res.json();
      setAssumptions(prev => [...prev, item]);
      setAStmt(""); setAAdding(false);
    }
    setALoading(false);
  }

  async function updateAssumptionStatus(id: string, status: string) {
    const res = await fetch(`/api/projects/${project.id}/assumptions`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assumptionId: id, status }),
    });
    if (res.ok) setAssumptions(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  }

  async function deleteAssumption(id: string) {
    const res = await fetch(`/api/projects/${project.id}/assumptions?assumptionId=${id}`, { method: "DELETE" });
    if (res.ok) setAssumptions(prev => prev.filter(a => a.id !== id));
  }

  async function addDependency() {
    if (!dDesc.trim()) return;
    setDLoading(true);
    const res = await fetch(`/api/projects/${project.id}/dependencies`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: dDesc.trim(), type: dType, owner: dOwner || undefined, dueDate: dDue || undefined }),
    });
    if (res.ok) {
      const item = await res.json();
      setDependencies(prev => [...prev, item]);
      setDDesc(""); setDOwner(""); setDDue(""); setDAdding(false);
    }
    setDLoading(false);
  }

  async function updateDependencyStatus(id: string, status: string) {
    const res = await fetch(`/api/projects/${project.id}/dependencies`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dependencyId: id, status }),
    });
    if (res.ok) setDependencies(prev => prev.map(d => d.id === id ? { ...d, status } : d));
  }

  async function deleteDependency(id: string) {
    const res = await fetch(`/api/projects/${project.id}/dependencies?dependencyId=${id}`, { method: "DELETE" });
    if (res.ok) setDependencies(prev => prev.filter(d => d.id !== id));
  }

  const ASSUMPTION_CATS = ["general", "technical", "commercial", "resource", "regulatory"];
  const DEP_TYPES = ["external", "internal", "client"];
  const statusColors: Record<string, string> = {
    open: C.amber, confirmed: C.green, violated: "#dc2626", resolved: C.green, blocked: "#dc2626",
  };

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Section toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["assumptions", "dependencies"] as const).map(s => (
          <button key={s} onClick={() => setSection(s)} style={{
            padding: "6px 16px", borderRadius: 8, border: `1px solid ${section === s ? C.primary : C.border}`,
            background: section === s ? "#eef0fc" : C.surface, color: section === s ? C.primary : C.text,
            fontWeight: section === s ? 600 : 400, fontSize: 13, cursor: "pointer",
          }}>
            {s === "assumptions" ? `Assumptions (${assumptions.length})` : `Dependencies (${dependencies.length})`}
          </button>
        ))}
      </div>

      {section === "assumptions" && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Assumptions Register</div>
            {!aAdding && (
              <button onClick={() => setAAdding(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.primary}`, background: "#eef0fc", color: C.primary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Plus size={12} /> Add
              </button>
            )}
          </div>

          {aAdding && (
            <div style={{ background: "#f8f9ff", border: `1px solid ${C.primaryBorder}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <textarea
                value={aStmt} onChange={e => setAStmt(e.target.value)} rows={2}
                placeholder="Describe the assumption..."
                style={{ width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", resize: "vertical", marginBottom: 10, boxSizing: "border-box" as const }}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <select value={aCat} onChange={e => setACat(e.target.value)} style={{ fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", background: C.surface }}>
                  {ASSUMPTION_CATS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
                <button onClick={addAssumption} disabled={aLoading || !aStmt.trim()} style={{ padding: "5px 14px", borderRadius: 7, background: C.primary, color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: aLoading ? 0.7 : 1 }}>
                  {aLoading ? "Adding…" : "Save"}
                </button>
                <button onClick={() => setAAdding(false)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, fontSize: 12, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          {assumptions.length === 0 ? (
            <div style={{ fontSize: 13, color: C.text3, textAlign: "center" as const, padding: "32px 0" }}>
              No assumptions yet. Add one manually or upload an SOW to extract them automatically.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.borderLight}` }}>
                  {["#", "Statement", "Category", "Source", "Status", ""].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left" as const, fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: C.text3, textTransform: "uppercase" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assumptions.map((a, i) => (
                  <tr key={a.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: "10px", color: C.text3, fontSize: 12, width: 32 }}>{i + 1}</td>
                    <td style={{ padding: "10px", lineHeight: 1.5 }}>{a.statement}</td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ fontSize: 11, background: "#f1f3f5", borderRadius: 5, padding: "2px 7px", color: C.text2 }}>{a.category}</span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ fontSize: 11, background: a.source === "sow_extract" ? "#eff6ff" : "#f1f3f5", borderRadius: 5, padding: "2px 7px", color: a.source === "sow_extract" ? "#1d4ed8" : C.text3 }}>
                        {a.source === "sow_extract" ? "SOW" : "Manual"}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <select value={a.status} onChange={e => updateAssumptionStatus(a.id, e.target.value)}
                        style={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 6px", color: statusColors[a.status] ?? C.text, fontWeight: 600, background: C.surface, cursor: "pointer" }}>
                        {["open", "confirmed", "violated"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "10px", textAlign: "right" as const }}>
                      <button onClick={() => deleteAssumption(a.id)} style={{ color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: 3 }}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {section === "dependencies" && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Dependencies Register</div>
            {!dAdding && (
              <button onClick={() => setDAdding(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.primary}`, background: "#eef0fc", color: C.primary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Plus size={12} /> Add
              </button>
            )}
          </div>

          {dAdding && (
            <div style={{ background: "#f8f9ff", border: `1px solid ${C.primaryBorder}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <textarea
                value={dDesc} onChange={e => setDDesc(e.target.value)} rows={2}
                placeholder="Describe the dependency..."
                style={{ width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", resize: "vertical", marginBottom: 10, boxSizing: "border-box" as const }}
              />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center", marginBottom: 10 }}>
                <select value={dType} onChange={e => setDType(e.target.value)} style={{ fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", background: C.surface }}>
                  {DEP_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
                <input value={dOwner} onChange={e => setDOwner(e.target.value)} placeholder="Owner (optional)" style={{ fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", width: 160 }} />
                <input type="date" value={dDue} onChange={e => setDDue(e.target.value)} style={{ fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px" }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={addDependency} disabled={dLoading || !dDesc.trim()} style={{ padding: "5px 14px", borderRadius: 7, background: C.primary, color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: dLoading ? 0.7 : 1 }}>
                  {dLoading ? "Adding…" : "Save"}
                </button>
                <button onClick={() => setDAdding(false)} style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, fontSize: 12, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          {dependencies.length === 0 ? (
            <div style={{ fontSize: 13, color: C.text3, textAlign: "center" as const, padding: "32px 0" }}>
              No dependencies yet. Add one manually or upload an SOW to extract them automatically.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.borderLight}` }}>
                  {["#", "Description", "Type", "Owner", "Due Date", "Source", "Status", ""].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left" as const, fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: C.text3, textTransform: "uppercase" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dependencies.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: "10px", color: C.text3, fontSize: 12, width: 32 }}>{i + 1}</td>
                    <td style={{ padding: "10px", lineHeight: 1.5 }}>{d.description}</td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ fontSize: 11, background: d.type === "client" ? "#fef9c3" : d.type === "internal" ? "#eff6ff" : "#f0fdf4", borderRadius: 5, padding: "2px 7px", color: d.type === "client" ? "#854d0e" : d.type === "internal" ? "#1d4ed8" : "#166534" }}>
                        {d.type}
                      </span>
                    </td>
                    <td style={{ padding: "10px", color: C.text2 }}>{d.owner ?? "—"}</td>
                    <td style={{ padding: "10px", color: C.text2, fontSize: 12 }}>
                      {d.dueDate ? new Date(d.dueDate).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ fontSize: 11, background: d.source === "sow_extract" ? "#eff6ff" : "#f1f3f5", borderRadius: 5, padding: "2px 7px", color: d.source === "sow_extract" ? "#1d4ed8" : C.text3 }}>
                        {d.source === "sow_extract" ? "SOW" : "Manual"}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <select value={d.status} onChange={e => updateDependencyStatus(d.id, e.target.value)}
                        style={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 6px", color: statusColors[d.status] ?? C.text, fontWeight: 600, background: C.surface, cursor: "pointer" }}>
                        {["open", "resolved", "blocked"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "10px", textAlign: "right" as const }}>
                      <button onClick={() => deleteDependency(d.id)} style={{ color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: 3 }}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Scope Control Tab ──────────────────────────────────────────────────────────

function ScopeControlTab({ project }: { project: any }) {
  const router = useRouter();

  // Doc upload state (preserved from RequirementsTab)
  const [docs, setDocs] = React.useState<any[]>(project.requirementsDocs || []);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [docClass, setDocClass] = React.useState("sow");
  const [showUploadForm, setShowUploadForm] = React.useState(false);

  // Requirements & baselines state
  const [reqs, setReqs] = React.useState<any[]>([]);
  const [baselines, setBaselines] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Requirement editing
  const [editingReqId, setEditingReqId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");
  const [addingReq, setAddingReq] = React.useState(false);
  const [newReqText, setNewReqText] = React.useState("");
  const [reqSaving, setReqSaving] = React.useState(false);

  // Pagination (10 per page; reset on load)
  const PAGE_SIZE = 10;
  const [basedPage, setBasedPage] = React.useState(PAGE_SIZE);
  const [pendingPage, setPendingPage] = React.useState(PAGE_SIZE);

  // Extraction
  const [extracting, setExtracting] = React.useState(false);
  const [extractError, setExtractError] = React.useState<string | null>(null);
  const [extractingDocIds, setExtractingDocIds] = React.useState<Set<string>>(new Set());

  // Impact analysis
  const [selectedDocIds, setSelectedDocIds] = React.useState<Set<string>>(new Set());
  const [impactStatus, setImpactStatus] = React.useState<"idle" | "running" | "done" | "error">("idle");
  const [impactText, setImpactText] = React.useState("");
  const [impactSummary, setImpactSummary] = React.useState<{ scope: string; schedule: string; cost: string } | null>(null);
  const impactPanelRef = React.useRef<HTMLDivElement>(null);

  // Bottom panel
  const [bottomTab, setBottomTab] = React.useState<"history" | "changelog">("history");

  // Baseline creation flow
  const [creatingBaseline, setCreatingBaseline] = React.useState(false);
  const [deltaReview, setDeltaReview] = React.useState<any | null>(null); // returned baseline with impactSummary
  const [acceptedMilestones, setAcceptedMilestones] = React.useState<Set<string>>(new Set());
  const [applyingDelta, setApplyingDelta] = React.useState(false);

  // Confirm / alert modal (replaces native window.confirm / window.alert)
  const [scopeModal, setScopeModal] = React.useState<{
    icon: "warn" | "danger" | "info";
    title: string;
    body: string;
    bullets?: string[];
    confirmLabel?: string;
    onConfirm?: () => void;
    cancelLabel?: string;
  } | null>(null);

  async function loadData() {
    setLoading(true);
    const [rRes, bRes] = await Promise.all([
      fetch(`/api/projects/${project.id}/requirements/list`),
      fetch(`/api/projects/${project.id}/scope-baselines`),
    ]);
    const rData = await rRes.json().catch(() => []);
    const bData = await bRes.json().catch(() => []);
    if (Array.isArray(rData)) { setReqs(rData); setBasedPage(PAGE_SIZE); setPendingPage(PAGE_SIZE); }
    if (Array.isArray(bData)) setBaselines(bData);
    setLoading(false);
  }

  React.useEffect(() => { loadData(); }, [project.id]);

  const latestBaseline = baselines[0] ?? null; // ordered desc by version
  const blSnapshot: string[] = latestBaseline
    ? ((latestBaseline.snapshot as any[]) ?? []).map((r: any) => r.requirementKey)
    : [];

  // Once any scope baseline exists, all source documents are locked — they are the audit trail.
  function isDocLocked(_doc: any): boolean {
    return !!latestBaseline;
  }

  const activeReqs = reqs.filter(r => r.isActive && r.status !== "rejected");
  // Live removed reqs (isActive:false) — drives the strikethrough row in the table
  const removedReqs = reqs.filter(r => !r.isActive && r.status !== "rejected");
  const basedReqs = latestBaseline
    ? activeReqs.filter(r => blSnapshot.includes(r.requirementKey))
    : [];
  const pendingReqs = latestBaseline
    ? activeReqs.filter(r => !blSnapshot.includes(r.requirementKey))
    : activeReqs;

  async function handleExtract() {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/requirements/extract`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      if ((data.extracted ?? 0) === 0)
        throw new Error("No requirements found in the uploaded documents.");
      await loadData();
    } catch (err: any) {
      setExtractError(err.message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (docs.some((d: any) => d.fileName === file.name)) {
      setUploadError(`"${file.name}" is already uploaded. Delete it first to replace.`);
      e.target.value = "";
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docClass", docClass);
      const res = await fetch(`/api/projects/${project.id}/requirements`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({ error: "Upload failed" }));
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      const newDoc = data.doc;
      setDocs(prev => [newDoc, ...prev]);
      setShowUploadForm(false);

      // Auto-extract requirements from the newly uploaded document only (scoped extraction)
      // Mark this specific doc as extracting so its tile shows a spinner and its
      // checkbox is disabled until extraction completes.
      setExtracting(true);
      setExtractError(null);
      setExtractingDocIds(prev => { const s = new Set(prev); s.add(newDoc.id); return s; });
      try {
        const exRes = await fetch(`/api/projects/${project.id}/requirements/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: newDoc.id }),
        });
        const exData = await exRes.json().catch(() => ({}));
        if (exRes.ok) await loadData();
        else setExtractError(exData.error || "Auto-extraction failed — click Extract to retry.");
      } catch {
        setExtractError("Auto-extraction failed — click Extract to retry.");
      } finally {
        setExtracting(false);
        setExtractingDocIds(prev => { const s = new Set(prev); s.delete(newDoc.id); return s; });
      }

      router.refresh();
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handlePriorityChange(reqId: string, current: string) {
    const cycle: Record<string, string> = { C: "H", H: "M", M: "L", L: "C" };
    const next = cycle[current] ?? "M";
    const res = await fetch(`/api/projects/${project.id}/requirements/${reqId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "priority", priority: next }),
    });
    if (res.ok) {
      setReqs(prev => prev.map(r => r.id === reqId ? { ...r, priority: next } : r));
    }
  }

  async function handleReqAction(reqId: string, action: "remove" | "restore") {
    const res = await fetch(`/api/projects/${project.id}/requirements/${reqId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const updated = await res.json();
      setReqs(prev => prev.map(r => r.id === reqId ? { ...r, ...updated } : r));
    }
  }

  async function handleEditSave(reqId: string) {
    if (!editText.trim()) return;
    setReqSaving(true);
    const res = await fetch(`/api/projects/${project.id}/requirements/${reqId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", statement: editText }),
    });
    if (res.ok) {
      const updated = await res.json();
      setReqs(prev => prev.map(r => r.id === reqId ? { ...r, ...updated } : r));
      setEditingReqId(null);
      setEditText("");
    }
    setReqSaving(false);
  }

  async function handleAddReq() {
    if (!newReqText.trim()) return;
    setReqSaving(true);
    const res = await fetch(`/api/projects/${project.id}/requirements/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statement: newReqText }),
    });
    if (res.ok) {
      const created = await res.json();
      setReqs(prev => [...prev, created]);
      setNewReqText("");
      setAddingReq(false);
    }
    setReqSaving(false);
  }

  function handleCreateBaselineWithConfirm() {
    setScopeModal({
      icon: "warn",
      title: latestBaseline ? "Update Scope Baseline?" : "Create Scope Baseline?",
      body: latestBaseline
        ? "This will lock the current requirements into a new baseline version. Once created, documents that contributed to the baseline cannot be deleted and the baseline cannot be rolled back."
        : "Once a scope baseline is created, the extracted requirements are locked in and the baseline cannot be rolled back. Documents that contributed requirements will no longer be deletable.",
      confirmLabel: latestBaseline ? "Update Baseline" : "Create Baseline",
      cancelLabel: "Cancel",
      onConfirm: () => { setScopeModal(null); handleCreateBaseline(); },
    });
  }

  async function handleCreateBaseline() {
    setCreatingBaseline(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/scope-baselines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create baseline");
      setBaselines(prev => [data, ...prev]);
      const hasDelta = (data.impactSummary?.wbsDelta?.length || 0) > 0 ||
                       (data.impactSummary?.scheduleDelta?.length || 0) > 0;
      if (hasDelta) {
        setDeltaReview(data);
      } else {
        // No delta — mark reviewed immediately
        await fetch(`/api/projects/${project.id}/scope-baselines/${data.id}/apply-delta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewed: true }),
        });
        setBaselines(prev => prev.map(b => b.id === data.id ? { ...b, deltaReviewed: true } : b));
      }
      await loadData();
    } catch (err: any) {
      setScopeModal({ icon: "danger", title: "Baseline creation failed", body: err.message || "An unexpected error occurred. Please try again." });
    } finally {
      setCreatingBaseline(false);
    }
  }

  async function handleApplyDelta() {
    if (!deltaReview) return;
    setApplyingDelta(true);
    const accepted = Array.from(acceptedMilestones).map(name => {
      const item = deltaReview.impactSummary?.scheduleDelta?.find(
        (d: any) => d.milestoneName === name
      );
      return { milestoneName: name, estimatedDaysFromEnd: item?.estimatedDaysFromEnd ?? 14 };
    });
    const hasWbsDelta = (deltaReview.impactSummary?.wbsDelta?.length ?? 0) > 0;
    await fetch(`/api/projects/${project.id}/scope-baselines/${deltaReview.id}/apply-delta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptedMilestones: accepted, reviewed: true, applyWbsDelta: hasWbsDelta }),
    });
    setBaselines(prev => prev.map(b => b.id === deltaReview.id ? { ...b, deltaReviewed: true } : b));
    setDeltaReview(null);
    setAcceptedMilestones(new Set());
    setApplyingDelta(false);
    router.refresh();
  }

  const [rollingBack, setRollingBack] = React.useState<string | null>(null);

  async function handleRollback(bl: any, forceConfirm = false) {
    setRollingBack(bl.id);
    const qs = forceConfirm ? "?confirm=true" : "";
    const res = await fetch(`/api/projects/${project.id}/scope-baselines/${bl.id}/rollback${qs}`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 409 && data.requiresConfirmation) {
      setRollingBack(null);
      const del = data.willDelete;
      const bullets: string[] = [];
      bullets.push(`Permanently deletes ${del.baselines.length} newer baseline(s): ${del.baselines.map((b: any) => b.label).join(", ")}`);
      if (del.scheduleTasksWithProgress > 0) {
        bullets.push(`⛔ Discards progress on ${del.scheduleTasksWithProgress} schedule task(s) — this cannot be recovered`);
        del.scheduleTasks.filter((t: any) => (t.percentComplete ?? 0) > 0).slice(0, 4).forEach((t: any) => bullets.push(`   [${t.wbsCode}] ${t.name} — ${t.percentComplete}% complete`));
      } else if (del.scheduleTasks.length > 0) {
        bullets.push(`Removes ${del.scheduleTasks.length} CR-added schedule task(s)`);
      }
      if (del.milestones.length > 0) bullets.push(`Removes ${del.milestones.length} milestone(s)`);
      if (data.willRestore.descopedTasks.length > 0) bullets.push(`Restores ${data.willRestore.descopedTasks.length} previously descoped task(s)`);
      if (data.willFlagStale.length > 0) bullets.push(`Flags for regeneration: ${data.willFlagStale.join(", ")}`);
      setScopeModal({
        icon: "danger",
        title: `Roll back to "${data.target.label}"?`,
        body: "This is a destructive, irreversible action. The following will happen:",
        bullets,
        confirmLabel: "Yes, Roll Back",
        onConfirm: () => { setScopeModal(null); handleRollback(bl, true); },
        cancelLabel: "Cancel",
      });
      return;
    }

    if (!res.ok) {
      setScopeModal({ icon: "danger", title: "Rollback failed", body: data.error || "An unexpected error occurred." });
      setRollingBack(null);
      return;
    }
    setRollingBack(null);
    await loadData();
    router.refresh();
  }

  function handleDeleteDoc(docId: string, fileName: string) {
    setScopeModal({
      icon: "warn",
      title: `Delete "${fileName}"?`,
      body: "Any requirements extracted from this document will also be removed. This cannot be undone.",
      confirmLabel: "Delete Document",
      cancelLabel: "Cancel",
      onConfirm: async () => {
        setScopeModal(null);
        const res = await fetch(`/api/projects/${project.id}/requirements?docId=${encodeURIComponent(docId)}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setScopeModal({ icon: "danger", title: "Delete failed", body: data.error || "An unexpected error occurred." });
          return;
        }
        setDocs(prev => prev.filter(d => d.id !== docId));
        setSelectedDocIds(prev => { const next = new Set(prev); next.delete(docId); return next; });
        await loadData();
      },
    });
  }

  async function runImpactAnalysis() {
    if (selectedDocIds.size < 1) return;
    setImpactStatus("running");
    setImpactText("");
    setImpactSummary(null);
    setTimeout(() => impactPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    try {
      const res = await fetch(`/api/projects/${project.id}/requirements/impact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: [...selectedDocIds] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Analysis failed");
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.summary) setImpactSummary(json.summary);
            if (json.chunk) setImpactText(t => t + json.chunk);
            if (json.done) setImpactStatus("done");
            if (json.error) throw new Error(json.error);
          } catch { /* skip malformed lines */ }
        }
      }
      setImpactStatus("done");
    } catch (err: any) {
      setImpactText(err.message || "Analysis failed");
      setImpactStatus("error");
    }
  }

  const pendingCount = pendingReqs.length;
  const blLabel = latestBaseline?.label ?? null;

  return (
    <div>
      {/* ── Custom confirm / alert modal ───────────────────────────────────── */}
      {scopeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={e => { if (e.target === e.currentTarget && !scopeModal.onConfirm) setScopeModal(null); }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "26px 26px 20px", maxWidth: 480, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,.22)" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: scopeModal.icon === "danger" ? "#fef2f2" : scopeModal.icon === "warn" ? "#fffbeb" : "#eff6ff" }}>
                {scopeModal.icon === "danger" && <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth="2"><path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>}
                {scopeModal.icon === "warn" && <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth="2"><path strokeLinecap="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>}
                {scopeModal.icon === "info" && <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#2563eb" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8h.01M12 12v4"/></svg>}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 5, lineHeight: 1.3 }}>{scopeModal.title}</div>
                <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.65 }}>{scopeModal.body}</div>
              </div>
            </div>
            {scopeModal.bullets && scopeModal.bullets.length > 0 && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "10px 14px", marginBottom: 16, maxHeight: 220, overflowY: "auto" as const }}>
                {scopeModal.bullets.map((b, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#334155", lineHeight: 1.55, padding: "2px 0", display: "flex", gap: 7 }}>
                    <span style={{ color: scopeModal.icon === "danger" ? "#dc2626" : "#d97706", flexShrink: 0, marginTop: 1 }}>•</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {(scopeModal.cancelLabel || scopeModal.onConfirm) && (
                <button onClick={() => setScopeModal(null)} style={{ fontSize: 13, fontWeight: 500, background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
                  {scopeModal.cancelLabel ?? "Dismiss"}
                </button>
              )}
              {scopeModal.onConfirm && (
                <button
                  onClick={scopeModal.onConfirm}
                  style={{ fontSize: 13, fontWeight: 600, background: scopeModal.icon === "danger" ? "#dc2626" : scopeModal.icon === "warn" ? "#d97706" : C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer" }}
                >
                  {scopeModal.confirmLabel ?? "OK"}
                </button>
              )}
              {!scopeModal.onConfirm && (
                <button onClick={() => setScopeModal(null)} style={{ fontSize: 13, fontWeight: 600, background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer" }}>
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Status bar ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" as const, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
          {loading ? (
            <span style={{ fontSize: 12, color: C.text3 }}>Loading…</span>
          ) : blLabel ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: C.green, background: C.greenLight, borderRadius: 6, padding: "3px 10px" }}>
              ✓ {blLabel}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: C.text3 }}>No baseline yet — create one to lock requirements</span>
          )}
          {!loading && blLabel && (
            <span style={{ fontSize: 12, color: C.text2 }}>
              {activeReqs.length} active · {removedReqs.length} removed
            </span>
          )}
          {!loading && pendingCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, color: C.amber, background: C.amberLight, borderRadius: 6, padding: "3px 10px" }}>
              ⚠ {pendingCount} unbaselined
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleExtract}
            disabled={extracting || docs.length === 0}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, background: extracting ? C.surface2 : "#0f766e", color: extracting ? C.text3 : "#fff", border: "none", borderRadius: 7, padding: "6px 13px", cursor: extracting || docs.length === 0 ? "not-allowed" : "pointer", opacity: docs.length === 0 ? 0.5 : 1 }}
          >
            {extracting ? "Extracting…" : "Extract Requirements"}
          </button>
          <style>{`@keyframes risk-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          <button
            onClick={handleCreateBaselineWithConfirm}
            disabled={creatingBaseline || activeReqs.length === 0}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, background: creatingBaseline ? C.surface2 : C.primary, color: creatingBaseline ? C.text3 : "#fff", border: "none", borderRadius: 7, padding: "6px 13px", cursor: creatingBaseline || activeReqs.length === 0 ? "not-allowed" : "pointer", opacity: activeReqs.length === 0 ? 0.5 : 1 }}
          >
            {creatingBaseline && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation: "risk-spin 1s linear infinite", flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {creatingBaseline ? "Saving baseline…" : latestBaseline ? "Update Baseline" : "Create Baseline"}
          </button>
        </div>
      </div>

      {extractError && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.red, fontSize: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/></svg>
          {extractError}
        </div>
      )}

      {/* ── Persistent Review Delta banner (baseline exists but delta not yet reviewed) ─ */}
      {latestBaseline && !latestBaseline.deltaReviewed && !deltaReview && (
        <div style={{ border: `1.5px solid ${C.amber}`, borderRadius: 10, padding: "10px 16px", marginBottom: 14, background: C.amberLight, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 2 }}>
              ⏳ {latestBaseline.label} — WBS & Schedule impact not yet reviewed
            </div>
            <div style={{ fontSize: 11, color: C.text2 }}>
              This baseline has scope changes. Review the proposed WBS and Schedule impact before generating artifacts.
            </div>
          </div>
          <button
            onClick={() => setDeltaReview(latestBaseline)}
            style={{ fontSize: 12, fontWeight: 600, background: C.amber, color: "#fff", border: "none", borderRadius: 7, padding: "7px 16px", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" as const }}
          >
            Review Delta →
          </button>
        </div>
      )}

      {/* ── Delta review panel ──────────────────────────────────────────────── */}
      {deltaReview && (
        <div style={{ border: `1.5px solid ${C.primary}`, borderRadius: 12, overflow: "hidden", marginBottom: 18, boxShadow: "0 4px 20px rgba(79,70,229,.10)" }}>
          <div style={{ background: "linear-gradient(90deg,#4f46e5,#7c3aed)", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              WBS &amp; Schedule Impact — {deltaReview.label}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)" }}>
              Review and accept proposed changes before completing
            </div>
          </div>
          <div style={{ padding: "14px 16px", background: "#fafafa" }}>
            {/* Summary */}
            {deltaReview.impactSummary?.summary && (
              <div style={{ fontSize: 12, color: C.text2, marginBottom: 12, fontStyle: "italic" }}>
                {deltaReview.impactSummary.summary}
              </div>
            )}

            {/* WBS Delta */}
            {(deltaReview.impactSummary?.wbsDelta?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  🏗 WBS Changes
                  <span style={{ fontSize: 11, color: C.green, background: C.greenLight, borderRadius: 5, padding: "1px 6px" }}>
                    {deltaReview.impactSummary.wbsDelta.filter((d: any) => d.action === "add").length} add
                  </span>
                  <span style={{ fontSize: 11, color: C.amber, background: C.amberLight, borderRadius: 5, padding: "1px 6px" }}>
                    {deltaReview.impactSummary.wbsDelta.filter((d: any) => d.action === "flag").length} flag
                  </span>
                </div>
                {deltaReview.impactSummary.wbsDelta.map((item: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, background: item.action === "add" ? C.greenLight : C.amberLight, color: item.action === "add" ? C.green : C.amber }}>
                      {item.action === "add" ? "+" : "!"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>
                        {item.action === "add" ? "Add: " : "Flag: "}{item.workPackageName}
                      </div>
                      <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                        {item.linkedReqKey && <span style={{ fontFamily: "monospace" }}>{item.linkedReqKey}</span>}
                        {item.estimatedDays && <span> · est. {item.estimatedDays} days</span>}
                        {item.progressPct != null && <span style={{ color: C.amber }}> · {item.progressPct}% complete</span>}
                        {item.note && <span> · {item.note}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: C.text3, fontStyle: "italic", flexShrink: 0 }}>Apply manually in WBS</span>
                  </div>
                ))}
              </div>
            )}

            {/* Schedule Delta */}
            {(deltaReview.impactSummary?.scheduleDelta?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  📅 Schedule Changes
                </div>
                {deltaReview.impactSummary.scheduleDelta.map((item: any, i: number) => {
                  const isAccepted = acceptedMilestones.has(item.milestoneName ?? "");
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, background: item.action === "add_milestone" ? C.greenLight : C.amberLight, color: item.action === "add_milestone" ? C.green : C.amber }}>
                        {item.action === "add_milestone" ? "+" : "~"}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>
                          {item.action === "add_milestone" ? `New milestone: ${item.milestoneName}` : `Advisory: ${item.affectedMilestone}`}
                        </div>
                        <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
                          {item.estimatedDaysFromEnd && <span>+{item.estimatedDaysFromEnd} days from current end</span>}
                          {item.estimatedDaysDelta && <span>~{item.estimatedDaysDelta} days shift</span>}
                          {item.note && <span> · {item.note}</span>}
                        </div>
                      </div>
                      {item.action === "add_milestone" ? (
                        <button
                          onClick={() => setAcceptedMilestones(prev => {
                            const next = new Set(prev);
                            if (next.has(item.milestoneName)) next.delete(item.milestoneName);
                            else next.add(item.milestoneName);
                            return next;
                          })}
                          style={{ fontSize: 11, fontWeight: 600, background: isAccepted ? C.greenLight : C.surface2, color: isAccepted ? C.green : C.text2, border: `1px solid ${isAccepted ? C.green : C.border}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", flexShrink: 0 }}
                        >
                          {isAccepted ? "✓ Will add" : "Add milestone"}
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: C.text3, fontStyle: "italic", flexShrink: 0 }}>PM adjusts manually</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
              <button
                onClick={() => { setDeltaReview(null); setAcceptedMilestones(new Set()); }}
                style={{ fontSize: 12, background: C.surface2, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 14px", cursor: "pointer" }}
              >
                Skip
              </button>
              <button
                onClick={handleApplyDelta}
                disabled={applyingDelta}
                style={{ fontSize: 12, fontWeight: 600, background: C.primary, color: "#fff", border: "none", borderRadius: 7, padding: "6px 16px", cursor: applyingDelta ? "not-allowed" : "pointer", opacity: applyingDelta ? 0.7 : 1 }}
              >
                {applyingDelta ? "Applying…" : `Accept${acceptedMilestones.size > 0 ? ` (${acceptedMilestones.size} milestones)` : ""} & Complete`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stacked layout: source docs row → requirements table ──────────── */}
      <div style={{ display: "flex", flexDirection: "column" as const, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>

        {/* Source Documents — horizontal tile row */}
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" as const, color: C.text3 }}>
              Source Documents
              {docs.length > 0 && <span style={{ fontWeight: 400, textTransform: "none", marginLeft: 6, color: C.text3 }}>({docs.length})</span>}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, alignItems: "flex-start" }}>
            {docs.map((doc: any) => {
              const ext = (doc.fileName?.split(".").pop()?.toUpperCase() || "DOC") as string;
              const isExtracting = extractingDocIds.has(doc.id);
              const isChecked = selectedDocIds.has(doc.id);
              const canCheck = !isExtracting && (isChecked || selectedDocIds.size < 2);
              return (
                <div
                  key={doc.id}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 8, background: isChecked ? C.primaryLight : C.surface2, border: `1px solid ${isChecked ? C.primaryBorder : isExtracting ? C.amber : C.border}`, opacity: isExtracting ? 0.75 : 1 }}
                >
                  {/* Spinner while extracting, checkbox otherwise */}
                  {isExtracting ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" stroke={C.amber} strokeWidth="2.5" strokeDasharray="31" strokeDashoffset="10" />
                    </svg>
                  ) : (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!canCheck}
                      onChange={() => setSelectedDocIds(prev => {
                        const next = new Set(prev);
                        if (next.has(doc.id)) next.delete(doc.id);
                        else if (next.size < 2) next.add(doc.id);
                        return next;
                      })}
                      title={!canCheck ? "Deselect a document first (max 2)" : isChecked ? "Deselect" : "Select for comparison"}
                      style={{ cursor: canCheck ? "pointer" : "not-allowed", accentColor: C.primary, flexShrink: 0, width: 14, height: 14 }}
                    />
                  )}
                  <div style={{ width: 28, height: 28, borderRadius: 5, background: EXT_COLORS[ext] || "#5b616e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{ext}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{doc.fileName}</div>
                    <div style={{ fontSize: 10, color: isExtracting ? C.amber : C.text3 }}>{isExtracting ? "Extracting requirements…" : formatDate(doc.createdAt)}</div>
                  </div>
                  {!isExtracting && !isDocLocked(doc) && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteDoc(doc.id, doc.fileName); }}
                      title="Delete document"
                      style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 7px", border: `1px solid ${C.red}`, borderRadius: 5, fontSize: 10, fontWeight: 600, color: C.red, background: "#fff5f5", cursor: "pointer", flexShrink: 0, lineHeight: 1.4, opacity: loading ? 0 : 1, transition: "opacity 0.15s" }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      Delete
                    </button>
                  )}
                </div>
              );
            })}

            {/* Upload tile */}
            {!showUploadForm ? (
              <button onClick={() => setShowUploadForm(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", border: `1.5px dashed ${C.border}`, borderRadius: 8, fontSize: 11, color: C.text3, background: "transparent", cursor: "pointer" }}>
                + Upload doc
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", background: C.surface2 }}>
                <select value={docClass} onChange={e => setDocClass(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 6px", fontSize: 11, background: C.surface }}>
                  {DOC_CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, background: uploading ? C.surface2 : C.primary, color: uploading ? C.text3 : "#fff", borderRadius: 5, padding: "5px 9px", cursor: uploading ? "not-allowed" : "pointer" }}>
                  {uploading && <span style={{ display: "inline-block", width: 11, height: 11, border: "2px solid #ccc", borderTopColor: C.primary, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
                  {uploading ? "Uploading…" : "Choose file"}
                  <input type="file" accept=".pdf,.docx,.xlsx,.xls,.txt,.csv" style={{ display: "none" }} disabled={uploading} onChange={handleFileChange} />
                </label>
                {uploadError && <div style={{ fontSize: 10, color: C.red }}>{uploadError}</div>}
                <button onClick={() => setShowUploadForm(false)} style={{ fontSize: 10, color: C.text3, background: "transparent", border: "none", cursor: "pointer" }}>Cancel</button>
              </div>
            )}

            {/* Impact analysis — shown inline when exactly 2 ready docs are selected */}
            {(() => {
              const readySelected = [...selectedDocIds].filter(id => !extractingDocIds.has(id));
              const anySelectedExtracting = [...selectedDocIds].some(id => extractingDocIds.has(id));
              if (readySelected.length >= 1 && !anySelectedExtracting) {
                const label = readySelected.length === 1
                  ? "Run Impact Analysis (vs baseline)"
                  : `Run Impact Analysis (${readySelected.length} docs)`;
                return (
                  <button
                    onClick={runImpactAnalysis}
                    disabled={impactStatus === "running"}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", fontSize: 11, fontWeight: 600, background: impactStatus === "running" ? C.surface2 : "#4f46e5", color: impactStatus === "running" ? C.text3 : "#fff", border: "none", borderRadius: 8, cursor: impactStatus === "running" ? "not-allowed" : "pointer", opacity: impactStatus === "running" ? 0.7 : 1 }}
                  >
                    {impactStatus === "running" ? "Analysing…" : label}
                  </button>
                );
              }
              if (anySelectedExtracting) {
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: C.amber, fontStyle: "italic", padding: "7px 0" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" stroke={C.amber} strokeWidth="2.5" strokeDasharray="31" strokeDashoffset="10" /></svg>
                    Waiting for extraction to finish…
                  </div>
                );
              }
              if (docs.length >= 1 && selectedDocIds.size === 0) {
                return (
                  <div style={{ display: "flex", alignItems: "center", fontSize: 10, color: C.text3, fontStyle: "italic", padding: "7px 0" }}>
                    Check a doc to analyse its impact on your baseline
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Requirements table — full width below */}
        <div style={{ display: "flex", flexDirection: "column" as const }}>
          {/* Requirements header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 11px", borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" as const, color: C.text3 }}>
              {latestBaseline ? `Baselined requirements (${latestBaseline.label})` : "Requirements"}
            </span>
            <button onClick={() => setAddingReq(v => !v)} style={{ fontSize: 11, fontWeight: 600, color: C.primary, background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>+ Add</button>
          </div>

          {/* Add requirement form */}
          {addingReq && (
            <div style={{ padding: "8px 11px", borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
              <textarea
                value={newReqText}
                onChange={e => setNewReqText(e.target.value)}
                placeholder="Enter requirement statement…"
                rows={2}
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 9px", fontSize: 12, resize: "vertical" as const, background: C.surface, boxSizing: "border-box" as const }}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={handleAddReq} disabled={reqSaving || !newReqText.trim()} style={{ fontSize: 11, fontWeight: 600, background: C.green, color: "#fff", border: "none", borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>Save</button>
                <button onClick={() => { setAddingReq(false); setNewReqText(""); }} style={{ fontSize: 11, background: C.surface2, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Table column header */}
          <div style={{ display: "flex", alignItems: "center", padding: "5px 11px", gap: 8, background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: C.text3, width: 52, flexShrink: 0, textTransform: "uppercase" as const, letterSpacing: ".04em" }}>#</span>
            <span style={{ width: 26, flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".04em" }}>Pri</span>
            <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".04em" }}>Requirement Statement</span>
            <span style={{ width: 52, flexShrink: 0, fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".04em" }}>Actions</span>
          </div>

          {loading ? (
            <div style={{ padding: "20px 11px", fontSize: 12, color: C.text3 }}>Loading…</div>
          ) : (
            <>
              {/* Active baselined requirements (paginated) */}
              {basedReqs.slice(0, basedPage).map((req: any) => (
                <ReqRow key={req.id} req={req} editingReqId={editingReqId} editText={editText} setEditText={setEditText} reqSaving={reqSaving}
                  onEdit={() => { setEditingReqId(req.id); setEditText(req.statement); }}
                  onEditSave={() => handleEditSave(req.id)}
                  onEditCancel={() => { setEditingReqId(null); setEditText(""); }}
                  onRemove={() => handleReqAction(req.id, "remove")}
                  onPriority={() => handlePriorityChange(req.id, req.priority ?? "M")}
                />
              ))}
              {basedReqs.length > basedPage && (
                <div style={{ padding: "8px 11px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <button onClick={() => setBasedPage(p => p + PAGE_SIZE)}
                    style={{ fontSize: 11, fontWeight: 600, color: C.primary, background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 5, padding: "4px 12px", cursor: "pointer" }}>
                    Load next 10 ({basedReqs.length - basedPage} remaining)
                  </button>
                </div>
              )}

              {/* Struck-through removed requirements — live from isActive:false rows */}
              {removedReqs.map((r: any) => (
                <div key={r.id} style={{ display: "flex", alignItems: "flex-start", padding: "7px 11px", gap: 8, borderBottom: `1px solid ${C.borderLight}`, background: "#fff8f8" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 500, color: C.red, width: 52, flexShrink: 0, paddingTop: 1 }}>{r.requirementKey}</span>
                  <div style={{ flex: 1, display: "flex", flexWrap: "wrap" as const, alignItems: "flex-start", gap: 6 }}>
                    <span style={{ fontSize: 12, textDecoration: "line-through", color: C.text3, lineHeight: 1.45 }}>{r.statement}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.red, background: "#fde8e8", borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>Removed</span>
                  </div>
                  <button
                    onClick={() => handleReqAction(r.id, "restore")}
                    style={{ fontSize: 10, fontWeight: 600, color: C.primary, background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 5, padding: "2px 8px", cursor: "pointer", flexShrink: 0 }}
                  >
                    restore
                  </button>
                </div>
              ))}

              {/* Pending divider */}
              {pendingReqs.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 11px", background: C.primaryLight, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: C.primary }}>Pending — not yet baselined ({pendingReqs.length})</span>
                  <span style={{ fontSize: 11, color: C.text3, marginLeft: "auto" }}>will appear in next baseline</span>
                </div>
              )}

              {/* Pending requirements (paginated) */}
              {pendingReqs.slice(0, pendingPage).map((req: any) => (
                <ReqRow key={req.id} req={req} editingReqId={editingReqId} editText={editText} setEditText={setEditText} reqSaving={reqSaving}
                  isPending
                  onEdit={() => { setEditingReqId(req.id); setEditText(req.statement); }}
                  onEditSave={() => handleEditSave(req.id)}
                  onEditCancel={() => { setEditingReqId(null); setEditText(""); }}
                  onRemove={() => handleReqAction(req.id, "remove")}
                  onPriority={() => handlePriorityChange(req.id, req.priority ?? "M")}
                />
              ))}
              {pendingReqs.length > pendingPage && (
                <div style={{ padding: "8px 11px", borderBottom: `1px solid ${C.borderLight}`, background: "#f5f7ff" }}>
                  <button onClick={() => setPendingPage(p => p + PAGE_SIZE)}
                    style={{ fontSize: 11, fontWeight: 600, color: C.primary, background: C.primaryLight, border: `1px solid ${C.primaryBorder}`, borderRadius: 5, padding: "4px 12px", cursor: "pointer" }}>
                    Load next 10 ({pendingReqs.length - pendingPage} remaining)
                  </button>
                </div>
              )}

              {activeReqs.length === 0 && removedReqs.length === 0 && (
                <div style={{ padding: "24px 16px", textAlign: "center" as const, color: C.text3, fontSize: 13 }}>
                  No requirements yet. Upload a document and extract requirements, or add one manually.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Impact Analysis Results ─────────────────────────────────────────── */}
      {(impactStatus === "running" || impactStatus === "done" || impactStatus === "error") && (
        <div ref={impactPanelRef} style={{ marginTop: 16, border: `1.5px solid #4f46e5`, borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 20px rgba(79,70,229,.10)" }}>
          {/* Header */}
          <div style={{ background: "linear-gradient(90deg, #4f46e5, #7c3aed)", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Impact Analysis</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)" }}>
                {selectedDocIds.size} documents compared · {impactStatus === "running" ? "Analysing…" : impactStatus === "error" ? "Error" : "Complete"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {impactStatus === "running" && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.5)" strokeWidth="2" strokeDasharray="31" strokeDashoffset="10" /></svg>
              )}
              {impactStatus !== "running" && (
                <button
                  onClick={() => { setImpactStatus("idle"); setImpactText(""); setImpactSummary(null); setSelectedDocIds(new Set()); }}
                  style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontWeight: 500 }}
                >Close</button>
              )}
            </div>
          </div>

          {/* Summary cards — scope / schedule / cost */}
          {(impactSummary || impactStatus === "running") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, borderBottom: `1px solid #e0dffe` }}>
              {[
                { icon: "📋", label: "Scope", key: "scope" as const, accent: "#4f46e5", bg: "#eef2ff" },
                { icon: "📅", label: "Schedule", key: "schedule" as const, accent: "#0891b2", bg: "#ecfeff" },
                { icon: "💰", label: "Cost", key: "cost" as const, accent: "#059669", bg: "#ecfdf5" },
              ].map((card, i) => (
                <div key={card.key} style={{ padding: "12px 14px", background: card.bg, borderRight: i < 2 ? "1px solid #e0dffe" : "none" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase" as const, color: card.accent, marginBottom: 4 }}>
                    {card.icon} {card.label} Impact
                  </div>
                  {impactSummary ? (
                    <div style={{ fontSize: 12, color: "#1e293b", lineHeight: 1.5 }}>{impactSummary[card.key]}</div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>Calculating…</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Detailed streaming text */}
          <div style={{ padding: "16px 18px", background: "#fafafa", maxHeight: 440, overflowY: "auto" as const }}>
            {impactStatus === "error" ? (
              <div style={{ color: "#cf3f3a", fontSize: 13 }}>{impactText || "Analysis failed. Please try again."}</div>
            ) : (
              <div style={{ fontSize: 13, color: "#1a2332", lineHeight: 1.75, whiteSpace: "pre-wrap" as const }}>
                {impactText || <span style={{ color: "#9ca3af" }}>Generating detailed analysis…</span>}
                {impactStatus === "running" && <span style={{ display: "inline-block", width: 8, height: 14, background: "#4f46e5", borderRadius: 2, marginLeft: 2, verticalAlign: "text-bottom", animation: "blink-cursor 1s step-end infinite" }} />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bottom: Baseline history + Changelog ────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 12 }}>
          {(["history", "changelog"] as const).map(t => (
            <button key={t} onClick={() => setBottomTab(t)} style={{ padding: "6px 13px", fontSize: 12, fontWeight: 500, color: bottomTab === t ? C.primary : C.text3, background: "transparent", border: "none", borderBottom: `2px solid ${bottomTab === t ? C.primary : "transparent"}`, cursor: "pointer" }}>
              {t === "history" ? "Baseline history" : "Changelog"}
            </button>
          ))}
        </div>

        {bottomTab === "history" && (
          baselines.length === 0 ? (
            <div style={{ fontSize: 12, color: C.text3, padding: "8px 0" }}>No baselines created yet.</div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative", padding: "6px 0" }}>
              <div style={{ position: "absolute", top: 16, left: 16, right: 16, height: 1, background: C.border, zIndex: 0 }} />
              {[...baselines].reverse().map((bl: any) => {
                const isDraft = !bl.deltaReviewed;
                const isActive = bl.id === latestBaseline?.id && bl.deltaReviewed;
                const prev = [...baselines].reverse().find(b => b.version === bl.version - 1);
                const prevSnap: any[] = prev ? (prev.snapshot as any[]) ?? [] : [];
                const currSnap: any[] = (bl.snapshot as any[]) ?? [];
                const added = currSnap.filter((r: any) => !prevSnap.find((p: any) => p.requirementKey === r.requirementKey)).length;
                const removed = (bl.removedSnapshot as any[])?.length ?? 0;
                return (
                  <div key={bl.id} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 5, position: "relative", zIndex: 1, flex: 1, maxWidth: 140 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, border: `2px solid ${C.surface}`, background: isActive ? C.primary : isDraft ? C.amber : C.border }} />
                    <div style={{ background: C.surface, border: `1px solid ${isActive ? C.primary : isDraft ? C.amber : C.border}`, borderStyle: isDraft ? "dashed" : "solid", borderRadius: 8, padding: "7px 9px", textAlign: "center" as const, width: "100%", maxWidth: 130 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: isActive ? C.primary : isDraft ? C.amber : C.text }}>
                        {isActive ? `★ ${bl.label}` : bl.label}
                      </div>
                      <div style={{ fontSize: 10, color: C.text3, marginTop: 1 }}>{formatDate(bl.createdAt)}</div>
                      <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{bl.requirementCount} reqs</div>
                      <div style={{ display: "flex", gap: 3, justifyContent: "center", marginTop: 3 }}>
                        {added > 0 && <span style={{ fontSize: 10, color: C.green, background: C.greenLight, borderRadius: 4, padding: "1px 5px" }}>+{added}</span>}
                        {removed > 0 && <span style={{ fontSize: 10, color: C.red, background: C.redLight, borderRadius: 4, padding: "1px 5px" }}>−{removed}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {bottomTab === "changelog" && (
          baselines.length === 0 ? (
            <div style={{ fontSize: 12, color: C.text3, padding: "8px 0" }}>No changes recorded yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 0 }}>
              {baselines.map((bl: any) => {
                const removed: any[] = (bl.removedSnapshot as any[]) ?? [];
                const allSnap: any[] = (bl.snapshot as any[]) ?? [];
                const prevBl = baselines.find((b: any) => b.version === bl.version - 1);
                const prevSnap: any[] = prevBl ? (prevBl.snapshot as any[]) ?? [] : [];
                const added = allSnap.filter(r => !prevSnap.find((p: any) => p.requirementKey === r.requirementKey));
                return (
                  <div key={bl.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: C.text2, marginBottom: 6, display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.primary, background: C.primaryLight, borderRadius: 4, padding: "1px 6px" }}>{bl.label}</span>
                      {formatDate(bl.createdAt)}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 3, paddingLeft: 14 }}>
                      {added.map((r: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: C.text2, display: "flex", alignItems: "flex-start", gap: 7 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0, marginTop: 4 }} />
                          <span><span style={{ fontFamily: "monospace", fontSize: 11, color: C.text3 }}>{r.requirementKey}</span> {r.statement.slice(0, 80)}{r.statement.length > 80 ? "…" : ""}</span>
                        </div>
                      ))}
                      {removed.map((r: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, color: C.text2, display: "flex", alignItems: "flex-start", gap: 7 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.red, flexShrink: 0, marginTop: 4 }} />
                          <span><span style={{ fontFamily: "monospace", fontSize: 11, color: C.text3 }}>{r.requirementKey}</span> <span style={{ textDecoration: "line-through" }}>{r.statement.slice(0, 80)}</span>{r.statement.length > 80 ? "…" : ""} — removed</span>
                        </div>
                      ))}
                      {added.length === 0 && removed.length === 0 && (
                        <div style={{ fontSize: 12, color: C.text3, fontStyle: "italic" }}>Initial baseline</div>
                      )}
                    </div>
                    <div style={{ borderTop: `1px solid ${C.borderLight}`, marginTop: 8 }} />
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── Legacy RequirementsTab (keep for impact analysis functionality) ─────────────

function RequirementsTab({ project }: { project: any }) {
  const router = useRouter();
  const [docs, setDocs] = React.useState<any[]>(project.requirementsDocs || []);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [extracted, setExtracted] = React.useState<any | null>(null);
  const [docClass, setDocClass] = React.useState("sow");
  const [readiness, setReadiness] = React.useState<{ score: number; band: string; missingMandatory: string[] } | null>(null);
  const [showUploadForm, setShowUploadForm] = React.useState(false);

  // Requirements state
  const [reqs, setReqs] = React.useState<any[]>([]);
  const [extracting, setExtracting] = React.useState(false);
  const [extractError, setExtractError] = React.useState<string | null>(null);
  const [activeView, setActiveView] = React.useState<"docs" | "reqs">("docs");
  const [amendingId, setAmendingId] = React.useState<string | null>(null);
  const [amendText, setAmendText] = React.useState("");

  // Impact analysis
  const [selectedDocIds, setSelectedDocIds] = React.useState<Set<string>>(new Set());
  const [impactStatus, setImpactStatus] = React.useState<"idle" | "running" | "done" | "error">("idle");
  const [impactText, setImpactText] = React.useState("");
  const impactPanelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fetch(`/api/projects/${project.id}/evidence-readiness`)
      .then(r => r.json())
      .then(d => setReadiness(d))
      .catch(() => null);
    // Load existing requirements
    fetch(`/api/projects/${project.id}/requirements/list`)
      .then(r => r.json())
      .then(d => Array.isArray(d) && setReqs(d))
      .catch(() => null);
  }, [project.id, docs.length]);

  async function handleExtract() {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/requirements/extract`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      if ((data.extracted ?? 0) === 0) {
        throw new Error("No requirements found in the uploaded documents. Ensure the documents contain formal requirements (BR-xx, NFR-xx, etc.) and try again.");
      }
      // Reload requirements list then switch to the reqs sub-tab
      const listRes = await fetch(`/api/projects/${project.id}/requirements/list`);
      const list = await listRes.json();
      if (Array.isArray(list)) setReqs(list);
      setActiveView("reqs");
    } catch (err: any) {
      setExtractError(err.message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleReqAction(reqId: string, action: "confirm" | "reject" | "amend") {
    const body: Record<string, string> = { requirementId: reqId, action };
    if (action === "amend") body.amendedStatement = amendText;
    const res = await fetch(`/api/projects/${project.id}/requirements/list`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setReqs(prev => prev.map(r => r.id === reqId ? { ...r, ...updated } : r));
      setAmendingId(null);
      setAmendText("");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setExtracted(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docClass", docClass);
      const res = await fetch(`/api/projects/${project.id}/requirements`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({ error: res.statusText || "Upload failed" }));
      if (!res.ok) throw new Error(data?.error || "Upload failed");
      setDocs((prev) => [data.doc, ...prev]);
      setExtracted(data.extractedContent);
      setShowUploadForm(false);
      router.refresh();
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function runImpactAnalysis() {
    if (selectedDocIds.size < 1) return;
    setImpactStatus("running");
    setImpactText("");
    setTimeout(() => impactPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    try {
      const res = await fetch(`/api/projects/${project.id}/requirements/impact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentIds: [...selectedDocIds] }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Analysis failed");
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.chunk) setImpactText(t => t + json.chunk);
            if (json.done)  setImpactStatus("done");
            if (json.error) throw new Error(json.error);
          } catch { /* skip malformed lines */ }
        }
      }
      setImpactStatus("done");
    } catch (err: any) {
      setImpactText(err.message || "Analysis failed");
      setImpactStatus("error");
    }
  }

  const confirmedCount = reqs.filter(r => r.status === "confirmed").length;
  const proposedCount  = reqs.filter(r => r.status === "proposed").length;

  // Artifact types already generated — project_charter covers Statement of Work, scope_statement covers Business Requirements
  const generatedArtifactTypes = new Set((project.artifacts || []).map((a: any) => a.artifactType));
  const ARTIFACT_COVERS: Record<string, string[]> = {
    project_charter: ["Statement of Work"],
    scope_statement: ["Business Requirements"],
    business_case:   ["Business Requirements", "Statement of Work"],
  };
  const coveredByArtifact = new Set<string>();
  for (const [artType, labels] of Object.entries(ARTIFACT_COVERS)) {
    if (generatedArtifactTypes.has(artType)) labels.forEach((l) => coveredByArtifact.add(l));
  }
  const effectiveMissing = (readiness?.missingMandatory ?? []).filter((l) => !coveredByArtifact.has(l));

  return (
    <div>
      {/* Evidence readiness strip */}
      {readiness && (
        <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 18, background: C.surface2, display: "flex", alignItems: "flex-start", gap: 12 }}>
          {effectiveMissing.length > 0 ? (
            <>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#92400e" strokeWidth="1.7" strokeLinejoin="round"/><path d="M14 2v6h6M12 17v-5M12 10h.01" stroke="#92400e" strokeWidth="1.7" strokeLinecap="round"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 3 }}>Some required documents haven&apos;t been uploaded yet</div>
                <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5, marginBottom: 8 }}>Upload the following so your AI assistant can generate accurate scope artifacts and extract requirements with full coverage.</div>
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
                  {effectiveMissing.map((l) => (
                    <span key={l} style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 10, background: "#fee2e2", color: "#b91c1c" }}>{l}</span>
                  ))}
                  {(readiness.missingMandatory ?? []).filter((l) => coveredByArtifact.has(l)).map((l) => (
                    <span key={l} style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 10, background: "#dcfce7", color: "#166534" }}>{l} ✓ covered by artifact</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "#e3f3ea", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="#166534" strokeWidth="1.7" strokeLinecap="round"/><path d="M22 4L12 14.01l-3-3" stroke="#166534" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>All required documents are in place</div>
                <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5, marginTop: 3 }}>Your AI assistant has everything it needs to generate scope artifacts and extract requirements with full coverage.</div>
              </div>
            </>
          )}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 8, flexWrap: "wrap" as const }}>
        {/* Left: impact analysis button — shown when 2+ docs selected */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {selectedDocIds.size >= 2 && (
            <button
              onClick={runImpactAnalysis}
              disabled={impactStatus === "running"}
              style={{ display: "flex", alignItems: "center", gap: 7, background: impactStatus === "running" ? C.surface2 : "#4f46e5", color: impactStatus === "running" ? C.text3 : "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: impactStatus === "running" ? "not-allowed" : "pointer", opacity: impactStatus === "running" ? 0.7 : 1 }}
            >
              {impactStatus === "running" ? (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" stroke={C.text3} strokeWidth="2" strokeDasharray="31" strokeDashoffset="10" /></svg>Analysing…</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 19l-7-7 7-7M22 12H2M15 5l7 7-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>Run Impact Analysis ({selectedDocIds.size})</>
              )}
            </button>
          )}
          {selectedDocIds.size === 1 && (
            <span style={{ fontSize: 12, color: C.text3 }}>Select 1 more document to run Impact Analysis</span>
          )}
        </div>

        {/* Right: existing actions */}
        <div style={{ display: "flex", gap: 8 }}>
          {docs.length > 0 && (
            <button
              onClick={handleExtract}
              disabled={extracting}
              style={{ display: "flex", alignItems: "center", gap: 7, background: extracting ? C.surface2 : "#0f766e", color: extracting ? C.text3 : "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: extracting ? "not-allowed" : "pointer", opacity: extracting ? 0.7 : 1 }}
            >
              {extracting ? (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" stroke={C.text3} strokeWidth="2" strokeDasharray="31" strokeDashoffset="10" /></svg>Extracting…</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>Extract Requirements</>
              )}
            </button>
          )}
          <button
            onClick={() => setShowUploadForm(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 7, background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Upload document
          </button>
        </div>
      </div>
      {extractError && <div style={{ color: "#cf3f3a", fontSize: 12, marginBottom: 10 }}>{extractError}</div>}

      {/* Upload form */}
      {showUploadForm && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Upload source document</div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 4 }}>Document class</div>
              <select
                value={docClass}
                onChange={e => setDocClass(e.target.value)}
                style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 13, background: C.surface, color: C.text }}
              >
                {DOC_CLASS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label} (+{o.pts} pts)</option>
                ))}
              </select>
            </div>
            <label style={{
              display: "flex", alignItems: "center", gap: 8,
              background: uploading ? C.surface2 : C.primary,
              color: uploading ? C.text3 : "#fff",
              border: "none", borderRadius: 8, padding: "8px 16px",
              fontSize: 13, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer",
              opacity: uploading ? 0.7 : 1,
            }}>
              {uploading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" stroke={C.text3} strokeWidth="2" strokeDasharray="31" strokeDashoffset="10" /></svg>
                  Processing…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Choose file
                </>
              )}
              <input type="file" accept=".pdf,.docx,.xlsx,.xls,.txt,.csv" style={{ display: "none" }} disabled={uploading} onChange={handleFileChange} />
            </label>
          </div>
          {uploadError && <div style={{ color: "#cf3f3a", fontSize: 12, marginTop: 8 }}>{uploadError}</div>}
        </div>
      )}

      {/* View toggle */}
      {docs.length > 0 && (
        <div style={{ display: "flex", gap: 4, background: C.surface2, borderRadius: 10, padding: 4, marginBottom: 16, alignSelf: "flex-start" as const, width: "fit-content" }}>
          {(["docs", "reqs"] as const).map(v => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              style={{
                background: activeView === v ? C.surface : "transparent",
                color: activeView === v ? C.text : C.text3,
                border: "none", borderRadius: 7, padding: "6px 14px",
                fontSize: 13, fontWeight: activeView === v ? 600 : 400, cursor: "pointer",
                boxShadow: activeView === v ? `0 1px 3px ${C.border}` : "none",
              }}
            >
              {v === "docs" ? `Documents (${docs.length})` : `Requirements (${reqs.length})`}
            </button>
          ))}
        </div>
      )}

      {/* Extracted content panel — legacy, shown only in docs view */}
      {activeView === "docs" && extracted && (
        <div style={{ background: "#f0faf5", border: "1px solid #01B27C", borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#007a55", marginBottom: 10 }}>AI Extracted Content</div>
          {(["objectives","inScope","constraints","assumptions"] as const).map(key => {
            const items = extracted[key];
            if (!items?.length) return null;
            const labels: Record<string, string> = { objectives: "Objectives", inScope: "In Scope", constraints: "Constraints", assumptions: "Assumptions" };
            return (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 }}>{labels[key]}</div>
                {items.map((o: string, i: number) => <div key={i} style={{ fontSize: 12, color: C.text, marginBottom: 2 }}>• {o}</div>)}
              </div>
            );
          })}
          {extracted.stakeholders?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 }}>Stakeholders</div>
              {extracted.stakeholders.map((s: any, i: number) => <div key={i} style={{ fontSize: 12, color: C.text, marginBottom: 2 }}>• {s.name} — {s.role}</div>)}
            </div>
          )}
        </div>
      )}

      {/* ── DOCS VIEW ── */}
      {activeView === "docs" && (
        docs.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {docs.length > 1 && (
              <div style={{ fontSize: 11, color: C.text3, marginBottom: 4, paddingLeft: 2 }}>
                Select documents to compare, then click <strong>Run Impact Analysis</strong>
              </div>
            )}
            {docs.map((doc: any) => {
              const ext = doc.fileName?.split(".").pop()?.toUpperCase() || "DOC";
              const cls = CLASS_LABELS[doc.docClass] ?? "Other";
              const isChecked = selectedDocIds.has(doc.id);
              return (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDocIds(prev => {
                    const next = new Set(prev);
                    if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id);
                    return next;
                  })}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: isChecked ? "rgba(79,70,229,.04)" : C.surface, border: `1px solid ${isChecked ? "#4f46e5" : C.border}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", transition: "border-color .15s, background .15s" }}
                >
                  {/* Checkbox */}
                  <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: `2px solid ${isChecked ? "#4f46e5" : C.border}`, background: isChecked ? "#4f46e5" : C.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isChecked && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: EXT_COLORS[ext] || "#5b616e", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{ext}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{doc.fileName}</div>
                    <div style={{ fontSize: 11, color: C.text3 }}>{formatDate(doc.createdAt)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.primary, background: "#eef0fc", borderRadius: 5, padding: "2px 8px" }}>{cls}</span>
                    {doc.chunkCount > 0 && (
                      <span style={{ fontSize: 11, color: C.text3 }}>{doc.chunkCount} chunks</span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#158a5a", background: "#e3f3ea", borderRadius: 5, padding: "2px 8px" }}>
                      {doc.ingestionState === "ready" ? "Ready" : doc.ingestionState}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: "28px 20px", textAlign: "center" as const }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.primary, marginBottom: 6 }}>No source documents uploaded</div>
            <div style={{ fontSize: 13, color: C.text2 }}>Upload a SOW, BRD, or estimation sheet to ground artifact generation in your project&apos;s actual content.</div>
          </div>
        )
      )}

      {/* ── IMPACT ANALYSIS RESULTS ── */}
      {(impactStatus === "running" || impactStatus === "done" || impactStatus === "error") && activeView === "docs" && (
        <div ref={impactPanelRef} style={{ marginTop: 20, border: `1.5px solid #4f46e5`, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 20px rgba(79,70,229,.10)" }}>
          {/* Panel header */}
          <div style={{ background: "linear-gradient(90deg, #4f46e5, #7c3aed)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 19l-7-7 7-7M22 12H2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Impact Analysis</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)" }}>
                  {selectedDocIds.size} documents compared · {impactStatus === "running" ? "Analysing…" : impactStatus === "error" ? "Error" : "Complete"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {impactStatus === "running" && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.5)" strokeWidth="2" strokeDasharray="31" strokeDashoffset="10" /></svg>
              )}
              {impactStatus !== "running" && (
                <button
                  onClick={() => { setImpactStatus("idle"); setImpactText(""); setSelectedDocIds(new Set()); }}
                  style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontWeight: 500 }}
                >
                  Close
                </button>
              )}
            </div>
          </div>

          {/* Panel body — streaming markdown-like text */}
          <div style={{ padding: "18px 20px", background: "#fafafa", maxHeight: 520, overflowY: "auto" as const }}>
            {impactStatus === "error" ? (
              <div style={{ color: "#cf3f3a", fontSize: 13 }}>{impactText || "Analysis failed. Please try again."}</div>
            ) : (
              <div style={{ fontSize: 13, color: "#1a2332", lineHeight: 1.75, whiteSpace: "pre-wrap" as const, fontFamily: "var(--font-inter),'Inter', -apple-system, sans-serif" }}>
                {impactText || <span style={{ color: "#9ca3af" }}>Starting analysis…</span>}
                {impactStatus === "running" && <span style={{ display: "inline-block", width: 8, height: 14, background: "#4f46e5", borderRadius: 2, marginLeft: 2, verticalAlign: "text-bottom", animation: "blink-cursor 1s step-end infinite" }} />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REQUIREMENTS VIEW ── */}
      {activeView === "reqs" && (
        reqs.length === 0 ? (
          <div style={{ background: "linear-gradient(160deg,#f0faf5,#e3f3ea)", border: "1px solid #01B27C", borderRadius: 14, padding: "28px 20px", textAlign: "center" as const }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⬡</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#007a55", marginBottom: 6 }}>No requirements extracted yet</div>
            <div style={{ fontSize: 13, color: C.text2 }}>Click &ldquo;Extract Requirements&rdquo; above to have AI identify and structure requirements from your uploaded documents.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
            {/* Summary strip */}
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: C.text3, marginBottom: 4 }}>
              <span><strong style={{ color: C.text }}>{reqs.length}</strong> total</span>
              <span><strong style={{ color: "#158a5a" }}>{confirmedCount}</strong> confirmed</span>
              <span><strong style={{ color: "#c17d12" }}>{proposedCount}</strong> proposed</span>
              <span><strong style={{ color: "#cf3f3a" }}>{reqs.filter(r => r.status === "rejected").length}</strong> rejected</span>
            </div>

            {reqs.map((req: any) => {
              const cfg = REQ_STATUS_CFG[req.status as keyof typeof REQ_STATUS_CFG] ?? REQ_STATUS_CFG.proposed;
              const isAmending = amendingId === req.id;
              return (
                <div key={req.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text3, fontFamily: "monospace", background: C.surface2, borderRadius: 5, padding: "2px 6px" }}>{req.requirementKey}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.primary, background: "#eef0fc", borderRadius: 5, padding: "2px 7px" }}>{req.type}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg, borderRadius: 5, padding: "2px 7px" }}>{cfg.label}</span>
                    {req.category && <span style={{ fontSize: 11, color: C.text3 }}>{req.category}</span>}
                    {req.confidence && <span style={{ fontSize: 11, color: C.text3 }}>{Math.round(req.confidence * 100)}% conf.</span>}
                  </div>

                  {/* Statement */}
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: req.amendedStatement ? 6 : 0 }}>
                    {req.amendedStatement ? (
                      <>
                        <span style={{ textDecoration: "line-through", color: C.text3 }}>{req.statement}</span>
                        <span style={{ marginLeft: 8, color: "#158a5a" }}>{req.amendedStatement}</span>
                      </>
                    ) : req.statement}
                  </div>

                  {/* Source quote (collapsible) */}
                  {req.sourceQuote && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ fontSize: 11, color: C.text3, cursor: "pointer" }}>Source quote</summary>
                      <div style={{ fontSize: 11, color: C.text2, background: C.surface2, borderRadius: 6, padding: "6px 10px", marginTop: 4, fontStyle: "italic" }}>
                        &ldquo;{req.sourceQuote}&rdquo;
                        {req.sourceChunk?.sectionTitle && <span style={{ marginLeft: 6, color: C.text3 }}>— {req.sourceChunk.sectionTitle}</span>}
                      </div>
                    </details>
                  )}

                  {/* Amend form */}
                  {isAmending && (
                    <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <textarea
                        value={amendText}
                        onChange={e => setAmendText(e.target.value)}
                        placeholder="Enter amended statement…"
                        rows={2}
                        style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 7, padding: "6px 10px", fontSize: 12, resize: "vertical" as const, background: C.surface }}
                      />
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                        <button onClick={() => handleReqAction(req.id, "amend")} style={{ fontSize: 12, fontWeight: 600, background: "#158a5a", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>Save</button>
                        <button onClick={() => { setAmendingId(null); setAmendText(""); }} style={{ fontSize: 12, background: C.surface2, color: C.text3, border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {!isAmending && req.status !== "confirmed" && req.status !== "rejected" && (
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button onClick={() => handleReqAction(req.id, "confirm")} style={{ fontSize: 11, fontWeight: 600, background: "#e3f3ea", color: "#158a5a", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Confirm</button>
                      <button onClick={() => { setAmendingId(req.id); setAmendText(req.statement); }} style={{ fontSize: 11, fontWeight: 600, background: "#eef0fc", color: C.primary, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Amend</button>
                      <button onClick={() => handleReqAction(req.id, "reject")} style={{ fontSize: 11, fontWeight: 600, background: "#fde8e8", color: "#cf3f3a", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Reject</button>
                    </div>
                  )}
                  {!isAmending && (req.status === "confirmed" || req.status === "rejected") && (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => handleReqAction(req.id, "confirm")} style={{ fontSize: 11, color: C.text3, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}>Reset to Proposed</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ── Status tab ─────────────────────────────────────────────────────────────────

function StatusTab({ project }: { project: any }) {
  const latestStatus = project.statusReports?.[0];
  const [exportingPpt, setExportingPpt] = React.useState(false);

  async function handleExportPpt() {
    setExportingPpt(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/status/export`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "WSR.pptx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "Export failed");
    } finally {
      setExportingPpt(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <StatusQuestionnaire projectId={project.id} />
      </div>
      {latestStatus?.aiSummary && (
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#fff4ed", border: "1px solid #f97316", borderRadius: 10 }}>
            <span style={{ fontSize: 15 }}>📊</span>
            <span style={{ fontSize: 13, color: "#c2410c", fontWeight: 500, flex: 1 }}>Export last report as PowerPoint</span>
            <button
              onClick={handleExportPpt}
              disabled={exportingPpt}
              style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: exportingPpt ? "#9a3412" : "#ea580c", border: "none", borderRadius: 6, padding: "5px 12px", cursor: exportingPpt ? "not-allowed" : "pointer" }}
            >
              {exportingPpt ? "Generating…" : "Export PPT"}
            </button>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 17px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".05em", color: C.text3, textTransform: "uppercase" as const, marginBottom: 10 }}>Last Report</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: C.text2 }}>Health</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: ragColor(project.healthStatus), textTransform: "capitalize" as const }}>{project.healthStatus}</span>
            </div>
            {latestStatus.healthScore?.compositeScore != null && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: C.text2 }}>Score</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: ragColor(project.healthStatus) }}>{Math.round(latestStatus.healthScore.compositeScore)}</span>
              </div>
            )}
            {latestStatus.healthScore?.spi != null && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: C.text2 }}>SPI</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 600, color: C.text2 }}>{latestStatus.healthScore.spi.toFixed(2)}</span>
              </div>
            )}
            {latestStatus.healthScore?.cpi != null && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: C.text2 }}>CPI</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 600, color: C.text2 }}>{latestStatus.healthScore.cpi.toFixed(2)}</span>
              </div>
            )}
            <div style={{ fontSize: 12, color: C.text3, marginTop: 10 }}>
              {new Date(latestStatus.reportDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          </div>
          <div style={{ background: "linear-gradient(160deg,#f4f5ff,#eef0fc)", border: `1px solid ${C.primaryBorder}`, borderRadius: 14, padding: "14px 15px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
              <span style={{ color: C.primary, fontSize: 14 }}>✦</span>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: C.primary, textTransform: "uppercase" as const }}>Last Summary</span>
            </div>
            <p style={{ fontSize: 13, color: "#3a3f52", lineHeight: 1.6, margin: 0 }}>{latestStatus.aiSummary}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cost Tab ───────────────────────────────────────────────────────────────────

const COST_CATEGORIES = ["labor", "materials", "travel", "software", "training", "other"];

// Chart series colours — one per COST_CATEGORIES entry. Keep these two lists in sync:
// a category missing here renders in the fallback grey rather than disappearing.
const COST_CAT_CHART_COLOR: Record<string, string> = {
  labor:     "#006E74",
  materials: "#3b82f6",
  travel:    "#f59e0b",
  software:  "#8b5cf6",
  training:  "#0ea5e9",
  other:     "#9ca3af",
};
const COST_CAT_FALLBACK_COLOR = "#64748b";

function costCatColor(cat: string) {
  return COST_CAT_CHART_COLOR[cat] ?? COST_CAT_FALLBACK_COLOR;
}

/**
 * Categories actually present in `entries`, ordered by COST_CATEGORIES with any
 * unrecognised category appended. Derived from the data — never a hardcoded list —
 * so a category that is not in COST_CATEGORIES (legacy rows, future additions) still
 * renders instead of being silently dropped while remaining counted in the totals.
 */
function presentCostCategories(entries: any[]): string[] {
  const seen = new Set<string>(entries.map((e) => e.category ?? "other"));
  const ordered = COST_CATEGORIES.filter((c) => seen.has(c));
  for (const c of seen) if (!ordered.includes(c)) ordered.push(c);
  return ordered;
}

const COST_CAT_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  labor:     { bg: "#e0f2fe", color: "#0369a1", border: "rgba(3,105,161,.2)" },
  materials: { bg: "#fef9c3", color: "#854d0e", border: "rgba(133,77,14,.2)" },
  travel:    { bg: "#fce7f3", color: "#be185d", border: "rgba(190,24,93,.2)" },
  software:  { bg: "#f3e8ff", color: "#6d28d9", border: "rgba(109,40,217,.2)" },
  training:  { bg: "#ecfdf5", color: "#065f46", border: "rgba(6,95,70,.2)" },
  other:     { bg: "#f1f5f9", color: "#475569", border: "rgba(71,85,105,.2)" },
};

function fmt$(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function CostBurndownChart({ series, currency, budget }: { series: any[]; currency: string; budget?: number | null }) {
  if (!series.length) return null;

  const W = 560; const H = 230; const PAD = { top: 14, right: 16, bottom: 52, left: 68 };
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

  const allVals = series.flatMap((s) => [s.pv, s.ev, s.ac]).filter((v) => v > 0);
  const dataMax = allVals.length ? Math.max(...allVals) : 0;
  const maxV = Math.max(dataMax * 1.1, budget ?? 0) || 1;

  function xOf(i: number) { return PAD.left + (i / Math.max(series.length - 1, 1)) * inner.w; }
  function yOf(v: number) { return PAD.top + inner.h - (v / maxV) * inner.h; }

  function linePath(key: "pv" | "ev" | "ac") {
    return series
      .map((s, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(s[key]).toFixed(1)}`)
      .join(" ");
  }

  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => (maxV * i) / tickCount);
  const xTicks = series.filter((_, i) => i % Math.max(1, Math.floor(series.length / 6)) === 0);

  // EV area fill path
  const evFill = series.map((s, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(s.ev).toFixed(1)}`).join(" ")
    + ` L${xOf(series.length - 1).toFixed(1)},${(PAD.top + inner.h).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + inner.h).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      <defs>
        <linearGradient id="evFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#006E74" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#006E74" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v)} y2={yOf(v)} stroke={C.border} strokeWidth={0.5} />
          <text x={PAD.left - 5} y={yOf(v) + 4} textAnchor="end" fontSize={9} fill={C.text3}>
            {fmt$(v, currency).replace(/\.00$/, "")}
          </text>
        </g>
      ))}
      {xTicks.map((s, i) => {
        const idx = series.indexOf(s);
        return (
          <text key={i} x={xOf(idx)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize={8.5} fill={C.text3}>
            {s.date.slice(5)}
          </text>
        );
      })}
      {(() => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const ti = series.findIndex((s) => s.date >= todayStr);
        if (ti < 0) return null;
        return (
          <>
            <line x1={xOf(ti)} x2={xOf(ti)} y1={PAD.top} y2={H - PAD.bottom} stroke={C.text3} strokeWidth={1} strokeDasharray="3 3" />
            <text x={xOf(ti) + 3} y={PAD.top + 10} fontSize={8} fill={C.text3}>Today</text>
          </>
        );
      })()}
      <path d={evFill} fill="url(#evFill)" />
      <path d={linePath("pv")} fill="none" stroke={C.text3} strokeWidth={1.5} strokeDasharray="5 3" />
      <path d={linePath("ev")} fill="none" stroke="#006E74" strokeWidth={2} />
      <path d={linePath("ac")} fill="none" stroke={C.red} strokeWidth={2} />
      {/* Budget reference line */}
      {budget != null && budget > 0 && (
        <>
          <line x1={PAD.left} x2={W - PAD.right} y1={yOf(budget)} y2={yOf(budget)} stroke={C.primary} strokeWidth={1.5} strokeDasharray="6 3" />
          <text x={W - PAD.right + 2} y={yOf(budget) + 4} fontSize={8} fill={C.primary} textAnchor="start">Budget</text>
        </>
      )}
      {[
        { color: C.text3, label: "PV (Planned)", dash: true },
        { color: "#006E74", label: "EV (Earned)", dash: false },
        { color: C.red, label: "AC (Actual)", dash: false },
        ...(budget != null && budget > 0 ? [{ color: C.primary, label: "Budget", dash: true }] : []),
      ].map((l, i) => (
        <g key={i} transform={`translate(${PAD.left + i * 105}, ${H - 16})`}>
          <line x1={0} x2={16} y1={0} y2={0} stroke={l.color} strokeWidth={2} strokeDasharray={l.dash ? "4 2" : undefined} />
          <text x={20} y={4} fontSize={8.5} fill={C.text2}>{l.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Monthly spend bar chart ────────────────────────────────────────────────────
function CostMonthlyChart({ entries, currency, budget }: { entries: any[]; currency: string; budget?: number | null }) {
  if (!entries.length) return null;

  // Group entries by YYYY-MM, then by category within month
  const CATS = presentCostCategories(entries);

  const monthMap: Record<string, Record<string, number>> = {};
  for (const e of entries) {
    const mo = String(e.date ?? "").slice(0, 7);
    if (!mo) continue;
    if (!monthMap[mo]) monthMap[mo] = {};
    const cat = e.category ?? "other";
    monthMap[mo][cat] = (monthMap[mo][cat] ?? 0) + (Number(e.amount) || 0);
  }
  const months = Object.keys(monthMap).sort();
  if (!months.length) return null;
  const monthTotals = months.map((m) => Object.values(monthMap[m]).reduce((s, v) => s + v, 0));
  const maxVal = Math.max(...monthTotals, 1);

  const W = 560; const H = 230; const PAD = { top: 14, right: 16, bottom: 52, left: 68 };
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };
  const barW = Math.max(8, Math.min(40, (inner.w / months.length) * 0.65));
  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => (maxVal * i) / tickCount);
  function yOf(v: number) { return PAD.top + inner.h - (v / maxVal) * inner.h; }
  function xOf(i: number) { return PAD.left + (i + 0.5) * (inner.w / months.length); }

  // Monthly budget line (budget / number of project months)
  const monthlyBudget = budget && months.length > 0 ? budget / months.length : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {/* Y grid + labels */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v)} y2={yOf(v)} stroke={C.border} strokeWidth={0.5} />
          <text x={PAD.left - 5} y={yOf(v) + 4} textAnchor="end" fontSize={9} fill={C.text3}>
            {fmt$(v, currency).replace(/\.00$/, "")}
          </text>
        </g>
      ))}
      {/* Stacked bars */}
      {months.map((m, i) => {
        let yBase = PAD.top + inner.h;
        const activeCats = CATS.filter((c) => (monthMap[m][c] ?? 0) > 0);
        return (
          <g key={m}>
            {activeCats.map((cat) => {
              const val = monthMap[m][cat] ?? 0;
              const bh = (val / maxVal) * inner.h;
              yBase -= bh;
              return (
                <rect key={cat} x={xOf(i) - barW / 2} y={yBase} width={barW} height={bh}
                  fill={costCatColor(cat)} opacity={0.85} rx={2} />
              );
            })}
            <text x={xOf(i)} y={H - PAD.bottom + 13} textAnchor="middle" fontSize={8.5} fill={C.text3}>
              {m.slice(5)}
            </text>
            <text x={xOf(i)} y={yOf(monthTotals[i]) - 3} textAnchor="middle" fontSize={8} fill={C.text2} fontWeight={600}>
              {monthTotals[i] > 0 ? fmt$(monthTotals[i], currency).replace(/\.00$/, "") : ""}
            </text>
          </g>
        );
      })}
      {/* Avg monthly budget line */}
      {monthlyBudget && (
        <>
          <line x1={PAD.left} x2={W - PAD.right} y1={yOf(monthlyBudget)} y2={yOf(monthlyBudget)}
            stroke={C.primary} strokeWidth={1.5} strokeDasharray="5 3" />
          <text x={W - PAD.right + 2} y={yOf(monthlyBudget) + 4} fontSize={8} fill={C.primary} textAnchor="start">Avg/mo</text>
        </>
      )}
      {/* Legend */}
      {CATS.map((c, i) => (
        <g key={c} transform={`translate(${PAD.left + i * 80}, ${H - 16})`}>
          <rect x={0} y={-6} width={10} height={10} fill={costCatColor(c)} rx={2} />
          <text x={14} y={4} fontSize={8.5} fill={C.text2}>{c.charAt(0).toUpperCase() + c.slice(1)}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Category breakdown view ────────────────────────────────────────────────────
function CostCategoryView({ entries, currency, budget, summary }: { entries: any[]; currency: string; budget?: number | null; summary?: any }) {
  if (!entries.length) return null;

  const CATS = presentCostCategories(entries);
  const total = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const bycat: Record<string, number> = {};
  for (const e of entries) {
    const c = e.category ?? "other";
    bycat[c] = (bycat[c] ?? 0) + (Number(e.amount) || 0);
  }
  const rows = CATS.filter((c) => bycat[c] > 0).map((c) => ({
    cat: c, amount: bycat[c],
    pctSpend: total > 0 ? (bycat[c] / total) * 100 : 0,
    pctBudget: budget && budget > 0 ? (bycat[c] / budget) * 100 : null,
  }));

  const remaining = budget != null ? Math.max(0, budget - total) : null;
  const burntPct = budget && budget > 0 ? Math.min(100, (total / budget) * 100) : null;
  const barColor = burntPct == null ? "#006E74" : burntPct <= 75 ? "#16a34a" : burntPct <= 95 ? "#d97706" : "#dc2626";
  const cpi = summary?.cpi;
  const eac = summary?.eac;
  const etc = summary?.etc;

  return (
    <div style={{ padding: "4px 0" }}>
      {/* Budget progress bar */}
      {budget != null && budget > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: ".05em" }}>Budget Utilisation</span>
            <span style={{ fontSize: 11, color: C.text2 }}>{fmt$(total, currency)} of {fmt$(budget, currency)} ({burntPct?.toFixed(1)}%)</span>
          </div>
          <div style={{ height: 14, background: C.surface2, borderRadius: 7, overflow: "hidden", border: `1px solid ${C.border}` }}>
            <div style={{ height: "100%", width: `${burntPct ?? 0}%`, background: barColor, borderRadius: 7, transition: "width .4s" }} />
          </div>
          {remaining != null && (
            <div style={{ fontSize: 11, color: C.text3, marginTop: 4, textAlign: "right" }}>
              {fmt$(remaining, currency)} remaining
            </div>
          )}
        </div>
      )}

      {/* EVM KPIs row */}
      {(cpi != null || eac != null || etc != null) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            { label: "CPI", value: cpi != null ? cpi.toFixed(2) : "—", good: cpi != null && cpi >= 1, warn: cpi != null && cpi >= 0.9 && cpi < 1 },
            { label: "EAC", value: eac != null ? fmt$(eac, currency) : "—", good: eac != null && budget != null && eac <= budget, warn: false },
            { label: "ETC", value: etc != null ? fmt$(etc, currency) : "—", good: false, warn: false },
          ].map((k) => (
            <div key={k.label} style={{ flex: 1, padding: "7px 10px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7, textAlign: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: k.good ? "#16a34a" : k.warn ? "#d97706" : C.text }}>{k.value}</div>
              <div style={{ fontSize: 10, color: C.text3, marginTop: 2, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: ".04em" }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Category table */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Spend by Category</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.cat}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: costCatColor(r.cat), display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{r.cat.charAt(0).toUpperCase() + r.cat.slice(1)}</span>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 12, color: C.text2 }}>
                <span style={{ fontWeight: 600, color: C.text }}>{fmt$(r.amount, currency)}</span>
                <span style={{ color: C.text3 }}>{r.pctSpend.toFixed(1)}% of spend</span>
                {r.pctBudget != null && <span style={{ color: C.text3 }}>{r.pctBudget.toFixed(1)}% of budget</span>}
              </div>
            </div>
            <div style={{ height: 6, background: C.surface2, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${r.pctSpend}%`, background: costCatColor(r.cat), borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CostTab({ project }: { project: any }) {
  const { openPanel } = useCopilot();

  // ── data ──
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [chartView, setChartView] = useState<"evm" | "monthly" | "breakdown">("evm");

  // ── form ──
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: "", category: "labor", description: "" });
  const [formErr, setFormErr] = useState("");

  // ── table ──
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/projects/${project.id}/costs/burndown`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || isNaN(Number(form.amount))) { setFormErr("Enter a valid amount"); return; }
    setAdding(true); setFormErr("");
    const res = await fetch(`/api/projects/${project.id}/costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: form.date, amount: Number(form.amount), category: form.category, description: form.description }),
    });
    if (res.ok) {
      setForm({ date: new Date().toISOString().slice(0, 10), amount: "", category: "labor", description: "" });
      await load();
    } else {
      setFormErr("Failed to save entry");
    }
    setAdding(false);
  }

  async function handleDelete(entryId: string) {
    setDeleting(entryId);
    await fetch(`/api/projects/${project.id}/costs/${entryId}`, { method: "DELETE" });
    await load();
    setDeleting(null);
  }

  const s = data?.summary;
  const currency = s?.currency ?? project.currency ?? "USD";
  const cpiColor = !s || s.cpi == null ? C.text3 : s.cpi >= 1 ? C.green : s.cpi >= 0.9 ? C.amber : C.red;
  const spiColor2 = !s || s.spi == null ? C.text3 : s.spi >= 1 ? C.green : s.spi >= 0.9 ? C.amber : C.red;

  const TEAL = "#006E74";
  const TEAL_BG = "rgba(0,110,116,.07)";
  const TEAL_BORDER = "rgba(0,110,116,.2)";

  const filteredEntries = useMemo(() => {
    const entries: any[] = data?.entries ? [...data.entries].reverse() : [];
    return entries.filter((e) => {
      const matchCat = catFilter === "all" || e.category === catFilter;
      const matchSearch = !search || e.description?.toLowerCase().includes(search.toLowerCase()) || e.category.includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [data, search, catFilter]);

  const totalLogged = data?.entries?.reduce((acc: number, e: any) => acc + e.amount, 0) ?? 0;

  const QUICK_ACTIONS = [
    { icon: "📋", label: "Log an entry", msg: "I need to log a cost entry. Can you help me?" },
    { icon: "🗑", label: "Delete an entry", msg: "Please help me delete a cost entry." },
    { icon: "🔮", label: "Run EAC forecast", msg: "Run a detailed EAC and ETC forecast for this project based on current CPI." },
    { icon: "📊", label: "Summarise by category", msg: "Summarise the total spend broken down by category." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* ── KPI strip ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {(() => {
            const totalBudget = project.budget ?? null;
            const burnt = totalLogged;
            const burntPct = totalBudget && totalBudget > 0 ? Math.round((burnt / totalBudget) * 100) : null;
            const pctColor = burntPct == null ? C.text2 : burntPct <= 80 ? C.green : burntPct <= 100 ? C.amber : C.red;
            const pctBg    = burntPct == null ? C.surface2 : burntPct <= 80 ? C.greenLight : burntPct <= 100 ? C.amberLight : C.redLight;
            return [
              { label: "Total Budget",  value: totalBudget != null ? fmt$(totalBudget, currency) : "—", sub: "Original budget + approved CRs", color: C.primary, bg: C.primaryLight },
              { label: "Budget Burnt",  value: fmt$(burnt, currency),  sub: "Sum of all cost entries logged",          color: C.text,   bg: C.surface2 },
              { label: "Burnt %",       value: burntPct != null ? `${burntPct}%` : "—",            sub: burntPct != null ? (burntPct <= 100 ? "Within budget" : "Over budget") : "Log costs to calculate", color: pctColor, bg: pctBg },
            ];
          })().map((k) => (
            <div key={k.label} style={{ background: k.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.color, lineHeight: 1.1 }}>{loading ? "…" : k.value}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: C.text3, marginTop: 3, letterSpacing: ".04em" }}>{k.label}</div>
              <div style={{ fontSize: 10, color: C.text3, marginTop: 1 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Top split: form | chart ── */}
        <div style={{ display: "grid", gridTemplateColumns: "272px 1fr", gap: 14, alignItems: "start" }}>

          {/* ── Log Cost Entry form ── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 13.5, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: TEAL }}>＋</span> Log Cost Entry
            </div>
            <div style={{ padding: 14 }}>
              <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 500, color: C.text3, display: "block", marginBottom: 3 }}>Date</label>
                    <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text, boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 500, color: C.text3, display: "block", marginBottom: 3 }}>Amount ({currency})</label>
                    <input type="number" step="0.01" min="0" placeholder="0.00" value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text, boxSizing: "border-box" as const }} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 500, color: C.text3, display: "block", marginBottom: 3 }}>Category</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text, boxSizing: "border-box" as const }}>
                    {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 500, color: C.text3, display: "block", marginBottom: 3 }}>Description (optional)</label>
                  <input type="text" placeholder="e.g. Sprint 3 dev hours" value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 13, background: C.surface2, color: C.text, boxSizing: "border-box" as const }} />
                </div>
                {formErr && <div style={{ fontSize: 12, color: C.red }}>{formErr}</div>}
                <button type="submit" disabled={adding}
                  style={{ padding: "8px 0", background: TEAL, color: "#fff", border: "none", borderRadius: 7, fontSize: 13.5, fontWeight: 600, cursor: adding ? "not-allowed" : "pointer", opacity: adding ? 0.7 : 1, marginTop: 2 }}>
                  {adding ? "Saving…" : "+ Add Entry"}
                </button>
              </form>

            </div>
          </div>

          {/* ── Chart ── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
              {/* View toggle pills */}
              <div style={{ display: "flex", gap: 4 }}>
                {(["evm", "monthly", "breakdown"] as const).map((v) => {
                  const labels: Record<string, string> = { evm: "EVM Lines", monthly: "Monthly Bars", breakdown: "Breakdown" };
                  const active = chartView === v;
                  return (
                    <button key={v} onClick={() => setChartView(v)}
                      style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 20, border: `1px solid ${active ? TEAL_BORDER : C.border}`, background: active ? TEAL_BG : "transparent", color: active ? TEAL : C.text2, cursor: "pointer", fontWeight: active ? 700 : 500 }}>
                      {labels[v]}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 5, flexWrap: "wrap" as const }}>
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => openPanel(qa.msg)}
                    style={{ fontSize: 12, padding: "3px 9px", borderRadius: 6, border: `1px solid ${TEAL_BORDER}`, background: TEAL_BG, color: TEAL, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" as const }}
                  >
                    {qa.icon} {qa.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: "14px 16px 10px" }}>
              {loading ? (
                <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: C.text3, fontSize: 13 }}>Loading…</div>
              ) : chartView === "evm" ? (
                data?.series?.length
                  ? <CostBurndownChart series={data.series} currency={currency} budget={project.budget ?? null} />
                  : <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: C.text3, fontSize: 13 }}>No cost data yet. Add entries to see the burndown.</div>
              ) : chartView === "monthly" ? (
                data?.entries?.length
                  ? <CostMonthlyChart entries={data.entries} currency={currency} budget={project.budget ?? null} />
                  : <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: C.text3, fontSize: 13 }}>No cost entries yet.</div>
              ) : (
                data?.entries?.length
                  ? <CostCategoryView entries={data.entries} currency={currency} budget={project.budget ?? null} summary={data.summary} />
                  : <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: C.text3, fontSize: 13 }}>No cost entries yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Cost Entries Table ── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          {/* table toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Cost Entries</span>
            {data?.entries?.length > 0 && (
              <span style={{ fontSize: 12, color: C.text3 }}>{data.entries.length} records · Total {fmt$(totalLogged, currency)}</span>
            )}
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginLeft: "auto", padding: "5px 9px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.surface2, color: C.text, outline: "none", width: 160 }}
            />
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              style={{ padding: "5px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, background: C.surface2, color: C.text2, outline: "none" }}
            >
              <option value="all">All categories</option>
              {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>

          {loading ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: C.text3, fontSize: 13 }}>Loading…</div>
          ) : !filteredEntries.length ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: C.text3, fontSize: 13 }}>
              {data?.entries?.length ? "No entries match your filter." : "No cost entries yet. Add your first entry above."}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.surface2 }}>
                  {["Date", "Category", "Description", "Amount", ""].map((h) => (
                    <th key={h} style={{ textAlign: h === "Amount" ? "right" : "left", padding: "7px 12px", fontSize: 11, fontWeight: 600, color: C.text3, letterSpacing: ".04em", textTransform: "uppercase" as const, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((e: any) => {
                  const cat = COST_CAT_STYLE[e.category] ?? COST_CAT_STYLE.other;
                  return (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}` }}
                      onMouseEnter={(ev) => (ev.currentTarget.style.background = C.surface2)}
                      onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: C.text3, whiteSpace: "nowrap" as const }}>{e.date}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: cat.bg, color: cat.color, border: `1px solid ${cat.border}` }}>
                          {e.category}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 12.5, color: C.text2, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{e.description || "—"}</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, color: C.text, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt$(e.amount, currency)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        <button
                          onClick={() => handleDelete(e.id)}
                          disabled={deleting === e.id}
                          title="Delete entry"
                          style={{ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", fontSize: 12, color: C.text3, transition: "all .15s" }}
                          onMouseEnter={(ev) => { ev.currentTarget.style.background = C.redLight; ev.currentTarget.style.borderColor = C.red; ev.currentTarget.style.color = C.red; }}
                          onMouseLeave={(ev) => { ev.currentTarget.style.background = "none"; ev.currentTarget.style.borderColor = C.border; ev.currentTarget.style.color = C.text3; }}
                        >
                          {deleting === e.id ? "…" : "✕"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: C.surface2, borderTop: `1px solid ${C.border}` }}>
                  <td colSpan={3} style={{ padding: "7px 12px", fontSize: 12, color: C.text3 }}>
                    {filteredEntries.length} of {data?.entries?.length ?? 0} entries
                  </td>
                  <td style={{ padding: "7px 12px", fontSize: 13, fontWeight: 700, color: C.text, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmt$(filteredEntries.reduce((acc: number, e: any) => acc + e.amount, 0), currency)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

    </div>
  );
}

// ── Baseline tab ───────────────────────────────────────────────────────────────

function BaselineTab({ project }: { project: any }) {
  const projectId = project.id;

  // Artifact versions available for comparison
  const [versions, setVersions] = useState<any[]>([]);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [activeComparison, setActiveComparison] = useState<{
    leftVersionId: string; rightVersionId: string; artifactType: string; runId: string | null;
  } | null>(null);

  // Load all artifact versions for this project
  useEffect(() => {
    fetch(`/api/projects/${projectId}/artifact-versions`)
      .then(r => r.ok ? r.json() : [])
      .then(setVersions)
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function detectType(id: string) {
    return versions.find((x: any) => x.id === id)?.artifactType ?? "";
  }

  function handleRun() {
    if (!leftId || !rightId || leftId === rightId) return;
    const artifactType = detectType(leftId) || detectType(rightId);
    setActiveComparison({ leftVersionId: leftId, rightVersionId: rightId, artifactType, runId: null });
  }

  function handleRunComplete(runId: string) {
    setActiveComparison(prev => prev ? { ...prev, runId } : null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* GR-BL-07 verification strip */}
      <BaselineVerifyPanel projectId={projectId} />

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" }}>

        {/* Left column: PMB Snapshots */}
        <PmbSnapshotPanel projectId={projectId} />

        {/* Right column: comparison workflow */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Version picker */}
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: C.text }}>
              Run Comparison
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4, fontWeight: 600 }}>BASELINE (LEFT)</div>
                <select
                  value={leftId}
                  onChange={e => setLeftId(e.target.value)}
                  style={{
                    width: "100%", padding: "7px 10px", border: `1px solid ${C.border}`,
                    borderRadius: 7, fontSize: 13, color: C.text, background: C.surface,
                  }}
                >
                  <option value="">Select version…</option>
                  {versions.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.artifact?.artifactType ?? v.artifactType} — v{v.versionNumber} ({v.approvalStatus ?? "draft"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4, fontWeight: 600 }}>CURRENT (RIGHT)</div>
                <select
                  value={rightId}
                  onChange={e => setRightId(e.target.value)}
                  style={{
                    width: "100%", padding: "7px 10px", border: `1px solid ${C.border}`,
                    borderRadius: 7, fontSize: 13, color: C.text, background: C.surface,
                  }}
                >
                  <option value="">Select version…</option>
                  {versions.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.artifact?.artifactType ?? v.artifactType} — v{v.versionNumber} ({v.approvalStatus ?? "draft"})
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleRun}
                disabled={!leftId || !rightId || leftId === rightId}
                style={{
                  padding: "7px 18px", background: C.primary, color: "#fff",
                  border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600,
                  cursor: leftId && rightId && leftId !== rightId ? "pointer" : "not-allowed",
                  opacity: leftId && rightId && leftId !== rightId ? 1 : 0.5,
                }}
              >
                Compare
              </button>
            </div>
          </div>

          {/* Comparison results */}
          {activeComparison && (
            <>
              <ComparisonView
                projectId={projectId}
                leftVersionId={activeComparison.leftVersionId}
                rightVersionId={activeComparison.rightVersionId}
                artifactType={activeComparison.artifactType}
                autoRun
                onRunComplete={handleRunComplete}
              />
              {activeComparison.runId && (
                <>
                  <ImpactReportPanel
                    projectId={projectId}
                    runId={activeComparison.runId}
                  />
                  <BaselineSummaryCard
                    projectId={projectId}
                    runId={activeComparison.runId}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Agile Overview tab ─────────────────────────────────────────────────────────

function computeAgileScore(params: {
  completionRate: number | null;   // acceptedPoints / committedPoints, 0-1
  burnPct: number | null;          // actual / budget %, 0-∞
  openImpediments: number;
  openRisks: number;
}): number {
  const { completionRate, burnPct, openImpediments, openRisks } = params;

  let sprintScore = 25; // neutral when no sprints completed
  if (completionRate !== null) {
    if (completionRate >= 0.9)      sprintScore = 35;
    else if (completionRate >= 0.75) sprintScore = 27;
    else if (completionRate >= 0.6)  sprintScore = 18;
    else if (completionRate >= 0.4)  sprintScore = 10;
    else                             sprintScore = 3;
  }

  let budgetScore = 22; // neutral when no budget set
  if (burnPct !== null) {
    if (burnPct <= 80)       budgetScore = 30;
    else if (burnPct <= 90)  budgetScore = 24;
    else if (burnPct <= 100) budgetScore = 15;
    else if (burnPct <= 110) budgetScore = 7;
    else                     budgetScore = 0;
  }

  let impedScore: number;
  if (openImpediments === 0)      impedScore = 20;
  else if (openImpediments <= 2)  impedScore = 15;
  else if (openImpediments <= 5)  impedScore = 8;
  else                            impedScore = 0;

  let riskScore: number;
  if (openRisks === 0)      riskScore = 15;
  else if (openRisks <= 2)  riskScore = 11;
  else if (openRisks <= 5)  riskScore = 6;
  else                      riskScore = 2;

  return Math.round(Math.min(100, Math.max(0, sprintScore + budgetScore + impedScore + riskScore)));
}

function AgileOverviewTab({ project }: { project: any }) {
  const reports = (project.statusReports ?? []) as any[];
  const latest  = reports[0] ?? null;
  const storedHs = latest?.healthScore ?? null;

  const [sprints,      setSprints]      = React.useState<any[]>([]);
  const [impediments,  setImpediments]  = React.useState<any[]>([]);
  const [commercial,   setCommercial]   = React.useState<any>(null);
  const [backlogCount, setBacklogCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    fetch(`/api/projects/${project.id}/sprints`)
      .then(r => r.ok ? r.json() : []).then(setSprints).catch(() => {});
    fetch(`/api/projects/${project.id}/impediments`)
      .then(r => r.ok ? r.json() : []).then(setImpediments).catch(() => {});
    fetch(`/api/projects/${project.id}/commercial`)
      .then(r => r.ok ? r.json() : null).then(setCommercial).catch(() => {});
    fetch(`/api/projects/${project.id}/backlog`)
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => setBacklogCount(Array.isArray(d) ? d.length : 0))
      .catch(() => setBacklogCount(0));
  }, [project.id]);

  const risks  = (project.risks  ?? []) as any[];
  const issues = (project.issues ?? []) as any[];

  // Derive velocity from last 2 completed sprints
  const completedSprints = sprints
    .filter((s: any) => s.state === "closed")
    .sort((a: any, b: any) => b.sprintNumber - a.sprintNumber);
  const recentSprints = completedSprints.slice(0, 2);
  const avgVelocity = recentSprints.length > 0
    ? Math.round(recentSprints.reduce((s: number, sp: any) => s + (sp.acceptedPoints ?? 0), 0) / recentSprints.length)
    : null;
  const avgCompletionRate = recentSprints.length > 0
    ? recentSprints.reduce((s: number, sp: any) => {
        const committed = sp.committedPoints ?? sp.plannedCapacityPoints ?? 0;
        return committed > 0 ? s + (sp.acceptedPoints ?? 0) / committed : s;
      }, 0) / recentSprints.filter((sp: any) => (sp.committedPoints ?? sp.plannedCapacityPoints ?? 0) > 0).length
    : null;

  const activeSprint = sprints.find((s: any) => s.state === "active") ?? null;
  const activeCommitted = activeSprint?.committedPoints ?? activeSprint?.plannedCapacityPoints ?? 0;
  const activeAccepted  = activeSprint?.acceptedPoints ?? 0;
  const activeCompletePct = activeCommitted > 0 ? Math.round((activeAccepted / activeCommitted) * 100) : null;

  const bac    = (project.budget as number | null) ?? commercial?.project?.budget ?? 0;
  const actual = commercial?.totalActual ?? 0;
  const currency = (project.currency as string | null) ?? commercial?.project?.currency ?? "USD";
  const burnPct = bac > 0 ? (actual / bac) * 100 : null;
  const burnPctRound = burnPct !== null ? Math.round(burnPct) : null;

  const openImpediments = impediments.filter((i: any) => i.status !== "resolved").length;
  const openRisks = risks.length;
  const highRisks = risks.filter((r: any) => ["high", "very_high"].includes(r.probability ?? "")).length;
  const critIssues = issues.filter((i: any) => ["critical", "high"].includes(i.severity ?? "")).length;

  const liveScore = computeAgileScore({
    completionRate: avgCompletionRate,
    burnPct: burnPctRound,
    openImpediments,
    openRisks,
  });

  const compositeScore: number | null = storedHs?.compositeScore ?? null;
  const displayScore = compositeScore ?? liveScore;

  const healthRag = project.healthStatus ?? "green";
  const scoreC = displayScore < 50 ? C.red : displayScore < 70 ? C.amber : C.green;

  const trendData = ([...reports] as any[]).reverse().map((r: any) => ({
    label: r.reportDate ? new Date(r.reportDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "?",
    score: (r.healthScore?.compositeScore ?? null) as number | null,
  })).filter(d => d.score !== null);

  const velocityChartData = completedSprints.slice(0, 6).reverse().map((s: any) => ({
    label: `S${s.sprintNumber}`,
    velocity: s.acceptedPoints ?? 0,
    committed: s.committedPoints ?? s.plannedCapacityPoints ?? 0,
  }));

  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", ...style }}>
      {children}
    </div>
  );

  const chip = (label: string, value: string | number | null, sub: string, valueColor: string) => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 14px" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: valueColor, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{value ?? "—"}</div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".06em", marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: C.text3, marginTop: 2, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Row 1 — Health · Velocity · Budget Burn */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>

        {card(<>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: ".05em" }}>Health Score</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: ragBg(healthRag), color: ragColor(healthRag) }}>
              {healthRag === "green" ? "On Track" : healthRag === "amber" ? "At Risk" : "Critical"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: scoreC, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{displayScore}</span>
            <span style={{ fontSize: 14, color: C.text3 }}>/ 100</span>
          </div>
          <div style={{ height: 6, background: "#edf0f3", borderRadius: 99, marginBottom: 7 }}>
            <div style={{ height: "100%", width: `${displayScore}%`, background: scoreC, borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 11, color: C.text3 }}>
            {latest?.reportDate
              ? `Last report: ${new Date(latest.reportDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}`
              : "Live score — submit a status report to persist"}
          </div>
          <div style={{ marginTop: 8, padding: "6px 8px", background: C.surface2, borderRadius: 6, fontSize: 10, color: C.text3, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600 }}>How it&apos;s scored: </span>
            Sprint completion <span style={{ fontWeight: 600 }}>35 pts</span> · Budget burn <span style={{ fontWeight: 600 }}>30 pts</span> · Open impediments <span style={{ fontWeight: 600 }}>20 pts</span> · Open risks <span style={{ fontWeight: 600 }}>15 pts</span>. Avg of last 2 completed sprints.
          </div>
        </>)}

        {card(<>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>Sprint Velocity</div>
          <div style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginBottom: 4, color: avgVelocity === null ? C.text3 : C.primary }}>
            {avgVelocity ?? "—"}
          </div>
          <div style={{ fontSize: 10.5, color: C.text3 }}>Avg pts · last {recentSprints.length || "—"} sprint{recentSprints.length !== 1 ? "s" : ""}</div>
          {avgCompletionRate !== null && (
            <div style={{ fontSize: 11, marginTop: 6, color: avgCompletionRate >= 0.9 ? C.green : avgCompletionRate >= 0.7 ? C.amber : C.red }}>
              {Math.round(avgCompletionRate * 100)}% committed pts delivered
            </div>
          )}
          {avgVelocity === null && (
            <div style={{ fontSize: 11, marginTop: 6, color: C.text3 }}>Complete a sprint to see velocity</div>
          )}
        </>)}

        {card(<>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>Budget Burn</div>
          <div style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginBottom: 4,
            color: burnPctRound === null ? C.text3 : burnPctRound > 100 ? C.red : burnPctRound > 85 ? C.amber : C.green }}>
            {burnPctRound !== null ? `${burnPctRound}%` : "—"}
          </div>
          <div style={{ fontSize: 10.5, color: C.text3 }}>
            {bac > 0 ? `${formatCurrency(actual, currency)} of ${formatCurrency(bac, currency)}` : "Set budget in Project Info"}
          </div>
          {burnPctRound !== null && (
            <div style={{ marginTop: 8, height: 5, background: "#edf0f3", borderRadius: 99 }}>
              <div style={{ height: "100%", width: `${Math.min(100, burnPctRound)}%`, borderRadius: 99,
                background: burnPctRound > 100 ? C.red : burnPctRound > 85 ? C.amber : C.green }} />
            </div>
          )}
        </>)}
      </div>

      {/* Row 2 — KPI chips */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10 }}>
        {chip("Active Sprint",
          activeSprint ? `S${activeSprint.sprintNumber}` : "None",
          activeSprint ? `Ends ${new Date(activeSprint.endDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : "No active sprint",
          activeSprint ? C.primary : C.text3)}
        {chip("Sprint Goal",
          activeCompletePct !== null ? `${activeCompletePct}%` : "—",
          activeCommitted > 0 ? `${activeAccepted}/${activeCommitted} pts accepted` : "No committed pts",
          activeCompletePct !== null && activeCompletePct >= 80 ? C.green : activeCompletePct !== null ? C.amber : C.text3)}
        {chip("Velocity",
          avgVelocity !== null ? `${avgVelocity} pts` : "—",
          recentSprints.length > 0 ? `avg last ${recentSprints.length} sprint${recentSprints.length !== 1 ? "s" : ""}` : "No completed sprints",
          C.primary)}
        {chip("Impediments",
          openImpediments,
          openImpediments === 0 ? "None open" : `${openImpediments} open`,
          openImpediments > 3 ? C.red : openImpediments > 0 ? C.amber : C.green)}
        {chip("Open Risks",
          openRisks,
          `${highRisks} high priority`,
          openRisks > 5 ? C.red : openRisks > 2 ? C.amber : C.green)}
        {chip("Open Issues",
          issues.length,
          `${critIssues} critical / high`,
          issues.length > 3 ? C.red : issues.length > 1 ? C.amber : C.green)}
        {chip("Backlog",
          backlogCount ?? "…",
          backlogCount === 0 ? "Empty backlog" : "Total items",
          C.primary)}
      </div>

      {/* Row 3 — Health trend · Sprint velocity chart */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {card(<>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Health Trend</div>
              <div style={{ fontSize: 11, color: C.text3 }}>{trendData.length} status report{trendData.length !== 1 ? "s" : ""}</div>
            </div>
            <span style={{ fontSize: 22, fontWeight: 700, color: scoreC }}>{displayScore}</span>
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.text3 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.text3 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}`, boxShadow: "0 4px 12px rgba(0,0,0,.08)" }} />
                <ReferenceLine y={75} stroke={C.green} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="score" stroke={C.primary} strokeWidth={2.5} dot={{ r: 3, fill: C.primary }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: C.text3, fontSize: 13 }}>
              Submit status reports to see the trend
            </div>
          )}
        </>)}

        {card(<>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 3 }}>Sprint Velocity</div>
          <div style={{ fontSize: 11, color: C.text3, marginBottom: 10 }}>Committed vs Accepted story points per sprint</div>
          {velocityChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={velocityChartData} margin={{ top: 0, right: 0, bottom: 0, left: -30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text2 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.text3 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
                <Bar dataKey="committed" name="Committed" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
                <Bar dataKey="velocity"  name="Accepted"  fill={C.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: C.text3, fontSize: 13 }}>
              Complete sprints to see velocity history
            </div>
          )}
        </>)}
      </div>

      {/* Row 4 — Active sprint strip */}
      {activeSprint && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Zap size={14} color={C.primary} />
            <span style={{ fontSize: 12, color: C.text3 }}>Active sprint:</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1 }}>
              S{activeSprint.sprintNumber}{activeSprint.label ? ` — ${activeSprint.label}` : ""}{activeSprint.goal ? ` · ${activeSprint.goal}` : ""}
            </span>
            {activeCompletePct !== null && (
              <span style={{ fontSize: 12, fontWeight: 700, color: activeCompletePct >= 80 ? C.green : C.amber }}>
                {activeCompletePct}% complete
              </span>
            )}
            <span style={{ fontSize: 11, color: C.text3 }}>
              Ends {new Date(activeSprint.endDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </span>
          </div>
          {activeCommitted > 0 && (
            <div style={{ marginTop: 8, height: 5, background: "#edf0f3", borderRadius: 99 }}>
              <div style={{ height: "100%", width: `${Math.min(100, activeCompletePct ?? 0)}%`, borderRadius: 99,
                background: (activeCompletePct ?? 0) >= 80 ? C.green : C.amber, transition: "width .4s" }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Overview tab ───────────────────────────────────────────────────────────────

function OverviewTab({ project }: { project: any }) {
  const reports = (project.statusReports ?? []) as any[];
  const latest = reports[0] ?? null;
  const hs = latest?.healthScore ?? null;

  const compositeScore: number | null = hs?.compositeScore ?? null;
  const bac: number | null = project.budget ?? null;

  // Fetch live EVM from both sources:
  // - schedule route: hours-based CPI/SPI (EV_hrs ÷ AC_hrs) — primary for CPI, consistent with Schedule tab
  // - burndown route: dollar-based AC/EAC/budget metrics
  const [liveEvm, setLiveEvm] = React.useState<any>(null);
  const [liveKpi, setLiveKpi] = React.useState<any>(null);
  React.useEffect(() => {
    fetch(`/api/projects/${project.id}/costs/burndown`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setLiveEvm(d.summary))
      .catch(() => {});
    fetch(`/api/projects/${project.id}/schedule`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setLiveKpi(d.kpi ?? null))
      .catch(() => {});
  }, [project.id]);

  // CPI/SPI: hours-based from schedule route (matches Schedule tab display)
  // Dollar-based AC/EAC from burndown route for budget metrics
  const cpi: number | null = liveKpi?.cpi ?? liveEvm?.cpi ?? hs?.cpi ?? null;
  const spi: number | null = liveKpi?.spi ?? liveEvm?.spi ?? hs?.spi ?? null;
  const ev: number | null = liveEvm?.totalEV ?? hs?.ev ?? null;
  const ac: number | null = liveEvm?.totalAC ?? hs?.ac ?? null;
  const pv: number | null = liveEvm?.pvNow ?? hs?.pv ?? null;
  const eac: number | null = liveEvm?.eac ?? hs?.eac ?? null;

  const risks = (project.risks ?? []) as any[];
  const issues = (project.issues ?? []) as any[];

  const trendData = ([...reports] as any[]).reverse().map((r: any) => ({
    label: r.reportDate ? new Date(r.reportDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "?",
    score: (r.healthScore?.compositeScore ?? null) as number | null,
  })).filter(d => d.score !== null);

  const evmData = ([
    { name: "PV", value: pv, fill: "#003C51" },
    { name: "EV", value: ev, fill: C.green },
    { name: "AC", value: ac, fill: C.red },
  ] as { name: string; value: number | null; fill: string }[]).filter(d => d.value !== null).map(d => ({
    name: d.name, value: Math.round((d.value as number) / 1000), fill: d.fill,
  }));

  const healthRag = project.healthStatus ?? "green";
  const scoreC = compositeScore === null ? C.text3 : compositeScore < 50 ? C.red : compositeScore < 70 ? C.amber : C.green;
  const fmt2 = (v: number | null) => v === null ? "—" : v.toFixed(2);
  const fmtK = (v: number | null) => v === null ? "—" : `$${Math.round(v / 1000)}K`;
  const budgetPct = bac && ac && ac > 0 ? Math.round((ac / bac) * 100) : null;
  // Schedule %: weighted task completion from schedule route, fallback to 0/100-rule from burndown
  const evPct = liveKpi?.completionPct != null ? liveKpi.completionPct
    : liveEvm?.schedCompletionPct != null ? liveEvm.schedCompletionPct
    : (bac && bac > 0 && ev != null && ev >= 0 ? Math.min(100, Math.round((ev / bac) * 100))
    : pv && ev ? Math.min(100, Math.round((ev / pv) * 100)) : null);
  const highRisks = risks.filter((r: any) => ["high", "very_high"].includes(r.probability ?? "")).length;
  const critIssues = issues.filter((i: any) => ["critical", "high"].includes(i.severity ?? "")).length;

  const allMilestones = (project.milestones ?? []) as any[];
  const completedMsCount = allMilestones.filter((m: any) => (m.status ?? "").toLowerCase().match(/complet|done/)).length;
  const pendingMsCount = allMilestones.length - completedMsCount;
  const overdueMsCount = allMilestones.filter((m: any) => !(m.status ?? "").toLowerCase().match(/complet|done/) && m.dueDate && new Date(m.dueDate) < new Date()).length;
  const msCompletionPct = allMilestones.length > 0 ? Math.round((completedMsCount / allMilestones.length) * 100) : null;

  const nextMs = allMilestones
    .filter((m: any) => !(m.status ?? "").toLowerCase().match(/complet|done/) && m.dueDate && new Date(m.dueDate) > new Date())
    .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0] ?? null;
  const daysToMs = nextMs ? Math.ceil((new Date(nextMs.dueDate).getTime() - Date.now()) / 86400000) : null;

  const [assumptionsCount, setAssumptionsCount] = React.useState<number | null>(null);
  const [openDepsCount, setOpenDepsCount] = React.useState<number | null>(null);
  React.useEffect(() => {
    fetch(`/api/projects/${project.id}/assumptions`)
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => setAssumptionsCount(Array.isArray(d) ? d.length : 0))
      .catch(() => setAssumptionsCount(0));
    fetch(`/api/projects/${project.id}/dependencies`)
      .then(r => r.ok ? r.json() : [])
      .then((d: any[]) => setOpenDepsCount(Array.isArray(d) ? d.filter((x: any) => (x.status ?? "open") === "open").length : 0))
      .catch(() => setOpenDepsCount(0));
  }, [project.id]);

  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", ...style }}>
      {children}
    </div>
  );

  const chip = (label: string, value: string | number | null, sub: string, valueColor: string) => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 14px" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: valueColor, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{value ?? "—"}</div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".06em", marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: C.text3, marginTop: 2, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Row 1 — KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
        {card(<>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: ".05em" }}>Health Score</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: ragBg(healthRag), color: ragColor(healthRag) }}>
              {healthRag === "green" ? "On Track" : healthRag === "amber" ? "At Risk" : "Critical"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: scoreC, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {compositeScore ?? "—"}
            </span>
            <span style={{ fontSize: 14, color: C.text3 }}>/ 100</span>
          </div>
          <div style={{ height: 6, background: "#edf0f3", borderRadius: 99, marginBottom: 7 }}>
            <div style={{ height: "100%", width: `${compositeScore ?? 0}%`, background: scoreC, borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 11, color: C.text3 }}>
            {latest?.reportDate ? `Last report: ${new Date(latest.reportDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}` : "No status report submitted yet"}
          </div>
          <div style={{ marginTop: 8, padding: "6px 8px", background: C.surface2, borderRadius: 6, fontSize: 10, color: C.text3, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600, letterSpacing: ".03em" }}>How it&apos;s scored: </span>
            Schedule / SPI <span style={{ fontWeight: 600 }}>35 pts</span> · Cost / CPI <span style={{ fontWeight: 600 }}>30 pts</span> · Overdue tasks <span style={{ fontWeight: 600 }}>20 pts</span> · Open risks <span style={{ fontWeight: 600 }}>15 pts</span>. Recalculated each time a status report is submitted.
          </div>
        </>)}

        {card(<>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>Schedule Perf.</div>
          <div style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginBottom: 4, color: spi === null ? C.text3 : spi < 0.85 ? C.red : spi < 0.95 ? C.amber : C.green }}>
            {fmt2(spi)}
          </div>
          <div style={{ fontSize: 10.5, color: C.text3 }}>SPI · EV ÷ PV</div>
          <div style={{ fontSize: 11, marginTop: 6, color: spi === null ? C.text3 : spi < 0.85 ? C.red : spi < 0.95 ? C.amber : C.green }}>
            {spi === null ? "No EVM data" : spi < 0.85 ? "⚠ Behind schedule" : spi < 0.95 ? "⚠ Slightly behind" : "✓ On track"}
          </div>
        </>)}

        {card(<>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>Cost Perf.</div>
          <div style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginBottom: 4, color: cpi === null ? C.text3 : cpi < 0.85 ? C.red : cpi < 0.95 ? C.amber : C.green }}>
            {fmt2(cpi)}
          </div>
          <div style={{ fontSize: 10.5, color: C.text3 }}>CPI · EV ÷ AC</div>
          <div style={{ fontSize: 11, marginTop: 6, color: cpi === null ? C.text3 : cpi < 0.85 ? C.red : cpi < 0.95 ? C.amber : C.green }}>
            {cpi === null ? "No EVM data" : cpi < 0.85 ? "⚠ Cost overrun" : cpi < 0.95 ? "⚠ Watch costs" : "✓ Within budget"}
          </div>
        </>)}
      </div>

      {/* Row 2 — metric chips */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10 }}>
        {chip("Schedule %",
          evPct !== null ? `${evPct}%` : msCompletionPct !== null ? `${msCompletionPct}%` : null,
          evPct !== null ? (evPct >= 90 ? "On track" : evPct >= 80 ? "Slightly behind" : "Behind schedule") : msCompletionPct !== null ? "Milestone completion" : "No data",
          evPct !== null && evPct < 80 ? C.amber : msCompletionPct !== null && msCompletionPct < 50 ? C.amber : C.primary)}
        {chip("Budget Used",
          budgetPct !== null ? `${budgetPct}%` : bac !== null ? fmtK(bac) : null,
          budgetPct !== null ? `${fmtK(ac)} of ${fmtK(bac)} (AC)` : bac !== null ? "Log costs in Cost tab to track" : "Set budget in Project Info",
          budgetPct !== null && budgetPct > 80 ? C.amber : C.primary)}
        {chip("EAC Forecast", fmtK(eac), bac && eac ? (eac > bac ? `+${fmtK(eac - bac)} over BAC` : "Within budget") : "No forecast", eac !== null && bac !== null && eac > bac ? C.red : C.primary)}
        {chip("Open Risks", risks.length, `${highRisks} high priority`, risks.length > 5 ? C.red : risks.length > 2 ? C.amber : C.green)}
        {chip("Open Issues", issues.length, `${critIssues} critical / high`, issues.length > 3 ? C.red : issues.length > 1 ? C.amber : C.green)}
        {chip("Assumptions", assumptionsCount ?? "…", assumptionsCount === 0 ? "None logged" : "Project assumptions", C.primary)}
        {chip("Open Deps", openDepsCount ?? "…", openDepsCount === 0 ? "None open" : openDepsCount === 1 ? "1 dependency open" : `${openDepsCount} dependencies open`, (openDepsCount ?? 0) > 3 ? C.red : (openDepsCount ?? 0) > 0 ? C.amber : C.green)}
      </div>

      {/* Row 3 — health trend + risks list */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 12 }}>
        {card(<>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Health Trend</div>
              <div style={{ fontSize: 11, color: C.text3 }}>{trendData.length} weekly reports</div>
            </div>
            {compositeScore !== null && <span style={{ fontSize: 22, fontWeight: 700, color: scoreC }}>{compositeScore}</span>}
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.text3 }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.text3 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}`, boxShadow: "0 4px 12px rgba(0,0,0,.08)" }} />
                <ReferenceLine y={75} stroke={C.green} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="score" stroke={C.primary} strokeWidth={2.5} dot={{ r: 3, fill: C.primary }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 140, display: "flex", alignItems: "center", justifyContent: "center", color: C.text3, fontSize: 13 }}>
              No health trend data — submit status reports to see the trend
            </div>
          )}
        </>)}

        {card(<>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>Milestone Progress</div>
          {allMilestones.length === 0 ? (
            <div style={{ fontSize: 12, color: C.text3, textAlign: "center", padding: "32px 0" }}>No milestones defined yet</div>
          ) : (<>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 0", background: C.greenLight, borderRadius: 10 }}>
                <div style={{ fontSize: 36, fontWeight: 700, color: C.green, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{completedMsCount}</div>
                <div style={{ fontSize: 9.5, color: C.green, fontWeight: 700, marginTop: 5, textTransform: "uppercase" as const, letterSpacing: ".04em" }}>Completed</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", padding: "10px 0", background: overdueMsCount > 0 ? C.redLight : C.amberLight, borderRadius: 10 }}>
                <div style={{ fontSize: 36, fontWeight: 700, color: overdueMsCount > 0 ? C.red : C.amber, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{pendingMsCount}</div>
                <div style={{ fontSize: 9.5, color: overdueMsCount > 0 ? C.red : C.amber, fontWeight: 700, marginTop: 5, textTransform: "uppercase" as const, letterSpacing: ".04em" }}>
                  {overdueMsCount > 0 ? `Pending · ${overdueMsCount} overdue` : "Pending"}
                </div>
              </div>
            </div>
            <div style={{ height: 5, background: C.borderLight, borderRadius: 99, marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${msCompletionPct ?? 0}%`, background: C.green, borderRadius: 99, transition: "width .4s" }} />
            </div>
            <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 10 }}>{msCompletionPct ?? 0}% complete · {allMilestones.length} total milestones</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {allMilestones.filter((m: any) => !(m.status ?? "").toLowerCase().match(/complet|done/)).slice(0, 3).map((m: any) => {
                const isOverdue = m.dueDate && new Date(m.dueDate) < new Date();
                const dLeft = m.dueDate ? Math.ceil((new Date(m.dueDate).getTime() - Date.now()) / 86400000) : null;
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", background: C.surface2, borderRadius: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: isOverdue ? C.red : C.amber, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{m.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: isOverdue ? C.red : C.text3, whiteSpace: "nowrap" as const }}>
                      {dLeft === null ? "—" : isOverdue ? `${Math.abs(dLeft)}d overdue` : `in ${dLeft}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          </>)}
        </>)}
      </div>

      {/* Row 4 — EVM (only when data exists) */}
      {evmData.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 12 }}>
          {card(<>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 3 }}>EVM Snapshot</div>
            <div style={{ fontSize: 11, color: C.text3, marginBottom: 10 }}>Planned Value · Earned Value · Actual Cost ($K)</div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={evmData} margin={{ top: 0, right: 0, bottom: 0, left: -30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.text2 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.text3 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: any) => [`$${v}K`]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                  {evmData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>)}
          {card(<>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>EVM Metrics</div>
            {([
              { label: "Planned Value (PV)", value: fmtK(pv) },
              { label: "Earned Value (EV)",  value: fmtK(ev), note: ev && pv ? (ev < pv ? `−${fmtK(pv - ev)}` : `+${fmtK(ev - pv)}`) : undefined, noteColor: ev && pv ? (ev < pv ? C.amber : C.green) : undefined },
              { label: "Actual Cost (AC)",   value: fmtK(ac) },
              { label: "SPI",  value: fmt2(spi), valueColor: spi !== null ? (spi < 0.85 ? C.red : spi < 0.95 ? C.amber : C.green) : undefined },
              { label: "CPI",  value: fmt2(cpi), valueColor: cpi !== null ? (cpi < 0.85 ? C.red : cpi < 0.95 ? C.amber : C.green) : undefined },
              { label: "EAC",  value: fmtK(eac), valueColor: eac !== null && bac !== null && eac > bac ? C.red : undefined },
            ] as { label: string; value: string; note?: string; noteColor?: string; valueColor?: string }[]).map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                <span style={{ fontSize: 11, color: C.text3 }}>{row.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {row.note && <span style={{ fontSize: 10, color: row.noteColor ?? C.text3 }}>{row.note}</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: row.valueColor ?? C.text, fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
                </div>
              </div>
            ))}
          </>)}
        </div>
      )}

      {/* Next milestone strip */}
      {nextMs && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <CalendarDays size={14} color={C.primary} />
          <span style={{ fontSize: 12, color: C.text3 }}>Next milestone:</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1 }}>{nextMs.name}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: daysToMs !== null && daysToMs < 14 ? C.red : C.primary }}>
            {daysToMs === 0 ? "Due today" : daysToMs !== null && daysToMs < 0 ? `${Math.abs(daysToMs)}d overdue` : daysToMs !== null ? `${daysToMs}d` : "—"}
          </span>
          <span style={{ fontSize: 11, color: C.text3 }}>
            {nextMs.dueDate ? new Date(nextMs.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main workspace ─────────────────────────────────────────────────────────────

const PREDICTIVE_TABS = ["Overview", "Project Info", "Scope Control", "Artifacts", "Registers", "Risk", "Issues", "Decisions", "Resources", "Schedule", "Cost", "Status Reporting"];
const AGILE_TABS = ["Overview", "Project Info", "Scope Control", "Artifacts", "Registers", "Sprints", "Risk", "Issues", "Decisions", "Resources", "Schedule", "Cost", "Status Reporting"];

const PREDICTIVE_NAV_GROUPS = [
  { section: "Project",        tabs: ["Overview", "Project Info"] },
  { section: "Delivery",       tabs: ["Scope Control", "Artifacts", "Resources", "Schedule", "Cost"] },
  { section: "Risk & Quality", tabs: ["Risk", "Issues", "Decisions", "Registers"] },
  { section: "Reporting",      tabs: ["Status Reporting", "Baseline"] },
];
const AGILE_NAV_GROUPS = [
  { section: "Project",        tabs: ["Overview", "Project Info"] },
  { section: "Delivery",       tabs: ["Scope Control", "Artifacts", "Resources", "Sprints", "Schedule", "Cost"] },
  { section: "Risk & Quality", tabs: ["Risk", "Issues", "Decisions", "Registers"] },
  { section: "Reporting",      tabs: ["Status Reporting"] },
];

const TAB_META: Record<string, { icon: React.ReactNode }> = {
  "Overview":         { icon: <TrendingUp size={14} /> },
  "Project Info":     { icon: <Info size={14} /> },
  "Artifacts":        { icon: <FileText size={14} /> },
  "Sprints":          { icon: <Zap size={14} /> },
  "Risk":             { icon: <ShieldAlert size={14} /> },
  "Issues":           { icon: <AlertCircle size={14} /> },
  "Decisions":        { icon: <ClipboardList size={14} /> },
  "Resources":        { icon: <Users size={14} /> },
  "Schedule":         { icon: <CalendarDays size={14} /> },
  "Cost":             { icon: <CircleDollarSign size={14} /> },
  "Commercial":       { icon: <Briefcase size={14} /> },
  "Registers":        { icon: <BookOpen size={14} /> },
  "Scope Control":    { icon: <Layers size={14} /> },
  "Status Reporting": { icon: <BarChart2 size={14} /> },
  "Baseline":         { icon: <GitCompare size={14} /> },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  draft:     { label: "Draft",     color: "#5b616e", bg: "#f1f3f5", border: "#d3d7de" },
  active:    { label: "Active",    color: "#158a5a", bg: "#e3f3ea", border: "#a3d9bc" },
  closing:   { label: "Closing",   color: "#c17d12", bg: "#fbf0da", border: "#f0cc80" },
  closed:    { label: "Closed",    color: "#006E74", bg: "rgba(0,110,116,.08)", border: "rgba(0,110,116,.25)" },
  completed: { label: "Completed", color: "#006E74", bg: "rgba(0,110,116,.08)", border: "rgba(0,110,116,.25)" },
  archived:  { label: "Archived",  color: "#8a909c", bg: "#f7f8fa", border: "#e2e5ea" },
};

const STATUS_NEXT: Record<string, string[]> = {
  draft:   ["active"],
  active:  ["closing", "closed"],
  closing: ["closed"],
  closed:  ["archived"],
};

export function WorkspaceClient({ project, catalog }: { project: any; catalog: any[] }) {
  const isAgile = project.deliveryMethod === "agile_scrum" || project.methodology === "agile_scrum";
  const NAV_GROUPS = isAgile ? AGILE_NAV_GROUPS : PREDICTIVE_NAV_GROUPS;

  const [tab, setTab] = useState("Overview");
  const [currentPhase, setCurrentPhase] = useState<string>(project.currentPhase || "initiation");
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [dataCounts, setDataCounts] = useState<Record<string, number>>({});
  const [projectStatus, setProjectStatus] = useState<string>(project.status || "draft");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Account linker — lets PM fix accountId on existing projects
  const [projectAccount, setProjectAccount] = useState<{ id: string; name: string; code: string } | null>(project.account ?? null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountList, setAccountList] = useState<{ id: string; name: string; code: string }[]>([]);
  const [linkingAccount, setLinkingAccount] = useState(false);

  useEffect(() => {
    if (accountMenuOpen && accountList.length === 0) {
      fetch("/api/accounts").then(r => r.json()).then(d => {
        if (Array.isArray(d)) setAccountList(d.map((a: any) => ({ id: a.id, name: a.name, code: a.code })));
      }).catch(() => {});
    }
  }, [accountMenuOpen, accountList.length]);

  async function linkAccount(acct: { id: string; name: string; code: string }) {
    setLinkingAccount(true);
    setAccountMenuOpen(false);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: acct.id }),
      });
      if (res.ok) setProjectAccount(acct);
    } finally {
      setLinkingAccount(false);
    }
  }

  const { setTabContext } = useCopilot();
  useEffect(() => {
    setTabContext({
      tab: tab.toLowerCase().replace(/ /g, "_"),
      projectId: project.id,
      projectName: project.name,
    });
  }, [tab, project.id, project.name, setTabContext]);

  // Load badge counts on mount and after advisory actions
  const loadBadges = useCallback(() => {
    fetch(`/api/projects/${project.id}/advisories?tab=all`)
      .then(r => r.json())
      .then(d => {
        setBadges(d.badges ?? {});
        setDataCounts(d.dataCounts ?? {});
      })
      .catch(() => {});
  }, [project.id]);

  useEffect(() => { loadBadges(); }, [loadBadges]);

  const updateProjectStatus = useCallback(async (newStatus: string) => {
    setUpdatingStatus(true);
    setStatusMenuOpen(false);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) setProjectStatus(newStatus);
    } finally {
      setUpdatingStatus(false);
    }
  }, [project.id]);

  const tabKey = tab.toLowerCase().replace(/ /g, "_");
  const panelTabKey = tab === "Scope Control" ? "scope" : tabKey;

  return (
    <div style={{ padding: "22px 26px 40px" }}>
      {/* Top bar content */}
      <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/dashboard/projects" style={{ color: "#8a909c", textDecoration: "none", fontSize: 14 }}>← Projects</Link>
        <span style={{ color: C.border }}>/</span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{project.name}</span>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: ragColor(project.healthStatus), display: "inline-block" }} />
            {/* Clickable project status badge */}
            <div style={{ position: "relative" }}>
              {(() => {
                const sc = STATUS_CONFIG[projectStatus] ?? STATUS_CONFIG.draft;
                const nextOptions = STATUS_NEXT[projectStatus] ?? [];
                const canChange = nextOptions.length > 0 && !updatingStatus;
                return (
                  <>
                    <button
                      onClick={() => canChange && setStatusMenuOpen(o => !o)}
                      style={{
                        fontSize: 11, fontWeight: 600, color: sc.color,
                        background: sc.bg, border: `1px solid ${sc.border}`,
                        borderRadius: 999, padding: "2px 9px",
                        cursor: canChange ? "pointer" : "default",
                        display: "flex", alignItems: "center", gap: 4,
                        fontFamily: "var(--font-inter),'Inter',sans-serif",
                      }}
                    >
                      {sc.label}
                      {canChange && <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>}
                    </button>
                    {statusMenuOpen && (
                      <div style={{
                        position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
                        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.10)", minWidth: 140, overflow: "hidden",
                      }}>
                        {nextOptions.map(ns => {
                          const nsc = STATUS_CONFIG[ns];
                          return (
                            <button key={ns} onClick={() => updateProjectStatus(ns)} style={{
                              display: "block", width: "100%", textAlign: "left",
                              padding: "9px 14px", border: "none", background: "transparent",
                              cursor: "pointer", fontSize: 13, fontWeight: 500,
                              color: nsc.color, fontFamily: "var(--font-inter),'Inter',sans-serif",
                            }}>
                              → Mark as {nsc.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
            <span className="mono" style={{ fontSize: 12, color: C.text3 }}>
              {project.code} · {project.customer || "Internal"} · {project.methodology}
            </span>
            {/* Account linker */}
            <span style={{ position: "relative" }}>
              <button
                onClick={() => setAccountMenuOpen(o => !o)}
                disabled={linkingAccount}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  padding: "2px 8px", borderRadius: 99, border: "1px solid",
                  ...(projectAccount
                    ? { background: "rgba(0,110,116,.08)", color: C.primary, borderColor: "rgba(0,110,116,.25)" }
                    : { background: "#fef3c7", color: "#92400e", borderColor: "#f59e0b" }),
                }}
              >
                {linkingAccount ? "Linking…" : projectAccount ? `⚡ ${projectAccount.code}` : "⚠ No client account"}
              </button>
              {accountMenuOpen && (
                <>
                  <div onClick={() => setAccountMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 41,
                    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,.13)", padding: 6, minWidth: 220, maxHeight: 260, overflowY: "auto" as const,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase" as const, letterSpacing: ".05em", padding: "4px 8px 6px" }}>
                      Link client account
                    </div>
                    {accountList.length === 0 && <div style={{ fontSize: 12, color: C.text3, padding: "6px 10px" }}>Loading…</div>}
                    {accountList.map(a => (
                      <button
                        key={a.id}
                        onClick={() => linkAccount(a)}
                        style={{
                          display: "block", width: "100%", textAlign: "left", padding: "7px 10px",
                          border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13,
                          background: projectAccount?.id === a.id ? C.primaryLight : "transparent",
                          color: projectAccount?.id === a.id ? C.primary : C.text,
                          fontWeight: projectAccount?.id === a.id ? 600 : 400,
                        }}
                        onMouseEnter={e => { if (projectAccount?.id !== a.id) e.currentTarget.style.background = C.surface2; }}
                        onMouseLeave={e => { if (projectAccount?.id !== a.id) e.currentTarget.style.background = "transparent"; }}
                      >
                        <span style={{ fontWeight: 600 }}>{a.code}</span> — {a.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Phase rail */}
      <PhaseRail
        projectId={project.id}
        currentPhase={currentPhase}
        onPhaseAdvanced={setCurrentPhase}
      />

      {/* Workspace — vertical left nav + content */}
      <div style={{ display: "flex", gap: 0, alignItems: "flex-start" }}>

        {/* Left nav */}
        <nav style={{
          width: 192, flexShrink: 0, background: "#003C51", borderRadius: 12,
          padding: "10px 0", marginRight: 20, position: "sticky", top: 22,
        }}>
          {NAV_GROUPS.map(group => (
            <React.Fragment key={group.section}>
              <div style={{ padding: "10px 14px 4px", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                {group.section}
              </div>
              {group.tabs.map(t => {
                const k = t === "Scope Control" ? "scope" : t.toLowerCase().replace(/ /g, "_");
                const dataCount = dataCounts[k] ?? 0;
                const advisory = badges[k] ?? 0;
                const isActive = tab === t;
                return (
                  <button key={t} onClick={() => setTab(t)} style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: isActive ? "7px 14px 7px 11px" : "7px 14px",
                    border: "none", cursor: "pointer", textAlign: "left",
                    background: isActive ? "rgba(0,110,116,.28)" : "transparent",
                    borderLeft: isActive ? "3px solid #0097AC" : "3px solid transparent",
                    color: isActive ? "#fff" : "rgba(255,255,255,.62)",
                    fontSize: 12.5, fontWeight: isActive ? 600 : 500,
                    fontFamily: "var(--font-inter),'Inter',sans-serif",
                    transition: "all .1s",
                  }}>
                    <span style={{ color: isActive ? "#0097AC" : "rgba(255,255,255,.4)", display: "flex", alignItems: "center", flexShrink: 0 }}>
                      {TAB_META[t]?.icon}
                    </span>
                    <span style={{ flex: 1 }}>{t}</span>
                    {dataCount > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: "#0097AC", color: "#fff", borderRadius: 99, padding: "1px 5px", minWidth: 16, textAlign: "center" }}>
                        {dataCount}
                      </span>
                    )}
                    {advisory > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: "#f59e0b", color: "#fff", borderRadius: 99, padding: "1px 4px", minWidth: 14, textAlign: "center" }}>⚡</span>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </nav>

        {/* Tab content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {tab === "Overview" && !isAgile && <OverviewTab project={project} />}
          {tab === "Overview" && isAgile && <AgileOverviewTab project={project} />}
          {tab === "Project Info" && <ProjectInfoTab project={project} />}
          {tab === "Artifacts" && <ArtifactsTab project={project} catalog={catalog} onNavigate={setTab} />}
          {tab === "Backlog" && <BacklogTab project={project} />}
          {tab === "Sprints" && <SprintsTab project={project} />}
          {tab === "Risk" && <RiskTab project={project} />}
          {tab === "Issues" && <IssuesTab project={project} />}
          {tab === "Decisions" && <DecisionsTab project={project} />}
          {tab === "Resources" && <ResourcesTab project={project} />}
          {tab === "Schedule" && <ScheduleTab project={project} />}
          {tab === "Cost" && !isAgile && <CostTab project={project} />}
          {tab === "Cost" && isAgile && <AgileCommercialTab project={project} />}
          {tab === "Registers" && <RegistersTab project={project} />}
          {tab === "Scope Control" && <ScopeControlTab project={project} />}
          {tab === "Status Reporting" && isAgile && <AgileStatusTab project={project} />}
          {tab === "Status Reporting" && !isAgile && <StatusTab project={project} />}
          {tab === "Baseline" && <BaselineTab project={project} />}
        </div>

      </div>

    </div>
  );
}
