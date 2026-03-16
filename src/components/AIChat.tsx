import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Bot, User, Sparkles, Trash2, ArrowRight, MapPin, LayoutDashboard } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolsUsed?: boolean;
  navigateTo?: NavigateTo | null;
}

type NavigateTo =
  | { type: 'deal'; dealId: string; address: string; city?: string; state?: string }
  | { type: 'view'; view: string; label: string };

interface AIChatProps {
  onNavigateToDeal?: (dealId: string) => void;
  onSetView?: (view: string) => void;
}

const QUICK_ACTIONS = [
  { label: '📊 Deal Summary', prompt: 'Give me a summary of my active deals' },
  { label: '⏰ Due Today', prompt: 'What tasks are due today?' },
  { label: '🔴 Overdue', prompt: 'Show me all overdue tasks' },
  { label: '📅 Closing Soon', prompt: 'What deals are closing soon?' },
];

export const AIChat: React.FC<AIChatProps> = ({ onNavigateToDeal, onSetView }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleNavigate = (nav: NavigateTo) => {
    if (nav.type === 'deal' && onNavigateToDeal) {
      onNavigateToDeal(nav.dealId);
      setIsOpen(false);
    } else if (nav.type === 'view' && onSetView) {
      onSetView(nav.view);
      setIsOpen(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Build message history for context (last 10 messages)
      const history = [...messages.slice(-10), userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: data.reply || 'Sorry, I could not process that request.',
        timestamp: new Date(),
        toolsUsed: data.toolsUsed,
        navigateTo: data.navigateTo || null,
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Chat error:', err);
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        role: 'assistant',
        content: '⚠️ I had trouble connecting. Please check that the server is configured correctly and try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
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

  const clearChat = () => {
    setMessages([]);
  };

  const formatContent = (content: string) => {
    // Simple markdown-like formatting
    return content.split('\n').map((line, i) => {
      // Bold
      let formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Bullet points
      if (formatted.startsWith('- ') || formatted.startsWith('• ')) {
        return (
          <div key={i} className="flex gap-1.5 ml-2">
            <span className="text-primary flex-none mt-0.5">•</span>
            <span dangerouslySetInnerHTML={{ __html: formatted.replace(/^[-•]\s/, '') }} />
          </div>
        );
      }
      // Numbered lists
      const numMatch = formatted.match(/^(\d+)\.\s/);
      if (numMatch) {
        return (
          <div key={i} className="flex gap-1.5 ml-2">
            <span className="text-primary font-semibold flex-none">{numMatch[1]}.</span>
            <span dangerouslySetInnerHTML={{ __html: formatted.replace(/^\d+\.\s/, '') }} />
          </div>
        );
      }
      // Empty line
      if (!formatted.trim()) return <div key={i} className="h-2" />;
      // Regular text
      return <div key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  };

  const renderNavigateButton = (nav: NavigateTo) => {
    if (nav.type === 'deal') {
      return (
        <button
          onClick={() => handleNavigate(nav)}
          className="mt-3 flex items-center gap-2 w-full px-3 py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl text-primary text-xs font-semibold transition-all group"
        >
          <MapPin size={13} className="flex-none" />
          <span className="flex-1 text-left truncate">
            {nav.address}{nav.city ? `, ${nav.city}` : ''}{nav.state ? ` ${nav.state}` : ''}
          </span>
          <ArrowRight size={13} className="flex-none group-hover:translate-x-0.5 transition-transform" />
        </button>
      );
    }
    if (nav.type === 'view') {
      return (
        <button
          onClick={() => handleNavigate(nav)}
          className="mt-3 flex items-center gap-2 w-full px-3 py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-xl text-primary text-xs font-semibold transition-all group"
        >
          <LayoutDashboard size={13} className="flex-none" />
          <span className="flex-1 text-left">Open {nav.label}</span>
          <ArrowRight size={13} className="flex-none group-hover:translate-x-0.5 transition-transform" />
        </button>
      );
    }
    return null;
  };

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-50 w-14 h-14 bg-primary rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group"
          title="TC Command AI"
        >
          <Sparkles size={24} className="text-primary-content" />
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent rounded-full flex items-center justify-center">
            <span className="text-[9px] font-bold text-accent-content">AI</span>
          </span>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-5 right-5 z-50 w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-base-100 rounded-2xl shadow-2xl border border-base-300 flex flex-col overflow-hidden animate-in">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-primary text-primary-content flex-none">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Bot size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm leading-tight">TC Command AI</div>
              <div className="text-[10px] opacity-75 leading-tight">Your deal assistant • Powered by GPT-4o</div>
            </div>
            <button
              onClick={clearChat}
              className="btn btn-ghost btn-xs btn-square text-primary-content hover:bg-white/20"
              title="Clear chat"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="btn btn-ghost btn-xs btn-square text-primary-content hover:bg-white/20"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <Sparkles size={32} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-base-content text-lg">Hi! I'm TC Command AI 🧠</h3>
                  <p className="text-sm text-base-content/60 mt-1 max-w-[280px]">
                    I can help you manage deals, create tasks, look up contacts, draft emails, and more. Ask me to "show me" any deal and I'll take you right there!
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full max-w-[300px]">
                  {QUICK_ACTIONS.map((qa) => (
                    <button
                      key={qa.label}
                      onClick={() => sendMessage(qa.prompt)}
                      className="btn btn-sm btn-outline btn-primary rounded-xl text-xs font-medium normal-case h-auto py-2 px-3"
                    >
                      {qa.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-none ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-content'
                      : 'bg-secondary/20 text-secondary'
                  }`}
                >
                  {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-content rounded-tr-md'
                      : 'bg-base-200 text-base-content rounded-tl-md'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="space-y-1">{formatContent(msg.content)}</div>
                  ) : (
                    <div>{msg.content}</div>
                  )}

                  {/* Navigation button */}
                  {msg.role === 'assistant' && msg.navigateTo && renderNavigateButton(msg.navigateTo)}

                  {msg.toolsUsed && !msg.navigateTo && (
                    <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-base-300/30">
                      <Sparkles size={10} className="text-accent" />
                      <span className="text-[10px] opacity-60">Queried live data</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-none bg-secondary/20 text-secondary">
                  <Bot size={14} />
                </div>
                <div className="bg-base-200 rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-primary" />
                    <span className="text-sm text-base-content/60">Thinking...</span>
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
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about deals, or say 'show me Oak Trafficway'..."
                className="textarea textarea-bordered flex-1 min-h-[40px] max-h-[100px] text-sm resize-none rounded-xl leading-snug"
                rows={1}
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="btn btn-primary btn-sm btn-square rounded-xl flex-none"
              >
                <Send size={14} />
              </button>
            </div>
            <div className="text-[10px] text-base-content/40 mt-1.5 text-center">
              Press Enter to send • Shift+Enter for new line
            </div>
          </div>
        </div>
      )}

      <style>{`
        .animate-in {
          animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
};
