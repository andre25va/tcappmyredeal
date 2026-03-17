import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Bot, User, Sparkles, Trash2, AlertTriangle } from 'lucide-react';
import { ChatActionCard } from './ChatActionCard';
import { buildDealContext } from '../ai/chatContextBuilder';
import { dealChatQuery } from '../ai/apiClient';
import { approveAction, dismissAction } from '../ai/approvalEngine';
import type { Deal } from '../types';
import type { DealChatMessage, DealChatAction } from '../ai/types';

interface Props {
  deal: Deal;
  onUpdate: (deal: Deal) => void;
}

const QUICK_PROMPTS = [
  { label: '\u2753 Missing items', prompt: "What's still missing on this file?" },
  { label: '\ud83d\udcc5 Next deadlines', prompt: 'What are the upcoming deadlines?' },
  { label: '\u26a0\ufe0f Compliance risks', prompt: 'Are there any compliance risks?' },
  { label: '\ud83d\udcdd Draft update', prompt: 'Draft a status update email for the agent.' },
  { label: '\ud83d\udcca File summary', prompt: 'Give me a quick summary of this deal.' },
  { label: '\ud83d\udd0d Recent changes', prompt: 'What has changed recently on this file?' },
];

export const DealChatPanel: React.FC<Props> = ({ deal, onUpdate }) => {
  const [messages, setMessages] = useState<DealChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset chat when deal changes
  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [deal.id]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleApproveAction = async (action: DealChatAction) => {
    const result = await approveAction(action, deal, 'deal_chat');
    if (result.updatedDeal) {
      onUpdate(result.updatedDeal);
    }

    // Add confirmation message
    let icon = '\u2705';
    if (action.type === 'flag_compliance_issue') icon = '\u26a0\ufe0f';
    if (action.type === 'draft_email') icon = '\ud83d\udce7';
    if (action.type === 'suggest_stage_update') icon = '\ud83d\udd04';

    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      role: 'assistant',
      content: `${icon} ${result.message}`,
      timestamp: new Date().toISOString(),
    }]);
  };

  const handleDismissAction = async (action: DealChatAction) => {
    await dismissAction(action, deal.id, 'deal_chat');
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      role: 'assistant',
      content: '_Action dismissed._',
      timestamp: new Date().toISOString(),
    }]);
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMsg: DealChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const context = buildDealContext(deal);
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const response = await dealChatQuery(content.trim(), context, history);

      const aiMsg: DealChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: response.answer,
        timestamp: new Date().toISOString(),
        suggestedActions: response.suggestedActions,
        factsUsed: response.factsUsed,
        warnings: response.warnings,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      console.error('Deal chat error:', err);
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-err`,
        role: 'assistant',
        content: '\u26a0\ufe0f Something went wrong connecting to AI. Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      let formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
      if (formatted.startsWith('- ') || formatted.startsWith('\u2022 ')) {
        return (
          <div key={i} className="flex gap-1.5 ml-2">
            <span className="text-primary flex-none mt-0.5">{'\u2022'}</span>
            <span dangerouslySetInnerHTML={{ __html: formatted.replace(/^[-\u2022]\s/, '') }} />
          </div>
        );
      }
      if (!formatted.trim()) return <div key={i} className="h-1.5" />;
      return <div key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  };

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-base-300 flex-none">
        <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
          <Bot size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-base-content leading-tight">Deal Assistant</div>
          <div className="text-[10px] text-base-content/50 truncate">{deal.propertyAddress}</div>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} className="btn btn-ghost btn-xs btn-square" title="Clear chat">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-6">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Sparkles size={28} className="text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-base-content text-base">Deal AI Chat</h3>
              <p className="text-xs text-base-content/50 mt-1 max-w-[260px]">
                Ask me anything about this file. I can check missing items, deadlines, compliance, draft emails, and suggest tasks.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 w-full max-w-[320px]">
              {QUICK_PROMPTS.map(qp => (
                <button
                  key={qp.label}
                  onClick={() => sendMessage(qp.prompt)}
                  className="btn btn-xs btn-outline btn-primary rounded-lg text-[10px] font-medium normal-case h-auto py-1.5 px-2"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id}>
            <div className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-none ${
                msg.role === 'user' ? 'bg-primary text-primary-content' : 'bg-secondary/20 text-secondary'
              }`}>
                {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
              </div>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-content rounded-tr-sm'
                  : 'bg-base-200 text-base-content rounded-tl-sm'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="space-y-0.5">{formatContent(msg.content)}</div>
                ) : (
                  <div>{msg.content}</div>
                )}
              </div>
            </div>

            {/* Warnings */}
            {msg.warnings && msg.warnings.length > 0 && (
              <div className="ml-8 mt-1">
                {msg.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-1 text-[10px] text-warning">
                    <AlertTriangle size={10} /> {w}
                  </div>
                ))}
              </div>
            )}

            {/* Facts used */}
            {msg.factsUsed && msg.factsUsed.length > 0 && (
              <div className="ml-8 mt-1 flex flex-wrap gap-1">
                {msg.factsUsed.slice(0, 4).map((f, i) => (
                  <span key={i} className="badge badge-xs badge-ghost text-[9px]">{f}</span>
                ))}
              </div>
            )}

            {/* Action cards */}
            {msg.suggestedActions && msg.suggestedActions.length > 0 && (
              <div className="ml-8 space-y-1">
                {msg.suggestedActions.map((action, i) => (
                  <ChatActionCard
                    key={`${msg.id}-action-${i}`}
                    action={action}
                    onApprove={handleApproveAction}
                    onDismiss={handleDismissAction}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-none bg-secondary/20 text-secondary">
              <Bot size={12} />
            </div>
            <div className="bg-base-200 rounded-xl rounded-tl-sm px-3 py-2">
              <div className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin text-primary" />
                <span className="text-xs text-base-content/50">Analyzing file...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-none border-t border-base-300 p-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this deal..."
            className="textarea textarea-bordered flex-1 min-h-[36px] max-h-[80px] text-xs resize-none rounded-xl leading-snug"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="btn btn-primary btn-sm btn-square rounded-xl flex-none"
          >
            <Send size={13} />
          </button>
        </div>
        <div className="text-[9px] text-base-content/30 mt-1 text-center">
          AI answers from deal context only {'\u2022'} Actions require your approval
        </div>
      </div>
    </div>
  );
};
