import React from 'react';

interface Props {
  contractPrice: string;
  listPrice: string;
  loanAmount: string;           // ln 196 — what agent wrote
  earnestMoney: string;         // ln 176
  additionalEarnestMoney?: string; // ln 186
  downPaymentPercent: string;   // ln 330 LTV-derived % (e.g. "3" for 97% LTV)
  downPaymentAmount: string;
  loanType?: string;            // conventional / fha / va / usda / cash
  clientAgentCommission: string;     // ln 207 $ amount
  clientAgentCommissionPct?: string; // ln 207 % if available
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

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n === 0 ? '—' : '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

const fmtSigned = (n: number, sign: '−' | '+') =>
  n > 0 ? sign + fmt(n) : '—';

// ─── single comparison row ───────────────────────────────────────────────────
const Row: React.FC<{
  label: string;
  lineNo?: string;
  contractVal: string;
  correctVal: string;
  mismatch?: boolean;       // contract side is wrong
  match?: boolean;          // both match, highlight green
  isTotal?: boolean;
  dim?: boolean;
}> = ({ label, lineNo, contractVal, correctVal, mismatch = false, match = false, isTotal = false, dim = false }) => {
  const rowCls = isTotal ? 'border-t border-base-300' : '';
  const labelCls = dim ? 'text-base-content/35' : 'text-base-content/60';
  const lnCls = 'text-base-content/35 font-normal';

  const contractCls = mismatch
    ? 'text-red-600 font-bold'
    : dim
    ? 'text-base-content/35'
    : isTotal
    ? 'font-bold text-base-content'
    : 'text-base-content/80';

  const correctCls = mismatch
    ? 'text-green-700 font-bold'
    : match
    ? 'text-green-700 font-semibold'
    : dim
    ? 'text-base-content/35'
    : isTotal
    ? 'font-bold text-base-content'
    : 'text-base-content/80';

  return (
    <tr className={rowCls}>
      {/* Label + line number */}
      <td className={`py-1 pr-2 text-xs ${labelCls} whitespace-nowrap`}>
        {label}
        {lineNo && <span className={`ml-1 text-[10px] ${lnCls}`}>(ln {lineNo})</span>}
      </td>

      {/* Contract Says */}
      <td className={`py-1 px-3 text-right font-mono text-xs ${contractCls}`}>
        {contractVal}
        {mismatch && <span className="ml-1 text-red-500">⚠</span>}
      </td>

      {/* Should Be */}
      <td className={`py-1 pl-3 text-right font-mono text-xs ${correctCls}`}>
        {correctVal}
        {mismatch && <span className="ml-1 text-green-600">✓</span>}
        {match && !mismatch && <span className="ml-1 text-green-500">✓</span>}
      </td>
    </tr>
  );
};

// ─── section header row ──────────────────────────────────────────────────────
const Section: React.FC<{ label: string }> = ({ label }) => (
  <tr>
    <td colSpan={3} className="pt-3 pb-1 text-[10px] font-bold text-amber-700 uppercase tracking-widest">
      {label}
    </td>
  </tr>
);

// ─── main component ──────────────────────────────────────────────────────────
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

  // ── right-side down payment % ─────────────────────────────────────────────
  const extractedDpPct = parseFloat(downPaymentPercent) || 0;
  const loanTypeLower  = loanType.toLowerCase();
  const fallbackDpPct  = LOAN_DP_DEFAULTS[loanTypeLower] ?? 5;
  const rightDpPct     = extractedDpPct > 0 ? extractedDpPct : fallbackDpPct;
  const ltv            = 100 - rightDpPct;

  const dpSource = extractedDpPct > 0
    ? `${rightDpPct}% down · from ln 330 (LTV ${ltv.toFixed(0)}%)`
    : loanType
    ? `${rightDpPct}% down · ${loanType} default`
    : `${rightDpPct}% down`;

  // ── LEFT: strictly what contract says ────────────────────────────────────
  const leftCertFunds   = price > 0 && loan > 0 ? price - em - addlEM - loan : 0;
  const leftTotalSeller = comm + conc + credit;

  // ── RIGHT: independent calculation from first principles ─────────────────
  const rightLoan        = price > 0 ? Math.round(price * (ltv / 100)) : 0;
  const rightDownPmt     = price > 0 ? Math.round(price * (rightDpPct / 100)) : 0;
  const rightCertFunds   = rightDownPmt - em - addlEM;
  const rightComm        = commPct > 0 && price > 0 ? Math.round((commPct / 100) * price) : comm;
  const rightTotalSeller = rightComm + conc + credit;

