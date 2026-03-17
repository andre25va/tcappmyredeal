import React, { useMemo, useState } from "react";
import { Mail, LinkIcon, ListTodo, Zap, ChevronRight } from "lucide-react";
import { classifyEmailForDeal } from "../ai/emailClassifier";
import { groupEmailsByThread, summarizeThread } from "../ai/emailSummarizer";
import { extractTasksFromEmail } from "../ai/taskExtractor";
import type { DealRecord, DealTask, RawEmail } from "../ai/types";

interface Props {
  deal: DealRecord;
  emails: RawEmail[];
  onLinkThread?: (dealId: string, threadId: string) => void;
  onCreateTasks?: (dealId: string, tasks: DealTask[]) => void;
}

export const EmailCommandCenter: React.FC<Props> = ({
  deal,
  emails,
  onLinkThread,
  onCreateTasks,
}) => {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [classificationResults, setClassificationResults] = useState<
    Record<string, string>
  >({});

  const grouped = useMemo(() => groupEmailsByThread(emails), [emails]);
  const selectedThread =
    grouped.find((g) => g.threadId === selectedThreadId) || null;

  async function handleClassifyThread(threadId: string) {
    const thread = grouped.find((g) => g.threadId === threadId);
    if (!thread) return;

    const result = await classifyEmailForDeal(thread.latest, deal);

    setClassificationResults((prev) => ({
      ...prev,
      [threadId]: `${result.shouldAttach ? "Match" : "No match"} (${Math.round(
        result.confidence * 100
      )}%) — ${result.reason}`,
    }));

    if (result.shouldAttach && onLinkThread) {
      onLinkThread(deal.id, threadId);
    }
  }

  function handleCreateTasks() {
    if (!selectedThread || !onCreateTasks) return;

    const suggested = selectedThread.emails.flatMap(extractTasksFromEmail);

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
  }

  if (emails.length === 0) {
    return (
      <div className="rounded-2xl border p-8 bg-white shadow-sm text-center">
        <Mail size={32} className="mx-auto text-gray-300 mb-3" />
        <h3 className="text-base font-semibold text-gray-600 mb-1">
          Email Command Center
        </h3>
        <p className="text-sm text-gray-400">
          No emails loaded yet. Email integration coming in Phase 2.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Mail size={18} className="text-primary" />
            Email Command Center
          </h3>
          <p className="text-sm text-gray-600">
            Link threads, summarize updates, and create tasks.
          </p>
        </div>
      </div>

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
                onClick={() => setSelectedThreadId(thread.threadId)}
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
                  <ChevronRight
                    size={14}
                    className="text-gray-300 flex-none"
                  />
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
                  className="btn btn-sm btn-outline gap-1.5"
                  onClick={() =>
                    handleClassifyThread(selectedThread.threadId)
                  }
                >
                  <Zap size={13} /> Match to Deal
                </button>
                <button
                  className="btn btn-sm btn-outline gap-1.5"
                  onClick={handleCreateTasks}
                >
                  <ListTodo size={13} /> Create Tasks
                </button>
                <button
                  className="btn btn-sm btn-outline gap-1.5"
                  onClick={() =>
                    onLinkThread?.(deal.id, selectedThread.threadId)
                  }
                >
                  <LinkIcon size={13} /> Force Link
                </button>
              </div>

              {/* Summary */}
              <div className="mb-4 bg-gray-50 rounded-lg p-3">
                <h4 className="font-medium text-sm mb-1">Summary</h4>
                <p className="text-sm text-gray-700">
                  {summarizeThread(selectedThread).summary}
                </p>
              </div>

              {/* Insights grid */}
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <h5 className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-1">
                    Key Updates
                  </h5>
                  <ul className="text-sm space-y-1">
                    {summarizeThread(selectedThread).keyUpdates.length > 0 ? (
                      summarizeThread(selectedThread).keyUpdates.map((item) => (
                        <li key={item} className="text-gray-700">
                          • {item}
                        </li>
                      ))
                    ) : (
                      <li className="text-gray-400 italic">None detected</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-1">
                    Action Items
                  </h5>
                  <ul className="text-sm space-y-1">
                    {summarizeThread(selectedThread).actionItems.length > 0 ? (
                      summarizeThread(selectedThread).actionItems.map(
                        (item) => (
                          <li key={item} className="text-gray-700">
                            • {item}
                          </li>
                        )
                      )
                    ) : (
                      <li className="text-gray-400 italic">None detected</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-xs text-gray-500 uppercase tracking-wide mb-1">
                    Risk Flags
                  </h5>
                  <ul className="text-sm space-y-1">
                    {summarizeThread(selectedThread).riskFlags.length > 0 ? (
                      summarizeThread(selectedThread).riskFlags.map((item) => (
                        <li key={item} className="text-red-600">
                          • {item}
                        </li>
                      ))
                    ) : (
                      <li className="text-gray-400 italic">None detected</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Emails in thread */}
              <div className="mt-6">
                <h4 className="font-medium text-sm mb-2">
                  Emails in Thread ({selectedThread.emails.length})
                </h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {selectedThread.emails.map((email) => (
                    <div
                      key={email.id}
                      className="rounded-lg border p-3 bg-white"
                    >
                      <div className="font-medium text-sm">{email.subject}</div>
                      <div className="text-xs text-gray-600">{email.from}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(email.receivedAt).toLocaleString()}
                      </div>
                      <div className="text-sm mt-2 text-gray-700">
                        {email.snippet ||
                          email.bodyText?.slice(0, 300) ||
                          "No preview"}
                      </div>
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
