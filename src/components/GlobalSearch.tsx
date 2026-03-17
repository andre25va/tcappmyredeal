import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Home, Users, CheckSquare, FileText, Brain, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { interpretSearchAI } from '../ai/apiClient';

// NL trigger words for AI search detection
const NL_TRIGGER_WORDS = ['show', 'find', 'which', 'files', 'closing', 'missing', 'overdue', 'stale', 'at risk', 'problem', 'where', 'who', 'what', 'list', 'get', 'all', 'any', 'deals with', 'need', 'pending'];

function looksLikeNaturalLanguage(q: string): boolean {
  const lower = q.toLowerCase().trim();
  return NL_TRIGGER_WORDS.some(w => lower.includes(w));
}

// Map full state names / cities to abbreviations (and vice versa)
const STATE_SYNONYMS: Record<string, string[]> = {
  'kansas': ['ks', 'kansas'],
  'ks': ['ks', 'kansas'],
  'missouri': ['mo', 'missouri'],
  'mo': ['mo', 'missouri'],
  'overland park': ['overland park'],
  'leawood': ['leawood'],
  'topeka': ['topeka'],
  'kansas city': ['kansas city', 'kc'],
  'kc': ['kc', 'kansas city'],
};

function expandTerms(term: string): string[] {
  const lower = term.toLowerCase().trim();
  const synonyms = STATE_SYNONYMS[lower];
  if (synonyms) return [...new Set([lower, ...synonyms])];
  return [lower];
}

