// Browser-safe API client for AI endpoints.
// All OpenAI calls happen server-side in api/ai.ts.
// This file just makes fetch() calls to those endpoints.

import type {
  RawEmail,
  DealRecord,
  EmailClassification,
  EmailSummary,
  EmailThreadGroup,
  SuggestedTask,
  CompliancePrecheckResult,
} from "./types";

const AI_BASE = "/api/ai";

async function post<T>(action: string, body: object): Promise<T> {
  const res = await fetch(`${AI_BASE}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, action }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `AI API error: ${res.status}`);
  }

  return res.json();
}

/** Classify an email against a deal using AI (gray-zone only) */
export async function classifyEmailAI(
  email: RawEmail,
  deal: DealRecord,
  deterministicScore: number,
  deterministicSignals: string[]
): Promise<Omit<EmailClassification, "dealId">> {
  return post("classify-email", {
    email,
    deal,
    deterministicScore,
    deterministicSignals,
  });
}

/** Summarize an email thread using AI */
export async function summarizeThreadAI(
  thread: EmailThreadGroup
): Promise<EmailSummary> {
  return post("summarize-thread", { thread });
}

/** Extract tasks from an email using AI */
export async function extractTasksAI(
  email: RawEmail
): Promise<SuggestedTask[]> {
  return post("extract-tasks", { email });
}

/** Run compliance pre-check on a deal using AI */
export async function compliancePrecheckAI(
  deal: DealRecord,
  relatedThreads: EmailThreadGroup[]
): Promise<CompliancePrecheckResult> {
  return post("compliance-precheck", { deal, relatedThreads });
}
