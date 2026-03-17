import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Sparkles, Bookmark, ChevronDown, Home, Users, CheckSquare, FileText, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { interpretSearchAI } from '../ai/apiClient';
import type { DealSearchQuery, SearchInterpretationResponse } from '../ai/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATE_SYNONYMS: Record<string, string[]> = {
  'kansas': ['ks', 'kansas'], 'ks': ['ks', 'kansas'],
  'missouri': ['mo', 'missouri'], 'mo': ['mo', 'missouri'],
  'kansas city': ['kansas city', 'kc'], 'kc': ['kc', 'kansas city'],
};

function expandTerms(term: string): string[] {
  const lower = term.toLowerCase().trim();
  return STATE_SYNONYMS[lower] ? [...new Set([lower, ...STATE_SYNONYMS[lower]])] : [lower];
}

function formatStage(stage: string): string {
  if (!stage) return 'Active';
  return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Saved Smart Views (localStorage) ──────────────────────────────────────────

interface SavedView {
  id: string;
  name: string;
  query: string;
  filters: DealSearchQuery;
  createdAt: string;
}

function loadSavedViews(): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem('tc_smart_views') || '[]');
  } catch { return []; }
}

function saveSavedViews(views: SavedView[]) {
  localStorage.setItem('tc_smart_views', JSON.stringify(views));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  type: 'deal' | 'contact' | 'task' | 'document';
  title: string;
  subtitle: string;
  meta?: string;
}

interface NaturalLanguageSearchBarProps {
  onSelectDeal: (id: string) => void;
  onSetView: (view: string) => void;
  onAISearch?: (filters: DealSearchQuery, explanation: string) => void;
}

// ── Filter Chip Labels ────────────────────────────────────────────────────────