function formatStage(stage: string): string {
  if (!stage) return 'Active';
  return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface SearchResult {
  id: string;
  type: 'deal' | 'contact' | 'task' | 'document';
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  meta?: string;
  aiInterpreted?: boolean;
}

interface GlobalSearchProps {
  onSelectDeal: (id: string) => void;
  onSetView: (view: string) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ onSelectDeal, onSetView }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI search state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiAssumptions, setAiAssumptions] = useState<string[]>([]);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [showAiOption, setShowAiOption] = useState(false);

  const iconFor = (type: SearchResult['type']) => {
    const cls = 'flex-none';
    if (type === 'deal') return <Home size={14} className={cls} />;
    if (type === 'contact') return <Users size={14} className={cls} />;
    if (type === 'task') return <CheckSquare size={14} className={cls} />;
    return <FileText size={14} className={cls} />;
  };

  const colorFor = (type: SearchResult['type']) => {
    if (type === 'deal') return 'bg-blue-50 text-blue-600';
    if (type === 'contact') return 'bg-green-50 text-green-600';
    if (type === 'task') return 'bg-purple-50 text-purple-600';
    return 'bg-orange-50 text-orange-600';
  };

  const labelFor = (type: SearchResult['type']) => {
    if (type === 'deal') return 'Deal';
    if (type === 'contact') return 'Contact';
    if (type === 'task') return 'Task';
    return 'Document';
  };

  const clearAiState = () => {
    setAiExplanation(null);
    setAiAssumptions([]);
    setAiWarnings([]);
    setShowAiOption(false);
  };

  const runAISearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 3) return;
    setAiLoading(true);
    clearAiState();

    try {
      const aiResponse = await interpretSearchAI(q.trim());
      setAiExplanation(aiResponse.explanation);
      setAiAssumptions(aiResponse.assumptions);
      setAiWarnings(aiResponse.warnings);

      const filters = aiResponse.interpretedQuery;
      let dbQuery = supabase
        .from('deals')
        .select('id, property_address, city, state, pipeline_stage, closing_date, mls_number, transaction_type, agent_name');

      if (filters.stage && filters.stage.length > 0) {
        dbQuery = dbQuery.in('pipeline_stage', filters.stage);
      }
      if (filters.closingDateRange) {
        if (filters.closingDateRange.start) {
          dbQuery = dbQuery.gte('closing_date', filters.closingDateRange.start);
        }
        if (filters.closingDateRange.end) {
          dbQuery = dbQuery.lte('closing_date', filters.closingDateRange.end);
        }
      }
      if (filters.transactionType && filters.transactionType.length > 0) {
        dbQuery = dbQuery.in('transaction_type', filters.transactionType);
      }
      if (filters.textSearch) {
        const t = filters.textSearch;
        dbQuery = dbQuery.or(`property_address.ilike.%${t}%,agent_name.ilike.%${t}%,mls_number.ilike.%${t}%`);
      }

      dbQuery = dbQuery.limit(20);

      const { data: deals, error } = await dbQuery;
      if (error) {
        console.error('AI search query error:', error);
      }

      const aiResults: SearchResult[] = (deals ?? []).map((d: any) => ({
        id: d.id,
        type: 'deal' as const,
        title: [d.property_address, d.city, d.state].filter(Boolean).join(', ') || 'Unknown address',
        subtitle: formatStage(d.pipeline_stage),
        icon: iconFor('deal'),
        meta: d.closing_date
          ? `Closes ${new Date(d.closing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : undefined,
        aiInterpreted: true,
      }));

      setResults(aiResults);
      setOpen(true);
      setActiveIndex(0);
    } catch (err: any) {
      console.error('AI search error:', err);
      setAiWarnings([err.message || 'AI search failed']);
    } finally {
      setAiLoading(false);
    }
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) { setResults([]); setOpen(false); clearAiState(); return; }
    setLoading(true);
    clearAiState();
    const term = q.trim().toLowerCase();
    const terms = expandTerms(term);
    const collected: SearchResult[] = [];

    try {
      // ── Deals: fetch all, filter client-side across all fields ──────
      const { data: deals, error: dealErr } = await supabase
        .from('deals')
        .select('id, property_address, city, state, pipeline_stage, closing_date, mls_number, contract_price, transaction_type, agent_name, listing_agent_name, selling_agent_name')
        .limit(200);

      if (dealErr) console.error('Deal search error:', dealErr);

      (deals ?? []).forEach((d: any) => {
        const haystack = [
          (d.property_address || '').toLowerCase(),
          (d.city || '').toLowerCase(),
          (d.state || '').toLowerCase(),
          (d.pipeline_stage || '').toLowerCase(),
          (d.agent_name || '').toLowerCase(),
          (d.listing_agent_name || '').toLowerCase(),
          (d.selling_agent_name || '').toLowerCase(),
          (d.mls_number || '').toLowerCase(),
        ].join(' ');

        const matches = terms.some(t => haystack.includes(t));
        if (matches) {
          const displayAddr = [
            d.property_address,
            d.city,
            d.state,
          ].filter(Boolean).join(', ');

          collected.push({
            id: d.id,
            type: 'deal',
            title: displayAddr || 'Unknown address',
            subtitle: formatStage(d.pipeline_stage),
            icon: iconFor('deal'),
            meta: d.closing_date
              ? `Closes ${new Date(d.closing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : undefined,
          });
        }
      });

      // ── Contacts ────────────────────────────────────────────────────
      const { data: contacts, error: contactErr } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, contact_type, email, phone, company')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%,contact_type.ilike.%${term}%`)
        .limit(5);

      if (contactErr) console.error('Contact search error:', contactErr);

      (contacts ?? []).forEach((c: any) => {
        collected.push({
          id: c.id,
          type: 'contact',
          title: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
          subtitle: [c.contact_type, c.company].filter(Boolean).join(' · ') || 'Contact',
          icon: iconFor('contact'),
          meta: c.email,
        });
      });

      // ── Tasks ────────────────────────────────────────────────────
      const { data: tasks, error: taskErr } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, deal_id')
        .ilike('title', `%${term}%`)
        .limit(5);

      if (taskErr) console.error('Task search error:', taskErr);

      (tasks ?? []).forEach((t: any) => {
        collected.push({
          id: t.deal_id ?? t.id,
          type: 'task',
          title: t.title ?? 'Task',
          subtitle: t.status ?? 'pending',
          icon: iconFor('task'),
          meta: t.due_date
            ? `Due ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : undefined,
        });
      });

      // ── Documents ────────────────────────────────────────────────
      const { data: docs, error: docErr } = await supabase
        .from('documents')
        .select('id, name, type, deal_id')
        .ilike('name', `%${term}%`)
        .limit(3);

      if (docErr) console.error('Document search error:', docErr);

      (docs ?? []).forEach((doc: any) => {
        collected.push({
          id: doc.deal_id ?? doc.id,
          type: 'document',
          title: doc.name ?? 'Document',
          subtitle: doc.type ?? 'document',
          icon: iconFor('document'),
        });
      });

    } catch (err) {
      console.error('Search error:', err);
    }

    setResults(collected);
    setOpen(collected.length > 0 || q.length > 1);
    setActiveIndex(0);
    setLoading(false);

    // Show AI option if NL query detected, or auto-trigger if no results
    const isNL = looksLikeNaturalLanguage(q);
    if (collected.length === 0 && q.trim().length > 5) {
      runAISearch(q);
    } else if (isNL && collected.length > 0) {
      setShowAiOption(true);
    }
  }, [runAISearch]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIndex]) { handleSelect(results[activeIndex]); }
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };

  const handleSelect = (result: SearchResult) => {
    setQuery('');
    setOpen(false);
    clearAiState();
    if (result.type === 'deal' || result.type === 'task' || result.type === 'document') {
      onSelectDeal(result.id);
    } else if (result.type === 'contact') {
      onSetView('contacts');
    }
  };

  // Global shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      {/* Search input */}
      <div className="relative flex items-center">
        <Search size={14} className="absolute left-3 text-base-content/40 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search deals, contacts, tasks…"
          className="input input-bordered input-sm w-full pl-8 pr-8 text-sm bg-base-100 focus:outline-none focus:border-primary"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); clearAiState(); inputRef.current?.focus(); }}
            className="absolute right-2 text-base-content/40 hover:text-base-content"
          >
            <X size={13} />
          </button>
        )}
        {!query && (
          <kbd className="absolute right-2 kbd kbd-xs text-base-content/30 pointer-events-none">⌘K</kbd>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-[300] overflow-hidden">
          {(loading || aiLoading) && (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-gray-400">
              <span className="loading loading-spinner loading-xs" />
              {aiLoading ? 'AI is interpreting your search…' : 'Searching…'}
            </div>
          )}

          {/* AI explanation header */}
          {aiExplanation && !aiLoading && (
            <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100">
              <div className="flex items-center gap-1.5 mb-1">
                <Brain size={12} className="text-indigo-600" />
                <span className="text-xs font-semibold text-indigo-700">AI Interpreted</span>
              </div>
              <p className="text-xs text-indigo-600">{aiExplanation}</p>
              {aiAssumptions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {aiAssumptions.map((a, i) => (
                    <span key={i} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">{a}</span>
                  ))}
                </div>
              )}
              {aiWarnings.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {aiWarnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-1 text-[10px] text-amber-600">
                      <AlertTriangle size={10} />
                      {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && !aiLoading && results.length === 0 && query.length > 1 && !aiExplanation && (
            <div className="py-4 px-4 text-sm text-gray-400 text-center">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {!loading && !aiLoading && results.length > 0 && (
            <>
              <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </span>
                {showAiOption && !aiExplanation && (
                  <button
                    onClick={() => runAISearch(query)}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    <Brain size={11} />
                    Try AI Search
                  </button>
                )}
              </div>
              <ul className="py-1 max-h-72 overflow-y-auto">
                {results.map((r, i) => (
                  <li key={`${r.type}-${r.id}-${i}`}>
                    <button
                      onClick={() => handleSelect(r)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        i === activeIndex ? 'bg-primary/10' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-none ${colorFor(r.type)}`}>
                        {r.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{r.title}</div>
                        <div className="text-xs text-gray-400 truncate">{r.subtitle}</div>
                      </div>
                      <div className="flex-none flex items-center gap-2">
                        {r.aiInterpreted && (
                          <span className="badge badge-xs bg-indigo-50 text-indigo-600 font-medium">AI</span>
                        )}
                        {r.meta && <span className="text-xs text-gray-400">{r.meta}</span>}
                        <span className={`badge badge-xs font-medium ${colorFor(r.type)}`}>
                          {labelFor(r.type)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};
