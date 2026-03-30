import React from 'react';

interface Props {
  contractPrice: string;
  listPrice: string;
  loanAmount: string;           // ln 196 — what agent wrote
  earnestMoney: string;         // ln 176
  additionalEarnestMoney?: string; // ln 186 (optional)
  downPaymentPercent: string;   // ln 330 LTV-derived % (e.g. "3" for 97% LTV)
  downPaymentAmount: string;
  loanType?: string;            // conventional / fha / va / usda / cash
  clientAgentCommission: string;    // ln 207 $ amount
  clientAgentCommissionPct?: string; // ln 207 % (if available)
  sellerConcessions: string;    // ln 211
  sellerCredit?: string;
}

const LOAN_DP_DEFAULTS: Record<string, number> = {
  fha: 3.5,
  va: 0,
  usda: 0,
  conventional: 5,
  cash: 0,
  other: 0,
};

// ─── comparison row ───────────────────────────────────────────────────────────
// label | Contract Says (amber) | Should Be (green)
type RowStatus = 'mismatch' | 'match' | 'neutral';

const CompRow: React.FC<{
  label: string;
  leftVal: string;
  leftNote?: string;
  rightVal: string;
  rightNote?: string;
  status?: RowStatus;
  isTotal?: boolean;
  dim?: boolean;
}> = ({ label, leftVal, leftNote, rightVal, rightNote, status = 'neutral', isTotal = false, dim = false }) => {
  const base = isTotal ? 'border-t border-base-300 pt-1 mt-0.5 font-bold' : '';
  const leftColor =
    status === 'mismatch' ? 'text-red-600 font-bold' :
    status === 'match'    ? 'text-base-content font-semibold' :
                            dim ? 'text-base-content/40' : 'text-base-content/80';
  const rightColor =
    status === 'mismatch' ? 'text-green-700 font-bold' :
    status === 'match'    ? 'text-green-700 font-semibold' :
                            dim ? 'text-base-content/40' : 'text-base-content/80';

  return (
    <tr className={`${base} text-xs`}>
      {/* Label */}
      <td className={`py-1 pr-3 ${dim ? 'text-base-content/40' : 'text-base-content/60'} whitespace-nowrap`}>
        {label}
      </td>
      {/* Contract Says */}
      <td className={`py-1 px-2 text-right font-mono ${leftColor}`}>
        {leftVal}
        {leftNote && <span className="ml-1 text-[10px] text-base-content/40 font-sans">(ln {leftNote})</span>}
        {status === 'mismatch' && <span className="ml-1">⚠</span>}
      </td>
      {/* Should Be */}
      <td className={`py-1 pl-2 text-right font-mono ${rightColor}`}>
        {rightVal}
        {rightNote && <span className="ml-1 text-[10px] text-base-content/50 font-sans">{rightNote}</span>}
        {status === 'match' && <span className="ml-1 text-green-600">✓</span>}
      </td>
    </tr>
  );
};

// ─── divider row ──────────────────────────────────────────────────────────────
const SectionRow: React.FC<{ label: string }> = ({ label }) => (
  <tr>
    <td colSpan={3} className="pt-3 pb-0.5 text-[10px] font-bold text-amber-700 uppercase tracking-wide">
      {label}
    </td>
  </tr>
);