function chipLabel(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  switch (key) {
    case 'stage':
      if (Array.isArray(value) && value.length > 0)
        return `Stage: ${(value as string[]).map(s => s.replace(/-/g, ' ')).join(', ')}`;
      return null;
    case 'closingDateRange': {
      const r = value as { start: string | null; end: string | null };
      if (!r.start && !r.end) return null;
      const parts: string[] = [];
      if (r.start) parts.push(`from ${r.start}`);
      if (r.end) parts.push(`to ${r.end}`);
      return `Closing ${parts.join(' ')}`;
    }
    case 'missingCompliance': return value ? 'Missing Compliance' : null;
    case 'overdueTasks': return value ? 'Overdue Tasks' : null;
    case 'participantRoleMissing':
      if (Array.isArray(value) && value.length > 0)
        return `Missing: ${(value as string[]).join(', ')}`;
      return null;
    case 'dealType':
      if (Array.isArray(value) && value.length > 0)
        return `Type: ${(value as string[]).join(', ')}`;
      return null;
    case 'staleDaysGreaterThan':
      return typeof value === 'number' ? `Stale > ${value} days` : null;
    case 'transactionType':
      if (Array.isArray(value) && value.length > 0)
        return `Side: ${(value as string[]).join(', ')}`;
      return null;
    case 'textSearch':
      return typeof value === 'string' && value ? `Text: "${value}"` : null;
    case 'hasAmberAlerts': return value ? 'Has Amber Alerts' : null;
    default: return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export const NaturalLanguageSearchBar: React.FC<NaturalLanguageSearchBarProps> = ({
  onSelectDeal,
  onSetView,
  onAISearch,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI search state
  const [aiMode, setAiMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<SearchInterpretationResponse | null>(null);
  const [filterChips, setFilterChips] = useState<Array<{ key: string; label: string }>>([]);
  const [aiMatchCount, setAiMatchCount] = useState<number | null>(null);

  // Saved views
  const [savedViews, setSavedViews] = useState<SavedView[]>(loadSavedViews);
  const [showSaved, setShowSaved] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const colorFor = (type: SearchResult['type']) => {
    if (type === 'deal') return 'bg-blue-50 text-blue-600';
    if (type === 'contact') return 'bg-green-50 text-green-600';
    if (type === 'task') return 'bg-purple-50 text-purple-600';
    return 'bg-orange-50 text-orange-600';
  };

  const iconFor = (type: SearchResult['type']) => {
    const cls = 'flex-none';
    if (type === 'deal') return <Home size={14} className={cls} />;
    if (type === 'contact') return <Users size={14} className={cls} />;
    if (type === 'task') return <CheckSquare size={14} className={cls} />;
    return <FileText size={14} className={cls} />;
  };

  const labelFor = (type: SearchResult['type']) => {
    if (type === 'deal') return 'Deal';
    if (type === 'contact') return 'Contact';
    if (type === 'task') return 'Task';
    return 'Document';
  };

  // ── Classic keyword search ──────────────────────────────────────────────────

  const runClassicSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const term = q.trim().toLowerCase();
    const terms = expandTerms(term);
    const collected: SearchResult[] = [];

    try {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, property_address, city, state, pipeline_stage, closing_date, deal_data')
        .limit(200);

      (deals ?? []).forEach((d: any) => {
        const extra = d.deal_data ?? {};
        const haystack = [
          d.property_address, d.city, d.state, d.pipeline_stage,
          extra.buyerName, extra.sellerName, extra.listingAgentName,
          extra.buyerAgentName, extra.lenderName, extra.titleCompanyName,
          JSON.stringify(extra),
        ].map(s => (s || '').toLowerCase()).join(' ');

        if (terms.some(t => haystack.includes(t))) {
          collected.push({
            id: d.id, type: 'deal',
            title: [d.property_address, d.city, d.state].filter(Boolean).join(', ') || 'Unknown',
            subtitle: formatStage(d.pipeline_stage),
            meta: d.closing_date ? `Closes ${new Date(d.closing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : undefined,
          });
        }
      });

      const { data: contacts } = await supabase
        .from('directory')
        .select('id, name, role, company, email')
        .or(`name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%,role.ilike.%${term}%`)
        .limit(5);

      (contacts ?? []).forEach((c: any) => {
        collected.push({
          id: c.id, type: 'contact',
          title: c.name ?? 'Unknown',
          subtitle: [c.role, c.company].filter(Boolean).join(' · ') || 'Contact',
          meta: c.email,
        });
      });

      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, deal_id')
        .ilike('title', `%${term}%`)
        .limit(5);

      (tasks ?? []).forEach((t: any) => {
        collected.push({
          id: t.deal_id ?? t.id, type: 'task',
          title: t.title ?? 'Task', subtitle: t.status ?? 'pending',
          meta: t.due_date ? `Due ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : undefined,
        });
      });

      const { data: docs } = await supabase
        .from('documents')
        .select('id, name, type, deal_id')
        .ilike('name', `%${term}%`)
        .limit(3);

      (docs ?? []).forEach((doc: any) => {
        collected.push({
          id: doc.deal_id ?? doc.id, type: 'document',
          title: doc.name ?? 'Document', subtitle: doc.type ?? 'document',
        });
      });
    } catch (err) {
      console.error('Search error:', err);
    }

    setResults(collected);
    setOpen(collected.length > 0 || q.length > 1);
    setActiveIndex(0);
    setLoading(false);
  }, []);

  // ── AI Search ───────────────────────────────────────────────────────────────

  const runAISearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setAiLoading(true);
    setAiResult(null);
    setFilterChips([]);
    setAiMatchCount(null);

    try {
      const interpretation = await interpretSearchAI(q);
      setAiResult(interpretation);

      // Build chips from interpreted query
      const chips: Array<{ key: string; label: string }> = [];
      const iq = interpretation.interpretedQuery;
      for (const [key, value] of Object.entries(iq)) {
        const label = chipLabel(key, value);
        if (label) chips.push({ key, label });
      }
      setFilterChips(chips);

      // Now run the actual filter against deals
      const { data: deals } = await supabase
        .from('deals')
        .select('id, property_address, city, state, pipeline_stage, closing_date, deal_data')
        .limit(500);

      const matched = filterDeals(deals ?? [], iq);
      setAiMatchCount(matched.length);

      const asResults: SearchResult[] = matched.slice(0, 20).map((d: any) => ({
        id: d.id, type: 'deal' as const,
        title: [d.property_address, d.city, d.state].filter(Boolean).join(', ') || 'Unknown',
        subtitle: formatStage(d.pipeline_stage),
        meta: d.closing_date ? `Closes ${new Date(d.closing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : undefined,
      }));

      setResults(asResults);
      setOpen(true);

      if (onAISearch) {
        onAISearch(iq, interpretation.explanation);
      }
    } catch (err) {
      console.error('AI search error:', err);
      // Fall back to classic search
      runClassicSearch(q);
    } finally {
      setAiLoading(false);
    }
  }, [onAISearch, runClassicSearch]);

  // ── Filter deals against DealSearchQuery ────────────────────────────────────

  function filterDeals(deals: any[], q: DealSearchQuery): any[] {
    return deals.filter(d => {
      const extra = d.deal_data ?? {};

      // stage
      if (q.stage && q.stage.length > 0) {
        const mapped: Record<string, string> = {
          'contract': 'contract', 'due-diligence': 'due_diligence', 'due_diligence': 'due_diligence',
          'clear-to-close': 'clear_to_close', 'clear_to_close': 'clear_to_close',
          'closed': 'closed', 'terminated': 'terminated',
        };
        const stages = q.stage.map(s => mapped[s] || s);
        const dealStage = (d.pipeline_stage || '').toLowerCase().replace(/-/g, '_');
        if (!stages.some(s => dealStage.includes(s.replace(/-/g, '_')))) return false;
      }

      // closingDateRange
      if (q.closingDateRange) {
        const cd = d.closing_date;
        if (!cd) return false;
        if (q.closingDateRange.start && cd < q.closingDateRange.start) return false;
        if (q.closingDateRange.end && cd > q.closingDateRange.end) return false;
      }

      // transactionType
      if (q.transactionType && q.transactionType.length > 0) {
        const side = (extra.transactionType || '').toLowerCase();
        if (!q.transactionType.some(s => side.includes(s))) return false;
      }

      // textSearch
      if (q.textSearch) {
        const text = q.textSearch.toLowerCase();
        const hay = [d.property_address, d.city, d.state, extra.agentName, extra.mlsNumber, JSON.stringify(extra)]
          .map(s => (s || '').toLowerCase()).join(' ');
        if (!hay.includes(text)) return false;
      }

      // dealType
      if (q.dealType && q.dealType.length > 0) {
        const pt = (extra.propertyType || '').toLowerCase();
        if (!q.dealType.some(t => pt.includes(t))) return false;
      }

      // staleDaysGreaterThan
      if (typeof q.staleDaysGreaterThan === 'number') {
        const updated = extra.updatedAt || d.updated_at;
        if (updated) {
          const daysSince = Math.floor((Date.now() - new Date(updated).getTime()) / 86400000);
          if (daysSince <= q.staleDaysGreaterThan) return false;
        }
      }

      return true;
    });
  }

  // ── Debounced search ────────────────────────────────────────────────────────

  useEffect(() => {
    if (aiMode) return; // AI search is triggered on Enter
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runClassicSearch(query), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, aiMode, runClassicSearch]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSaved(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Global shortcut
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

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (aiMode) {
        e.preventDefault();
        runAISearch(query);
        return;
      }
      if (open && results[activeIndex]) {
        handleSelect(results[activeIndex]);
        return;
      }
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Escape') { setOpen(false); setAiResult(null); setFilterChips([]); inputRef.current?.blur(); }
  };

  const handleSelect = (result: SearchResult) => {
    setQuery('');
    setOpen(false);
    setAiResult(null);
    setFilterChips([]);
    if (result.type === 'deal' || result.type === 'task' || result.type === 'document') {
      onSelectDeal(result.id);
    } else if (result.type === 'contact') {
      onSetView('contacts');
    }
  };

  // Toggle AI mode
  const toggleAiMode = () => {
    setAiMode(m => !m);
    setAiResult(null);
    setFilterChips([]);
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  // Remove a filter chip
  const removeChip = (key: string) => {
    if (!aiResult) return;
    const updated = { ...aiResult.interpretedQuery, [key]: null };
    setAiResult({ ...aiResult, interpretedQuery: updated });
    setFilterChips(chips => chips.filter(c => c.key !== key));
  };

  // Save current AI search as smart view
  const handleSaveView = () => {
    if (!saveName.trim() || !aiResult) return;
    const newView: SavedView = {
      id: Date.now().toString(36),
      name: saveName.trim(),
      query,
      filters: aiResult.interpretedQuery,
      createdAt: new Date().toISOString(),
    };
    const updated = [newView, ...savedViews];
    setSavedViews(updated);
    saveSavedViews(updated);
    setSaveModalOpen(false);
    setSaveName('');
  };

  // Load a saved view
  const loadSavedView = (view: SavedView) => {
    setQuery(view.query);
    setAiMode(true);
    setShowSaved(false);
    // Directly run with saved filters
    setAiResult({ interpretedQuery: view.filters, explanation: `Saved view: ${view.name}`, assumptions: [], warnings: [] });
    const chips: Array<{ key: string; label: string }> = [];
    for (const [key, value] of Object.entries(view.filters)) {
      const label = chipLabel(key, value);
      if (label) chips.push({ key, label });
    }
    setFilterChips(chips);
    // Run search with saved filters
    supabase.from('deals')
      .select('id, property_address, city, state, pipeline_stage, closing_date, deal_data')
      .limit(500)
      .then(({ data }) => {
        const matched = filterDeals(data ?? [], view.filters);
        setAiMatchCount(matched.length);
        setResults(matched.slice(0, 20).map((d: any) => ({
          id: d.id, type: 'deal' as const,
          title: [d.property_address, d.city, d.state].filter(Boolean).join(', ') || 'Unknown',
          subtitle: formatStage(d.pipeline_stage),
          meta: d.closing_date ? `Closes ${new Date(d.closing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : undefined,
        })));
        setOpen(true);
      });
  };

  const deleteSavedView = (id: string) => {
    const updated = savedViews.filter(v => v.id !== id);
    setSavedViews(updated);
    saveSavedViews(updated);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      {/* Search input row */}
      <div className="relative flex items-center gap-1">
        {/* AI toggle button */}
        <button
          onClick={toggleAiMode}
          title={aiMode ? 'Switch to keyword search' : 'Switch to AI search'}
          className={`flex-none w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
            aiMode
              ? 'bg-violet-500 text-white shadow-sm shadow-violet-200'
              : 'bg-base-200 text-base-content/40 hover:text-violet-500 hover:bg-violet-50'
          }`}
        >
          <Sparkles size={14} />
        </button>

        {/* Input */}
        <div className="relative flex-1 flex items-center">
          <Search size={14} className="absolute left-3 text-base-content/40 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (query) setOpen(true); }}
            onKeyDown={handleKeyDown}
            placeholder={aiMode ? 'Ask anything… "deals closing this week"' : 'Search deals, contacts, tasks…'}
            className={`input input-bordered input-sm w-full pl-8 pr-8 text-sm bg-base-100 focus:outline-none ${
              aiMode ? 'border-violet-300 focus:border-violet-400' : 'focus:border-primary'
            }`}
          />
          {query ? (
            <button
              onClick={() => { setQuery(''); setResults([]); setOpen(false); setAiResult(null); setFilterChips([]); inputRef.current?.focus(); }}
              className="absolute right-2 text-base-content/40 hover:text-base-content"
            >
              <X size={13} />
            </button>
          ) : (
            <kbd className="absolute right-2 kbd kbd-xs text-base-content/30 pointer-events-none">⌘K</kbd>
          )}
        </div>

        {/* Saved views button */}
        {savedViews.length > 0 && (
          <button
            onClick={() => setShowSaved(s => !s)}
            title="Saved smart views"
            className="flex-none w-8 h-8 rounded-lg flex items-center justify-center bg-base-200 text-base-content/40 hover:text-amber-500 hover:bg-amber-50 transition-all"
          >
            <Bookmark size={14} />
          </button>
        )}
      </div>

      {/* AI mode indicator + filter chips */}
      {aiMode && (filterChips.length > 0 || aiLoading) && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {aiLoading && (
            <span className="flex items-center gap-1 text-xs text-violet-500 font-medium">
              <Loader2 size={12} className="animate-spin" /> Interpreting…
            </span>
          )}
          {filterChips.map(chip => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-full text-xs font-medium"
            >
              {chip.label}
              <button onClick={() => removeChip(chip.key)} className="hover:text-violet-900">
                <X size={10} />
              </button>
            </span>
          ))}
          {aiResult && filterChips.length > 0 && (
            <>
              {aiMatchCount !== null && (
                <span className="text-xs text-base-content/50">{aiMatchCount} deal{aiMatchCount !== 1 ? 's' : ''} matched</span>
              )}
              <button
                onClick={() => setSaveModalOpen(true)}
                className="text-xs text-violet-500 hover:text-violet-700 font-medium flex items-center gap-0.5"
              >
                <Bookmark size={10} /> Save view
              </button>
            </>
          )}
        </div>
      )}

      {/* AI assumptions/warnings strip */}
      {aiResult && (aiResult.assumptions.length > 0 || aiResult.warnings.length > 0) && (
        <div className="mt-1 flex flex-wrap gap-1">
          {aiResult.assumptions.map((a, i) => (
            <span key={`a-${i}`} className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-full">
              ⚡ {a}
            </span>
          ))}
          {aiResult.warnings.map((w, i) => (
            <span key={`w-${i}`} className="text-xs px-1.5 py-0.5 bg-red-50 text-red-500 border border-red-200 rounded-full">
              ⚠️ {w}
            </span>
          ))}
        </div>
      )}

      {/* Saved views dropdown */}
      {showSaved && savedViews.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-[300] overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Saved Smart Views</span>
            <button onClick={() => setShowSaved(false)} className="text-gray-400 hover:text-gray-600">
              <X size={12} />
            </button>
          </div>
          <ul className="py-1 max-h-48 overflow-y-auto">
            {savedViews.map(v => (
              <li key={v.id} className="flex items-center px-3 py-2 hover:bg-gray-50 group">
                <button onClick={() => loadSavedView(v)} className="flex-1 text-left">
                  <div className="text-sm font-medium text-gray-900">{v.name}</div>
                  <div className="text-xs text-gray-400 truncate">{v.query}</div>
                </button>
                <button
                  onClick={() => deleteSavedView(v.id)}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-1"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Results dropdown */}
      {open && !showSaved && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-[300] overflow-hidden">
          {(loading || aiLoading) && (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-gray-400">
              <span className="loading loading-spinner loading-xs" />
              {aiLoading ? 'AI interpreting…' : 'Searching…'}
            </div>
          )}

          {!loading && !aiLoading && results.length === 0 && query.length > 1 && (
            <div className="py-4 px-4 text-sm text-gray-400 text-center">
              No results for &ldquo;{query}&rdquo;
              {!aiMode && (
                <button onClick={toggleAiMode} className="block mx-auto mt-2 text-violet-500 hover:text-violet-700 text-xs font-medium">
                  Try AI search →
                </button>
              )}
            </div>
          )}

          {!loading && !aiLoading && results.length > 0 && (
            <>
              <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {aiMode && aiResult ? aiResult.explanation : `${results.length} result${results.length !== 1 ? 's' : ''}`}
                </span>
                {aiMode && <span className="badge badge-xs bg-violet-100 text-violet-600 border-violet-200">AI</span>}
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
                        {iconFor(r.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{r.title}</div>
                        <div className="text-xs text-gray-400 truncate">{r.subtitle}</div>
                      </div>
                      <div className="flex-none flex items-center gap-2">
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

      {/* Save view modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-2xl w-80 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Save Smart View</h3>
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="e.g. Closings This Week"
              className="input input-bordered input-sm w-full mb-3"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveView(); }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSaveModalOpen(false)} className="btn btn-sm btn-ghost">Cancel</button>
              <button onClick={handleSaveView} className="btn btn-sm btn-primary" disabled={!saveName.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
