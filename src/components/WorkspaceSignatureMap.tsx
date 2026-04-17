import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface SignatureField {
  field_key: string;
  page_num: number;
  detected: boolean;
  confidence: number;
  party: string | null;
}

interface SignatureResult {
  platform: 'docusign' | 'dotloop' | 'wetink' | 'unknown';
  fields: SignatureField[];
  allSigned: boolean;
  missingCount: number;
  passedCount: number;
  summary: string;
}

interface Props {
  deal: any;
}

// Map deal state → form_slug in field_coordinates table
const FORM_SLUG_MAP: Record<string, string> = {
  KS: 'residential-sale-contract',
  MO: 'residential-sale-contract',
};

const PLATFORM_LABELS: Record<string, string> = {
  docusign: '📋 DocuSign',
  dotloop: '🔵 DotLoop',
  wetink: '✍️ Wet Ink',
  unknown: '❓ Unknown Platform',
};

export function WorkspaceSignatureMap({ deal }: Props) {
  const [result, setResult] = useState<SignatureResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formSlug = FORM_SLUG_MAP[deal.state] || 'residential-sale-contract';

  // Fetch the deal's source-of-truth contract document
  const { data: contractDoc } = useQuery({
    queryKey: ['signature-contract-doc', deal.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('deal_documents')
        .select('id, file_name, storage_url, document_type')
        .eq('deal_id', deal.id)
        .eq('is_source_of_truth', true)
        .not('storage_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return data;
    },
  });

  const runSignatureCheck = async () => {
    if (!contractDoc?.storage_url) {
      setError('No source-of-truth contract found. Upload the contract and mark it as source of truth in the Documents tab.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      // 1. Fetch the PDF from Supabase storage
      const resp = await fetch(contractDoc.storage_url);
      if (!resp.ok) throw new Error(`Failed to fetch contract PDF (${resp.status})`);
      const blob = await resp.blob();

      // 2. Convert blob to base64 string
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const r = reader.result as string;
          resolve(r.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // 3. Call AI signature-check action
      const res = await fetch('/api/ai?action=signature-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dealId: deal.id,
          formSlug,
          fileBase64: base64,
          fileName: contractDoc.file_name || 'contract.pdf',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Signature check failed (${res.status})`);
      }
      const data: SignatureResult = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Signature check failed');
    } finally {
      setChecking(false);
    }
  };

  // Group result fields by page number for display
  const byPage = result?.fields.reduce((acc, f) => {
    const key = f.page_num;
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {} as Record<number, SignatureField[]>) || {};

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base-content">Signature Map</h3>
          <p className="text-sm text-base-content/60">
            AI-verified signature & initial positions ·{' '}
            <span className="font-mono text-xs bg-base-200 px-1 rounded">{formSlug}</span>
          </p>
        </div>
        <button
          className="btn btn-sm btn-primary"
          onClick={runSignatureCheck}
          disabled={checking || !contractDoc}
        >
          {checking ? (
            <><span className="loading loading-spinner loading-xs" /> Checking…</>
          ) : (
            '🔍 Run Signature Check'
          )}
        </button>
      </div>

      {/* No contract warning */}
      {!contractDoc && (
        <div className="alert alert-warning text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>No source-of-truth contract document found. Upload the contract and mark it as source of truth in the Documents tab.</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-error text-sm">
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="bg-base-200 rounded-xl p-4 flex flex-wrap gap-3 items-center">
            <span className="badge badge-ghost text-xs">{PLATFORM_LABELS[result.platform]}</span>
            <span className={`badge text-xs ${result.allSigned ? 'badge-success' : 'badge-error'}`}>
              {result.allSigned ? '✅ All Signed' : `🔴 ${result.missingCount} Missing`}
            </span>
            {result.passedCount > 0 && (
              <span className="badge badge-success text-xs">✅ {result.passedCount} Present</span>
            )}
            <span className="text-sm text-base-content/70 flex-1 min-w-[200px]">{result.summary}</span>
          </div>

          {/* Per-page breakdown */}
          {Object.entries(byPage)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([pageNum, fields]) => (
              <div key={pageNum} className="border border-base-300 rounded-xl overflow-hidden">
                <div className="bg-base-200 px-4 py-2 text-sm font-semibold text-base-content/80">
                  Page {pageNum}
                  <span className="ml-2 text-xs font-normal text-base-content/50">
                    {fields.filter(f => f.detected).length}/{fields.length} signed
                  </span>
                </div>
                <div className="divide-y divide-base-200">
                  {fields.map(f => (
                    <div key={`${f.field_key}-${f.page_num}`} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-base">{f.detected ? '✅' : '🔴'}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-base-content capitalize">
                          {f.field_key.replace(/_/g, ' ')}
                        </span>
                        {f.party && (
                          <span className="text-xs text-base-content/40 ml-2">({f.party})</span>
                        )}
                      </div>
                      <span className={`badge badge-xs ${f.detected ? 'badge-success' : 'badge-error'}`}>
                        {f.detected ? 'Signed' : 'Missing'}
                      </span>
                      <span className="text-xs text-base-content/30 w-16 text-right tabular-nums">
                        {Math.round(f.confidence * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Empty state */}
      {!result && !checking && contractDoc && (
        <div className="text-center py-10 text-base-content/40">
          <div className="text-4xl mb-2">📝</div>
          <p className="text-sm">Click "Run Signature Check" to verify all signature and initial positions</p>
          <p className="text-xs mt-1 text-base-content/30">Uses GPT-4o Vision — checks every mapped signature position in the contract</p>
        </div>
      )}
    </div>
  );
}
