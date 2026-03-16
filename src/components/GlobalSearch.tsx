import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Home, Users, CheckSquare, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const term = q.trim().toLowerCase();
    const terms = expandTerms(term);
    const collected: SearchResult[] = [];

    try {
      // ── Deals: fetch all, filter client-side across all fields ──────
      const { data: deals, error: dealErr } = await supabase
        .from('deals')
        .select('id, property_address, city, state, pipeline_stage, closing_date, deal_data')
        .limit(200);

      if (dealErr) console.error('Deal search error:', dealErr);

      (deals ?? []).forEach((d: any) => {
        const extra = d.deal_data ?? {};
        const haystack = [
          (d.property_address || '').toLowerCase(),
          (d.city || '').toLowerCase(),
          (d.state || '').toLowerCase(),
          (d.pipeline_stage || '').toLowerCase(),
          (extra.buyerName || '').toLowerCase(),
          (extra.sellerName || '').toLowerCase(),
          (extra.listingAgentName || '').toLowerCase(),
          (extra.buyerAgentName || '').toLowerCase(),
          (extra.lenderName || '').toLowerCase(),
          (extra.titleCompanyName || '').toLowerCase(),
          JSON.stringify(extra).toLowerCase(),
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

      // ── Contacts (directory table) ────────────────────────────────────
      const { data: contacts, error: contactErr } = await supabase
        .from('directory')
        .select('id, name, role, company, email, phone')
        .or(`name.ilike.%${term}%,company.ilike.%${term}%,email.ilike.%${term}%,role.ilike.%${term}%`)
        .limit(5);

      if (contactErr) console.error('Contact search error:', contactErr);

      (contacts ?? []).forEach((c: any) => {
        collected.push({
          id: c.id,
          type: 'contact',
          title: c.name ?? 'Unknown',
          subtitle: [c.role, c.company].filter(Boolean).join(' · ') || 'Contact',
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
  }, []);

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
            onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus(); }}
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
          {loading && (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-gray-400">
              <span className="loading loading-spinner loading-xs" />
              Searching…
            </div>
          )}

          {!loading && results.length === 0 && query.length > 1 && (
            <div className="py-4 px-4 text-sm text-gray-400 text-center">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {!loading && results.length > 0 && (
            <>
              <div className="px-3 py-1.5 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </span>
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
