import React from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, ChevronRight, FileText } from 'lucide-react';
import { FIELD_DEAL_MAP, fmtExtracted } from '../utils/contractExtraction';
import { EmptyState } from './ui/EmptyState';

interface StepExtractedDataProps {
  extractedData: Record<string, unknown> | null;
  onConfirm: () => void;   // user clicks "Looks Good, Continue"
  onEdit: () => void;      // user clicks "Edit Manually" — skip to next step
  onReExtract: () => void; // user clicks "Re-extract" — go back to upload
}

const StepExtractedData: React.FC<StepExtractedDataProps> = ({
  extractedData,
  onConfirm,
  onEdit,
  onReExtract,
}) => {
  // Check if there's any meaningful data
  const hasData = extractedData && Object.keys(extractedData).some(k => {
    const v = extractedData[k];
    return v !== null && v !== undefined && v !== '';
  });

  // Empty / null state
  if (!hasData) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <FileText size={18} className="text-base-content/40" />
          <h3 className="text-lg font-bold text-base-content">AI Extraction Review</h3>
        </div>
        <EmptyState
          icon={<AlertCircle size={32} />}
          title="No extraction data available"
          message="You can fill in the fields manually."
        />
        <div className="flex flex-col gap-2">
          <button
            onClick={onEdit}
            className="btn btn-primary btn-sm gap-1.5"
          >
            Continue Manually <ChevronRight size={14} />
          </button>
          <button
            onClick={onReExtract}
            className="btn btn-ghost btn-sm gap-1.5 text-base-content/60"
          >
            <RefreshCw size={14} /> Try uploading a contract
          </button>
        </div>
      </div>
    );
  }

  // Build rows from FIELD_DEAL_MAP keys + a few extra fields not in the map
  const extraKeys: { key: string; label: string }[] = [
    { key: 'address', label: 'Street Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'zipCode', label: 'ZIP Code' },
    { key: 'mlsNumber', label: 'MLS Number' },
    { key: 'buyerAgentName', label: "Buyer's Agent" },
    { key: 'sellerAgentName', label: "Seller's Agent" },
    { key: 'transactionType', label: 'Transaction Type' },
    { key: 'propertyType', label: 'Property Type' },
    { key: 'homeWarrantyCompany', label: 'Warranty Company' },
    { key: 'legalDescription', label: 'Legal Description' },
  ];

  // Combine FIELD_DEAL_MAP keys + extra keys, deduplicating
  const allKeys: { key: string; label: string }[] = [
    ...extraKeys,
    ...FIELD_DEAL_MAP.map(f => ({ key: f.key, label: f.label })).filter(
      f => !extraKeys.some(e => e.key === f.key)
    ),
  ];

  const rows = allKeys.map(({ key, label }) => {
    const raw = extractedData[key];
    let displayValue: string | null = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      if (typeof raw === 'boolean') {
        displayValue = raw ? 'Yes' : 'No';
      } else {
        displayValue = fmtExtracted(key, String(raw));
      }
    }
    return { key, label, displayValue };
  });

  const foundRows = rows.filter(r => r.displayValue !== null);
  const missingRows = rows.filter(r => r.displayValue === null);

  // Confidence — extract-deal returns confidence as 0.0-1.0 number; map to label
  const confidenceRaw = (extractedData as any)?.confidence;
  const confidence: string | undefined =
    confidenceRaw == null
      ? undefined
      : typeof confidenceRaw === 'string'
      ? confidenceRaw
      : typeof confidenceRaw === 'number'
      ? confidenceRaw >= 0.8 ? 'high' : confidenceRaw >= 0.5 ? 'medium' : 'low'
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <CheckCircle2 size={18} className="text-green-500" />
        <h3 className="text-lg font-bold text-base-content">AI Extraction Review</h3>
      </div>

      <p className="text-sm text-base-content/60">
        Here's what we found in your contract. Review and confirm before we pre-fill the form.
      </p>

      {/* Confidence badge */}
      {confidence && (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
          confidence === 'high'
            ? 'bg-green-100 text-green-700'
            : confidence === 'medium'
            ? 'bg-yellow-100 text-yellow-700'
            : 'bg-red-100 text-red-700'
        }`}>
          <span>{confidence === 'high' ? '✓' : confidence === 'medium' ? '~' : '!'}</span>
          <span>{confidence.charAt(0).toUpperCase() + confidence.slice(1)} confidence</span>
        </div>
      )}

      {/* Extracted fields table */}
      <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden">
        <div className="bg-base-200/60 px-4 py-2 border-b border-base-300 flex items-center justify-between">
          <p className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">
            Extracted Fields
          </p>
          <span className="text-xs text-base-content/40">
            {foundRows.length} found · {missingRows.length} not found
          </span>
        </div>
        <div className="divide-y divide-base-200 max-h-72 overflow-y-auto">
          {foundRows.map(({ key, label, displayValue }) => (
            <div key={key} className="flex items-start gap-3 px-4 py-2.5">
              <span className="text-xs text-base-content/50 w-40 flex-none pt-0.5 font-medium">{label}</span>
              <span className="text-sm text-base-content font-semibold flex-1 break-words">{displayValue}</span>
            </div>
          ))}
          {missingRows.map(({ key, label }) => (
            <div key={key} className="flex items-start gap-3 px-4 py-2.5">
              <span className="text-xs text-base-content/50 w-40 flex-none pt-0.5 font-medium">{label}</span>
              <span className="text-xs text-base-content/30 italic flex-1">Not found</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={onConfirm}
          className="btn btn-primary btn-sm gap-1.5"
        >
          <CheckCircle2 size={14} /> Looks Good, Continue
        </button>
        <button
          onClick={onEdit}
          className="btn btn-outline btn-sm gap-1.5"
        >
          Edit Manually <ChevronRight size={14} />
        </button>
        <button
          onClick={onReExtract}
          className="btn btn-ghost btn-sm gap-1.5 text-base-content/50"
        >
          <RefreshCw size={13} /> Re-extract from a different file
        </button>
      </div>
    </div>
  );
};

export default StepExtractedData;
