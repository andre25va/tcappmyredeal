import React, { useMemo, useState, useCallback } from "react";
import {
  Mail, LinkIcon, ListTodo, Zap, ChevronRight, ChevronDown,
  Loader2, Brain, ShieldCheck, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { classifyEmailForDeal } from "../ai/emailClassifier";
import { groupEmailsByThread, summarizeThreadLocal } from "../ai/emailSummarizer";
import { extractTasksFromEmail } from "../ai/taskExtractor";
import { summarizeThreadAI, extractTasksAI, compliancePrecheckAI } from "../ai/apiClient";
import type {
  DealRecord, DealTask, RawEmail, EmailSummary,
  SuggestedTask, CompliancePrecheckResult,
} from "../ai/types";
import { StatusBadge } from './ui/StatusBadge';

interface Props {
  deal: DealRecord;
  emails: RawEmail[];
  onLinkThread?: (dealId: string, threadId: string) => void;
  onCreateTasks?: (dealId: string, tasks: DealTask[]) => void;
}

type LoadingState = "idle" | "loading" | "done" | "error";

export const EmailCommandCenter: React.FC<Props> = ({
  deal,
  emails,
  onLinkThread,
  onCreateTasks,
}) => {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [classificationResults, setClassificationResults] = useState<Record<string, string>>({});
  const [classifyLoading, setClassifyLoading] = useState<Record<string, boolean>>({});

  // AI-powered states
  const [aiSummary, setAiSummary] = useState<EmailSummary | null>(null);
  const [aiSummaryState, setAiSummaryState] = useState<LoadingState>("idle");
  const [aiTasks, setAiTasks] = useState<SuggestedTask[]>([]);
  const [aiTasksState, setAiTasksState] = useState<LoadingState>("idle");
  const [compliance, setCompliance] = useState<CompliancePrecheckResult | null>(null);
  const [complianceState, setComplianceState] = useState<LoadingState>("idle");

  const grouped = useMemo(() => groupEmailsByThread(emails), [emails]);
  const selectedThread = grouped.find((g) => g.threadId === selectedThreadId) || null;
  const localSummary = useMemo(
    () => selectedThread ? summarizeThreadLocal(selectedThread) : null,
    [selectedThread]
  );

  // Use AI summary if available, otherwise local
  const activeSummary = aiSummary || localSummary;

  const handleClassifyThread = useCallback(async (threadId: string) => {
    const thread = grouped.find((g) => g.threadId === threadId);
    if (!thread) return;

    setClassifyLoading((prev) => ({ ...prev, [threadId]: true }));
    try {
      const result = await classifyEmailForDeal(thread.latest, deal);
      setClassificationResults((prev) => ({
        ...prev,
        [threadId]: `${result.shouldAttach ? "✅ Match" : "❌ No match"} (${Math.round(result.confidence * 100)}%) — ${result.reason}`,
      }));
      if (result.shouldAttach && onLinkThread) {
        onLinkThread(deal.id, threadId);
      }
    } catch (err) {
      setClassificationResults((prev) => ({
        ...prev,
        [threadId]: "⚠️ Classification failed — try again",
      }));
    } finally {
      setClassifyLoading((prev) => ({ ...prev, [threadId]: false }));
    }
  }, [grouped, deal, onLinkThread]);

  const handleAISummary = useCallback(async () => {
    if (!selectedThread) return;
    setAiSummaryState("loading");
    try {
      const result = await summarizeThreadAI(selectedThread);
      setAiSummary(result);
      setAiSummaryState("done");
    } catch {
      setAiSummaryState("error");
    }
  }, [selectedThread]);

  const handleAITasks = useCallback(async () => {
    if (!selectedThread) return;
    setAiTasksState("loading");
    try {
      const allTasks: SuggestedTask[] = [];
      // AI extract from latest email (most relevant)
      const tasks = await extractTasksAI(selectedThread.latest);
      allTasks.push(...tasks);
      setAiTasks(allTasks);
      setAiTasksState("done");
    } catch {
      setAiTasksState("error");
    }
  }, [selectedThread]);

  const handleCreateTasks = useCallback(() => {
    if (!selectedThread || !onCreateTasks) return;

    // Use AI tasks if available, otherwise local extraction
    const suggested = aiTasks.length > 0
      ? aiTasks
      : selectedThread.emails.flatMap(extractTasksFromEmail);

    const tasks: DealTask[] = suggested.map((t, idx) => ({
      id: `${selectedThread.threadId}-${idx}-${Date.now()}`,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate,
      priority: t.priority,
      status: "open" as const,
      source: "email" as const,
    }));

    onCreateTasks(deal.id, tasks);
  }, [selectedThread, aiTasks, onCreateTasks, deal.id]);

  const handleCompliancePrecheck = useCallback(async () => {
    setComplianceState("loading");
    try {
      const result = await compliancePrecheckAI(deal, grouped);
      setCompliance(result);
      setComplianceState("done");
    } catch {
      setComplianceState("error");
    }
  }, [deal, grouped]);

  // Reset AI states when switching threads
  const selectThread = useCallback((threadId: string) => {
    setSelectedThreadId(threadId);
    setAiSummary(null);
    setAiSummaryState("idle");
    setAiTasks([]);
    setAiTasksState("idle");
  }, []);

  if (emails.length === 0) {
    return (
      <div className="rounded-2xl border p-8 bg-white shadow-sm text-center">
        <Mail size={32} className="mx-auto text-gray-300 mb-3" />
        <h3 className="text-base font-semibold text-gray-600 mb-1">
          Email Command Center
        </h3>
        <p className="text-sm text-gray-400">
          No emails loaded yet. Connect Gmail to start matching emails to deals.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Mail size={18} className="text-primary" />
            Email Command Center
            <span className="text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">AI-Powered</span>
          </h3>
          <p className="text-sm text-gray-600">
            Classify, summarize, extract tasks, and check compliance.
          </p>
        </div>
        <button
          className={`btn btn-sm gap-1.5 ${complianceState === "loading" ? "btn-disabled" : "btn-outline"}`}
          onClick={handleCompliancePrecheck}
          disabled={complianceState === "loading"}
        >
          {complianceState === "loading" ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
          Compliance Pre-Check
        </button>
      </div>

      {/* Compliance result banner */}
      {compliance && (
        <div className={`mt-3 rounded-xl p-3 border ${
          compliance.status === "pass" ? "bg-green-50 border-green-200" :
          compliance.status === "watch" ? "bg-yellow-50 border-yellow-200" :
          "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {compliance.status === "pass" ? <CheckCircle2 size={16} className="text-green-600" /> :
             compliance.status === "watch" ? <AlertTriangle size={16} className="text-yellow-600" /> :
             <AlertTriangle size={16} className="text-red-600" />}
            <span className="font-medium text-sm capitalize">{compliance.status}</span>
          </div>
          <p className="text-sm text-gray-700">{compliance.summary}</p>
          {compliance.missingItems.length > 0 && (
            <div className="mt-2">
              <span className="text-xs font-medium text-gray-500 uppercase">Missing</span>
              <ul className="text-sm mt-1 space-y-0.5">
                {compliance.missingItems.map((item, i) => (
                  <li key={i} className="text-gray-700">• {item}</li>
                ))}
              </ul>
            </div>
          )}
          {compliance.inconsistentItems.length > 0 && (
            <div className="mt-2">
              <span className="text-xs font-medium text-gray-500 uppercase">Inconsistencies</span>
              <ul className="text-sm mt-1 space-y-0.5">
                {compliance.inconsistentItems.map((item, i) => (
                  <li key={i} className="text-yellow-700">• {item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {complianceState === "error" && (
        <div className="mt-3 rounded-xl p-3 bg-red-50 border border-red-200 text-sm text-red-700">
          Compliance pre-check failed. Please try again.
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Thread list */}
        <div className="border rounded-xl overflow-hidden">
          <div className="p-3 border-b font-medium text-sm">
            Threads ({grouped.length})
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {grouped.map((thread) => (
              <button
                key={thread.threadId}
                className={`w-full text-left p-3 border-b hover:bg-gray-50 transition-colors ${
                  selectedThreadId === thread.threadId ? "bg-blue-50" : ""
                }`}
                onClick={() => selectThread(thread.threadId)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {thread.latest.subject}
                    </div>
                    <div className="text-xs text-gray-600 truncate">
                      {thread.latest.from}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(thread.latest.receivedAt).toLocaleString()}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 flex-none" />
                </div>
                {classificationResults[thread.threadId] && (
                  <div className="text-xs mt-2 text-blue-700 bg-blue-50 rounded px-2 py-1">
                    {classificationResults[thread.threadId]}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="border rounded-xl p-4 min-h-[420px]">
          {!selectedThread ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Mail size={24} className="mb-2" />
              <p className="text-sm">Select a thread to review.</p>
            </div>
          ) : (
            <>
              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap mb-4">
                <button
                  className={`btn btn-sm gap-1.5 ${classifyLoading[selectedThread.threadId] ? "btn-disabled" : "btn-outline"}`}
                  onClick={() => handleClassifyThread(selectedThread.threadId)}
                  disabled={classifyLoading[selectedThread.threadId]}
                >
                  {classifyLoading[selectedThread.threadId]
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Zap size={13} />}
                  Match to Deal
                </button>
                <button
                  className={`btn btn-sm gap-1.5 ${aiSummaryState === "loading" ? "btn-disabled" : "btn-outline"}`}
                  onClick={handleAISummary}
                  disabled={aiSummaryState === "loading"}
                >
                  {aiSummaryState === "loading"
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Brain size={13} />}
                  AI Summary
                </button>
                <button
                  className={`btn btn-sm gap-1.5 ${aiTasksState === "loading" ? "btn-disabled" : "btn-outline"}`}
                  onClick={handleAITasks}
                  disabled={aiTasksState === "loading"}
                >
                  {aiTasksState === "loading"
                    ? <Loader2 size={13} className="animate-spin" />
                    : <ListTodo size={13} />}
                  AI Extract Tasks
                </button>
                <button
                  className="btn btn-sm btn-outline gap-1.5"
                  onClick={handleCreateTasks}
                >
                  <ListTodo size={13} /> Create Tasks
                </button>
                <button
                  className="btn btn-sm btn-outline gap-1.5"
                  onClick={() => onLinkThread?.(deal.id, selectedThread.threadId)}
                >
                  <LinkIcon size={13} /> Force Link
                </button>
              </div>

              {/* Summary section */}
              <div className="mb-4 bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-sm">Summary</h4>
                  {aiSummary && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">AI</span>
                  )}
                </div>
                <p className="text-sm text-gray-700">
                  {activeSummary?.summary || "No summary available."}
                </p>
                {aiSummaryState === "error" && (
                  <p className="text-xs text-red-500 mt-1">AI summary failed — showing local analysis.</p>
                )}
              </div>

              {/* AI Tasks preview */}
              {aiTasks.length > 0 && (
                <div className="mb-4 bg-purple-50 rounded-lg p-3 border border-purple-100">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <Brain size={14} className="text-purple-600" />
                    AI-Extracted Tasks ({aiTasks.length})
                    <span className="text-xs text-gray-500 font-normal">Click &quot;Create Tasks&quot; to add to deal</span>
                  </h4>
                  <ul className="text-sm space-y-1.5">
                    {aiTasks.map((task, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <StatusBadge status={task.priority} />
                        <div>
                          <div className="text-gray-800">{task.title}</div>
                          {task.suggestedOwnerRole && (
                            <div className="text-xs text-gray-500">→ {task.suggestedOwnerRole}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Insights grid */}
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <h5 className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-1">
                    Key Updates
                  </h5>
                  <ul className="text-sm space-y-1">
                    {(activeSummary?.keyUpdates?.length ?? 0) > 0
                      ? activeSummary!.keyUpdates.map((item, i) => (
                          <li key={i} className="text-gray-700">• {item}</li>
                        ))
                      : <li className="text-gray-400 italic">None detected</li>}
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-1">
                    Action Items
                  </h5>
                  <ul className="text-sm space-y-1">
                    {(activeSummary?.actionItems?.length ?? 0) > 0
                      ? activeSummary!.actionItems.map((item, i) => (
                          <li key={i} className="text-gray-700">• {item}</li>
                        ))
                      : <li className="text-gray-400 italic">None detected</li>}
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-1">
                    Risk Flags
                  </h5>
                  <ul className="text-sm space-y-1">
                    {(activeSummary?.riskFlags?.length ?? 0) > 0
                      ? activeSummary!.riskFlags.map((item, i) => (
                          <li key={i} className="text-red-600">• {item}</li>
                        ))
                      : <li className="text-gray-400 italic">None detected</li>}
                  </ul>
                </div>
              </div>

              {/* Emails in thread */}
              <div className="mt-6">
                <h4 className="font-medium text-sm mb-2">
                  Emails in Thread ({selectedThread.emails.length})
                </h4>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {selectedThread.emails.map((email) => (
                    <div key={email.id} className="rounded-lg border bg-white overflow-hidden">
                      {/* Header */}
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{email.subject}</div>
                            <div className="text-xs text-gray-600">{email.from}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {new Date(email.receivedAt).toLocaleString()}
                            </div>
                          </div>
                          <button
                            className="btn btn-xs btn-ghost flex-shrink-0 gap-1 text-blue-600"
                            onClick={() =>
                              setExpandedEmailId(expandedEmailId === email.id ? null : email.id)
                            }
                          >
                            <ChevronDown
                              size={12}
                              className={expandedEmailId === email.id ? "rotate-180 transition-transform" : "transition-transform"}
                            />
                            {expandedEmailId === email.id ? "Collapse" : "View"}
                          </button>
                        </div>
                        {expandedEmailId !== email.id && (
                          <div className="text-xs mt-1.5 text-gray-500 italic line-clamp-2">
                            {email.snippet || email.bodyText?.slice(0, 120) || "No preview"}
                          </div>
                        )}
                      </div>
                      {/* Expanded body */}
                      {expandedEmailId === email.id && (
                        <div className="border-t bg-gray-50">
                          {email.bodyHtml ? (
                            <iframe
                              srcDoc={email.bodyHtml}
                              sandbox="allow-same-origin"
                              className="w-full"
                              style={{ border: "none", minHeight: "300px", maxHeight: "520px", display: "block" }}
                              title={`Email: ${email.subject}`}
                              onLoad={(e) => {
                                const iframe = e.currentTarget;
                                try {
                                  const h = iframe.contentDocument?.body?.scrollHeight;
                                  if (h) iframe.style.height = Math.min(h + 24, 520) + "px";
                                } catch {}
                              }}
                            />
                          ) : (
                            <pre className="text-xs text-gray-700 whitespace-pre-wrap p-3 max-h-[420px] overflow-y-auto font-sans leading-relaxed">
                              {email.bodyText || email.snippet || "No content available"}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