  // ── mismatches ────────────────────────────────────────────────────────────
  const loanMismatch  = loan > 0 && rightLoan > 0 && Math.abs(loan - rightLoan) > 1;
  const certMismatch  = price > 0 && Math.abs(leftCertFunds - rightCertFunds) > 1;
  const commMismatch  = commPct > 0 && Math.abs(comm - rightComm) > 1;
  const totalMismatch = Math.abs(leftTotalSeller - rightTotalSeller) > 1;
  const anyMismatch   = loanMismatch || certMismatch || commMismatch || totalMismatch;

  return (
    <div className={`rounded-lg border text-xs ${
      anyMismatch ? 'border-red-200 bg-red-50/20' : 'border-amber-200 bg-amber-50/30'
    } p-3`}>

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">
          📋 Heartland Contract — Check &amp; Balance
        </span>
        {anyMismatch
          ? <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">⚠ Mismatch Found</span>
          : <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ Numbers Match</span>
        }
      </div>

      {/* ── Table ── */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-base-300">
            <th className="text-left pb-1.5 text-[10px] font-semibold text-base-content/40 uppercase tracking-wide w-[42%]">
              Line Item
            </th>
            <th className="text-right pb-1.5 px-3 text-[10px] font-bold text-amber-700 uppercase tracking-wide w-[29%]">
              Contract Says
            </th>
            <th className="text-right pb-1.5 pl-3 text-[10px] font-bold text-green-700 uppercase tracking-wide w-[29%]">
              Should Be
            </th>
          </tr>
        </thead>
        <tbody>

          {/* ─ Section ①: Certified Funds ─ */}
          <Section label="① Certified Funds — ln 200" />

          <Row
            label="Purchase Price"
            lineNo="164"
            contractVal={price > 0 ? fmt(price) : '—'}
            correctVal={price > 0 ? fmt(price) : '—'}
          />
          <Row
            label="− Earnest Money"
            lineNo="176"
            contractVal={fmtSigned(em, '−')}
            correctVal={fmtSigned(em, '−')}
          />
          <Row
            label="− Add'l Earnest Money"
            lineNo="186"
            contractVal={fmtSigned(addlEM, '−')}
            correctVal={fmtSigned(addlEM, '−')}
            dim={addlEM === 0}
          />
          <Row
            label="− Loan Amount"
            lineNo="196"
            contractVal={loan > 0 ? fmtSigned(loan, '−') : '—'}
            correctVal={rightLoan > 0 ? fmtSigned(rightLoan, '−') : '—'}
            mismatch={loanMismatch}
          />
          <Row
            label="= Certified Funds"
            lineNo="200"
            contractVal={leftCertFunds > 0 ? fmt(leftCertFunds) : '—'}
            correctVal={rightCertFunds > 0 ? fmt(rightCertFunds) : '—'}
            mismatch={certMismatch}
            match={!certMismatch && price > 0}
            isTotal
          />

          {/* ─ Section ②: Seller Expenses ─ */}
          <Section label="② Total Seller Expenses — ln 218" />

          <Row
            label="Buyer Agent Comp"
            lineNo="207"
            contractVal={comm > 0 ? fmt(comm) : '—'}
            correctVal={rightComm > 0 ? fmt(rightComm) : '—'}
            mismatch={commMismatch}
          />
          <Row
            label="+ Add'l Seller Costs"
            lineNo="211"
            contractVal={fmtSigned(conc, '+')}
            correctVal={fmtSigned(conc, '+')}
          />
          {credit > 0 && (
            <Row
              label="+ Seller Credit"
              contractVal={fmtSigned(credit, '+')}
              correctVal={fmtSigned(credit, '+')}
            />
          )}
          <Row
            label="= Total Seller Expenses"
            lineNo="218"
            contractVal={leftTotalSeller > 0 ? fmt(leftTotalSeller) : '—'}
            correctVal={rightTotalSeller > 0 ? fmt(rightTotalSeller) : '—'}
            mismatch={totalMismatch}
            match={!totalMismatch && leftTotalSeller > 0}
            isTotal
          />

        </tbody>
      </table>

      {/* ── Mismatch detail box ── */}
      {loanMismatch && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700 space-y-0.5">
          <p className="font-bold">⚠ Loan Amount Discrepancy — Verify line 196 on physical contract</p>
          <p>
            Contract: <strong>{fmt(loan)}</strong>
            &nbsp;·&nbsp;
            Expected ({rightDpPct}% down on {fmt(price)}): <strong>{fmt(rightLoan)}</strong>
            &nbsp;·&nbsp;
            Difference: <strong>{fmt(Math.abs(loan - rightLoan))}</strong>
          </p>
        </div>
      )}

      {/* ── Down payment basis footnote ── */}
      {price > 0 && (
        <p className="mt-2 text-center text-[10px] text-base-content/40">
          Right side using&nbsp;
          <span className="font-semibold text-green-700">{dpSource}</span>
          {loanType && <span className="ml-1 capitalize text-base-content/40">· {loanType}</span>}
        </p>
      )}

    </div>
  );
};

export default ContractReferencePanel;
