import React, { useState } from 'react';
import {
  Brain, Edit3, Target, Loader2, AlertCircle,
  TrendingDown, FileSearch, CheckCircle2, Zap,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function relDate(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldCorrection {
  field_key: string;
  count: number;
  sample_ai: string | null;
  sample_corrected: string | null;
}

interface RecentCorrection {
  id: string;
  deal_id: string;
  field_key: string;
  ai_value: string | null;
  corrected_value: string | null;
  created_at: string;
  deal_address: string;
}

interface LowConfField {
  field_name: string;
  avg_confidence: number;
  count: number;
}

// ─── Data Hooks ───────────────────────────────────────────────────────────────

function useAIStats() {
  return useQuery({
    queryKey: ['ai_extraction_stats'],
    queryFn: async () => {
      const [resultsRes, correctionsRes] = await Promise.all([
        supabase
          .from('extraction_results')
          .select('overall_confidence, field_count, high_confidence_count, low_confidence_count'),
        supabase
          .from('extraction_corrections')
          .select('field_key, ai_value, corrected_value'),
      ]);

      const results = resultsRes.data ?? [];
      const corrections = correctionsRes.data ?? [];

      const total = results.length;
      const avgConfidence =
        total > 0
          ? results.reduce((sum, r) => sum + (r.overall_confidence ?? 0), 0) / total
          : 0;

      // Top corrected fields
      const fieldCounts: Record<string, number> = {};
      corrections.forEach(c => {
        fieldCounts[c.field_key] = (fieldCounts[c.field_key] ?? 0) + 1;
      });
      const sorted = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]);
      const mostCorrectedField = sorted[0]?.[0] ?? null;

      const topFields: FieldCorrection[] = sorted.slice(0, 10).map(([field_key, count]) => {
        const sample = corrections.find(c => c.field_key === field_key);
        return {
          field_key,
          count,
          sample_ai: sample?.ai_value ?? null,
          sample_corrected: sample?.corrected_value ?? null,
        };
      });

      return { total, avgConfidence, totalCorrections: corrections.length, mostCorrectedField, topFields };
    },
  });
}

function useRecentCorrections() {
  return useQuery({
    queryKey: ['ai_recent_corrections'],
    queryFn: async (): Promise<RecentCorrection[]> => {
      const { data, error } = await supabase
        .from('extraction_corrections')
        .select(`
          id,
          deal_id,
          field_key,
          ai_value,
          corrected_value,
          created_at,
          deals!inner(property_address, city)
        `)
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.id,
        deal_id: row.deal_id,
        field_key: row.field_key,
        ai_value: row.ai_value,
        corrected_value: row.corrected_value,
        created_at: row.created_at,
        deal_address: row.deals
          ? `${row.deals.property_address ?? ''}${row.deals.city ? ', ' + row.deals.city : ''}`
          : 'Unknown Deal',
      }));
    },
  });
}

function useLowConfidenceFields() {
  return useQuery({
    queryKey: ['ai_low_confidence_fields'],
    queryFn: async (): Promise<LowConfField[]> => {
      const { data, error } = await supabase
        .from('extraction_field_scores')
        .select('field_name, confidence');

      if (error) throw error;

      const map: Record<string, { total: number; count: number }> = {};
      (data ?? []).forEach((r: any) => {
        if (!map[r.field_name]) map[r.field_name] = { total: 0, count: 0 };
        map[r.field_name].total += r.confidence ?? 0;
        map[r.field_name].count += 1;
      });

      return Object.entries(map)
        .map(([field_name, { total, count }]) => ({
          field_name,
          avg_confidence: total / count,
          count,
        }))
        .filter(f => f.avg_confidence < 0.80)
        .sort((a, b) => a.avg_confidence - b.avg_confidence)
        .slice(0, 10);
    },
  });
}

// ─── Confidence color ─────────────────────────────────────────────────────────

function confColor(n: number): string {
  if (n >= 0.9) return 'text-success';
  if (n >= 0.6) return 'text-warning';
  return 'text-error';
}

