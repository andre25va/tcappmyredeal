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
  DealChatResponse,
  SearchInterpretationResponse,
  VoiceUpdateInterpretation,
} from "./types";
import type { DealContextPacket } from "./chatContextBuilder";

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

/** Send a deal-scoped chat question to AI */
export async function dealChatQuery(
  question: string,
  context: DealContextPacket,
  history: Array<{ role: string; content: string }>
): Promise<DealChatResponse> {
  return post<DealChatResponse>('deal-chat', { question, context, history });
}

/** Interpret a natural-language search query into structured filters */
export async function interpretSearchAI(
  query: string
): Promise<SearchInterpretationResponse> {
  return post<SearchInterpretationResponse>('interpret-search', { query });
}

/** Interpret a voice update transcript for a deal */
export async function interpretVoiceUpdateAI(
  transcript: string,
  dealContext: object
): Promise<VoiceUpdateInterpretation> {
  return post<VoiceUpdateInterpretation>('interpret-voice-update', { transcript, dealContext });
}

/** AI-powered deal health analysis */
export interface DealHealthAIResponse {
  riskSummary: string;
  recommendations: string[];
  nextMilestone: string;
  estimatedDaysToClose: number | null;
  topRisk: string;
  overallAssessment: 'on-track' | 'needs-attention' | 'at-risk' | 'critical';
}

export async function dealHealthAI(deal: DealRecord): Promise<DealHealthAIResponse> {
  return post<DealHealthAIResponse>('deal-health-ai', { deal });
}