// ─── main component ───────────────────────────────────────────────────────────
const ContractReferencePanel: React.FC<Props> = ({
  contractPrice,
  listPrice,
  loanAmount,
  earnestMoney,
  additionalEarnestMoney = '',
  downPaymentPercent,
  downPaymentAmount,
  loanType = '',
  clientAgentCommission,
  clientAgentCommissionPct = '',
  sellerConcessions,
  sellerCredit = '',
}) => {
  const price   = parseFloat(contractPrice) || parseFloat(listPrice) || 0;
  const loan    = parseFloat(loanAmount) || 0;
  const em      = parseFloat(earnestMoney) || 0;
  const addlEM  = parseFloat(additionalEarnestMoney) || 0;
  const comm    = parseFloat(clientAgentCommission) || 0;
  const commPct = parseFloat(clientAgentCommissionPct) || 0;
  const conc    = parseFloat(sellerConcessions) || 0;
  const credit  = parseFloat(sellerCredit) || 0;

  // ── right-side down payment % ────────────────────────────────────────────
  const extractedDpPct  = parseFloat(downPaymentPercent) || 0;
  const loanTypeLower   = loanType.toLowerCase();
  const fallbackDpPct   = LOAN_DP_DEFAULTS[loanTypeLower] ?? 0;
  const rightDpPct      = extractedDpPct > 0 ? extractedDpPct : fallbackDpPct;
  const ltv             = 100 - rightDpPct;

  const dpLabel = extractedDpPct > 0
    ? `price × ${ltv.toFixed(0)}% LTV`
    : loanType
      ? `${loanType} default (${rightDpPct}% down)`
      : '';

  // ── LEFT: strictly what contract says ────────────────────────────────────
  const leftCertFunds    = price > 0 && loan > 0 ? price - em - addlEM - loan : 0;
  const leftTotalSeller  = comm + conc + credit;

  // ── RIGHT: independent calculations ──────────────────────────────────────
  const rightLoan        = price > 0 && rightDpPct >= 0 ? Math.round(price * (1 - rightDpPct / 100)) : 0;
  const rightDownPmt     = price > 0 && rightDpPct > 0 ? Math.round(price * rightDpPct / 100) : 0;
  const rightCertFunds   = rightDownPmt - em - addlEM;
  const rightComm        = commPct > 0 && price > 0 ? Math.round((commPct / 100) * price) : comm;
  const rightTotalSeller = rightComm + conc + credit;

  // ── mismatches ─────────────────────────────────────────────────────────
  const loanMismatch   = price > 0 && loan > 0 && rightLoan > 0 && Math.abs(loan - rightLoan) > 1;
  const certMismatch   = price > 0 && Math.abs(leftCertFunds - rightCertFunds) > 1;
  const commMismatch   = commPct > 0 && Math.abs(comm - rightComm) > 1;
  const totalMismatch  = Math.abs(leftTotalSeller - rightTotalSeller) > 1;
  const anyMismatch    = loanMismatch || certMismatch || commMismatch || totalMismatch;

  // ── formatters ────────────────────────────────────────────────────────
  const fmt = (n: number) =>
    n === 0 ? '—' :
    '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtSigned = (n: number, sign: '−' | '+') =>
    n > 0 ? sign + ' ' + fmt(n) : '—';

  return (
    <div className={`border rounded-lg p-3 text-xs ${
      anyMismatch ? 'border-red-200 bg-red-50/30' : 'border-amber-200 bg-amber-50/50'
    }`}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-amber-700 font-bold uppercase tracking-wide text-[10px]">
          📋 Heartland Contract — Check &amp; Balance
        </p>
        {anyMismatch
          ? <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">⚠ MISMATCH FOUND</span>
          : <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">✓ Numbers Match</span>
        }
      </div>

      {/* ── Table ── */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide">
            <th className="text-left pb-1.5 text-base-content/40 font-semibold w-[35%]"></th>
            <th className="text-right pb-1.5 pr-2 text-amber-700 font-bold w-[32%]">
              Left "Contract Says"
            </th>
            <th className="text-right pb-1.5 pl-2 text-green-700 font-bold w-[33%]">
              Right "Should Be"
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-base-200/40">

          {/* ── Section ①: Certified Funds ── */}
          <SectionRow label="① Certified Funds — ln 200" />

          <CompRow
            label="Purchase Price"
            leftVal={price > 0 ? fmt(price) : '—'}
            leftNote="164"
            rightVal={price > 0 ? fmt(price) : '—'}
          />
          <CompRow
            label="− Earnest Money"
            leftVal={fmtSigned(em, '−')}
            leftNote="176"
            rightVal={fmtSigned(em, '−')}
          />
          <CompRow
            label="− Add'l EM"
            leftVal={fmtSigned(addlEM, '−')}
            leftNote="186"
            rightVal={fmtSigned(addlEM, '−')}
            dim={addlEM === 0}
          />
          <CompRow
            label="− Loan Amount"
            leftVal={loan > 0 ? fmtSigned(loan, '−') : '—'}
            leftNote="196"
            rightVal={rightLoan > 0 ? fmtSigned(rightLoan, '−') : '—'}
            rightNote={dpLabel ? `(${dpLabel})` : undefined}
            status={loanMismatch ? 'mismatch' : 'neutral'}
          />
          <CompRow
            label="= Certified Funds"
            leftVal={leftCertFunds > 0 ? fmt(leftCertFunds) : '—'}
            leftNote="200"
            rightVal={rightCertFunds > 0 ? fmt(rightCertFunds) : '—'}
            rightNote={certMismatch ? '(correct)' : undefined}
            status={certMismatch ? 'mismatch' : price > 0 ? 'match' : 'neutral'}
            isTotal
          />

          {/* ── Section ②: Seller Expenses ── */}
          <SectionRow label="② Total Seller Expenses — ln 218" />

          <CompRow
            label="Buyer agent comp"
            leftVal={comm > 0 ? fmt(comm) : '—'}
            leftNote="207"
            rightVal={rightComm > 0 ? fmt(rightComm) : '—'}
            status={commMismatch ? 'mismatch' : 'neutral'}
          />
          <CompRow
            label="+ Add'l seller costs"
            leftVal={fmtSigned(conc, '+')}
            leftNote="211"
            rightVal={fmtSigned(conc, '+')}
          />
          {credit > 0 && (
            <CompRow
              label="+ Seller credit"
              leftVal={fmtSigned(credit, '+')}
              rightVal={fmtSigned(credit, '+')}
            />
          )}
          <CompRow
            label="= Total seller exp"
            leftVal={leftTotalSeller > 0 ? fmt(leftTotalSeller) : '—'}
            leftNote="218"
            rightVal={rightTotalSeller > 0 ? fmt(rightTotalSeller) : '—'}
            status={totalMismatch ? 'mismatch' : leftTotalSeller > 0 ? 'match' : 'neutral'}
            isTotal
          />

        </tbody>
      </table>

      {/* ── Mismatch callout box ── */}
      {loanMismatch && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 text-[10px] text-red-700 space-y-0.5">
          <p className="font-bold">⚠ Loan Amount Mismatch — Check line 196</p>
          <p>
            Contract ln 196: <strong>{fmt(loan)}</strong> &nbsp;·&nbsp;
            Expected ({rightDpPct.toFixed(rightDpPct % 1 === 0 ? 0 : 1)}% down on {fmt(price)}): <strong>{fmt(rightLoan)}</strong>
          </p>
          <p>Difference: <strong>{fmt(Math.abs(loan - rightLoan))}</strong></p>
        </div>
      )}

      {/* Down payment basis footnote */}
      {dpLabel && (
        <p className="mt-2 text-[10px] text-base-content/40 text-center">
          Right side using&nbsp;
          <span className="font-semibold text-green-700">
            {rightDpPct.toFixed(rightDpPct % 1 === 0 ? 0 : 1)}% down
            {extractedDpPct > 0 ? ` · from ln 330 LTV = ${ltv.toFixed(0)}%` : ` · ${loanType} default`}
          </span>
          {loanType && <span className="ml-1 capitalize">· {loanType}</span>}
        </p>
      )}

    </div>
  );
};

export default ContractReferencePanel;