function confBar(n: number): string {
  if (n >= 0.9) return 'bg-success';
  if (n >= 0.6) return 'bg-warning';
  return 'bg-error';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AIExtractionTab() {
  const stats = useAIStats();
  const recent = useRecentCorrections();
  const lowConf = useLowConfidenceFields();

  const [recentExpanded, setRecentExpanded] = useState(true);

  const isLoading = stats.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-base-content/50">
        <Loader2 size={18} className="animate-spin" /> Loading AI analytics…
      </div>
    );
  }

  if (stats.isError) {
    return (
      <div className="flex items-center gap-2 bg-error/10 border border-error/30 rounded-xl px-4 py-3">
        <AlertCircle size={14} className="text-error" />
        <span className="text-xs text-error">Failed to load AI extraction data</span>
      </div>
    );
  }

  const d = stats.data!;
  const hasData = d.total > 0;

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain size={16} className="text-primary" />
        <div>
          <h2 className="text-sm font-bold text-base-content">AI Extraction Analytics</h2>
          <p className="text-xs text-base-content/50 mt-0.5">
            Track extraction accuracy, field confidence, and TC corrections over time.
          </p>
        </div>
      </div>

      {/* ── Stats Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-base-300 bg-base-100 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-base-content/50 text-xs font-medium">
            <FileSearch size={12} /> Total Extractions
          </div>
          <div className="text-2xl font-bold text-base-content">{d.total}</div>
          <div className="text-[10px] text-base-content/40">contracts processed by AI</div>
        </div>

        <div className="rounded-xl border border-base-300 bg-base-100 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-base-content/50 text-xs font-medium">
            <Target size={12} /> Avg Confidence
          </div>
          <div className={`text-2xl font-bold ${confColor(d.avgConfidence)}`}>
            {hasData ? pct(d.avgConfidence) : '—'}
          </div>
          <div className="text-[10px] text-base-content/40">across all extracted fields</div>
        </div>

        <div className="rounded-xl border border-base-300 bg-base-100 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-base-content/50 text-xs font-medium">
            <Edit3 size={12} /> TC Corrections
          </div>
          <div className="text-2xl font-bold text-base-content">{d.totalCorrections}</div>
          <div className="text-[10px] text-base-content/40">fields corrected after extraction</div>
        </div>

        <div className="rounded-xl border border-base-300 bg-base-100 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-base-content/50 text-xs font-medium">
            <Zap size={12} /> Most Corrected
          </div>
          <div className="text-sm font-bold text-base-content truncate mt-0.5">
            {d.mostCorrectedField ? toLabel(d.mostCorrectedField) : '—'}
          </div>
          <div className="text-[10px] text-base-content/40">highest correction frequency</div>
        </div>
      </div>

      {!hasData && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 border border-dashed border-base-300 rounded-xl text-base-content/40">
          <Brain size={32} className="opacity-30" />
          <p className="text-sm font-medium">No extractions yet</p>
          <p className="text-xs text-center max-w-xs">
            Upload a contract in the Deal Wizard to run your first AI extraction — analytics will appear here.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* ── Two-column: Top Corrected + Low Confidence ─────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Top Corrected Fields */}
            <div className="rounded-xl border border-base-300 bg-base-100 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Edit3 size={13} className="text-warning" />
                <h3 className="text-xs font-bold text-base-content">Most Corrected Fields</h3>
              </div>
              {d.topFields.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-base-content/40 py-4 justify-center">
                  <CheckCircle2 size={14} className="text-success" /> No corrections recorded yet
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {d.topFields.map(f => (
                    <div key={f.field_key} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-base-content truncate">
                          {toLabel(f.field_key)}
                        </div>
                        {(f.sample_ai || f.sample_corrected) && (
                          <div className="text-[10px] text-base-content/40 truncate">
                            {f.sample_ai ? `AI: "${f.sample_ai}"` : ''}
                            {f.sample_corrected ? ` → "${f.sample_corrected}"` : ''}
                          </div>
                        )}
                      </div>
                      <div className="badge badge-warning badge-xs shrink-0 font-mono">
                        ×{f.count}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Low Confidence Fields */}
            <div className="rounded-xl border border-base-300 bg-base-100 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <TrendingDown size={13} className="text-error" />
                <h3 className="text-xs font-bold text-base-content">Consistently Low Confidence</h3>
                <span className="text-[10px] text-base-content/40 ml-auto">&lt;80%</span>
              </div>

              {lowConf.isLoading && (
                <div className="flex items-center gap-2 text-xs text-base-content/40 py-4 justify-center">
                  <Loader2 size={12} className="animate-spin" /> Loading…
                </div>
              )}
              {!lowConf.isLoading && (lowConf.data ?? []).length === 0 && (
                <div className="flex items-center gap-2 text-xs text-base-content/40 py-4 justify-center">
                  <CheckCircle2 size={14} className="text-success" /> All fields scoring above 80%
                </div>
              )}
              {!lowConf.isLoading && (lowConf.data ?? []).length > 0 && (
                <div className="flex flex-col gap-2">
                  {lowConf.data!.map(f => (
                    <div key={f.field_name} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-base-content truncate">
                            {toLabel(f.field_name)}
                          </span>
                          <span className={`text-[10px] font-mono font-bold ${confColor(f.avg_confidence)} shrink-0 ml-2`}>
                            {pct(f.avg_confidence)}
                          </span>
                        </div>
                        <div className="w-full bg-base-300 rounded-full h-1">
                          <div
                            className={`h-1 rounded-full ${confBar(f.avg_confidence)}`}
                            style={{ width: pct(f.avg_confidence) }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-base-content/40 shrink-0">
                        {f.count}×
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Recent Corrections ─────────────────────────────────── */}
          <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-base-200 transition-colors"
              onClick={() => setRecentExpanded(e => !e)}
            >
              <div className="flex items-center gap-2">
                <Edit3 size={13} className="text-primary" />
                <span className="text-xs font-bold text-base-content">Recent TC Corrections</span>
                {recent.data && (
                  <span className="badge badge-ghost badge-xs">{recent.data.length}</span>
                )}
              </div>
              <span className="text-xs text-base-content/40">
                {recentExpanded ? '▲ collapse' : '▼ expand'}
              </span>
            </button>

            {recentExpanded && (
              <div className="border-t border-base-300">
                {recent.isLoading && (
                  <div className="flex items-center gap-2 text-xs text-base-content/40 py-6 justify-center">
                    <Loader2 size={12} className="animate-spin" /> Loading corrections…
                  </div>
                )}
                {!recent.isLoading && (recent.data ?? []).length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-base-content/40 py-6 justify-center">
                    <CheckCircle2 size={14} className="text-success" /> No corrections recorded yet
                  </div>
                )}
                {!recent.isLoading && (recent.data ?? []).length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="table table-xs w-full">
                      <thead>
                        <tr className="text-base-content/50 text-[10px] uppercase tracking-wide">
                          <th>Deal</th>
                          <th>Field</th>
                          <th>AI Said</th>
                          <th>TC Said</th>
                          <th className="text-right">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.data!.map(row => (
                          <tr key={row.id} className="hover:bg-base-200 transition-colors">
                            <td className="text-xs text-base-content/70 max-w-[140px] truncate">
                              {row.deal_address}
                            </td>
                            <td className="text-xs font-medium text-base-content">
                              {toLabel(row.field_key)}
                            </td>
                            <td className="text-xs text-error/80 max-w-[120px] truncate">
                              {row.ai_value || <span className="text-base-content/30 italic">empty</span>}
                            </td>
                            <td className="text-xs text-success max-w-[120px] truncate">
                              {row.corrected_value || <span className="text-base-content/30 italic">empty</span>}
                            </td>
                            <td className="text-right text-[10px] text-base-content/40 whitespace-nowrap">
                              {relDate(row.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
