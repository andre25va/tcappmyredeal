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
// LEFT column = "Should Be" (correct calculation)
// RIGHT column = "Contract Says" (raw extracted value)
const Row: React.FC<{
  label: string;
  lineNo?: string;
  shouldBeVal: string;   // LEFT — calculated correct value
  contractVal: string;   // RIGHT — what the contract/extraction says
  mismatch?: boolean;    // contract (right) is wrong vs should-be (left)
  match?: boolean;       // both match
  isTotal?: boolean;
  dim?: boolean;
}> = ({ label, lineNo, shouldBeVal, contractVal, mismatch = false, match = false, isTotal = false, dim = false }) => {
  const rowCls = isTotal ? 'border-t border-base-300' : '';
  const labelCls = dim ? 'text-base-content/35' : 'text-base-content/60';
  const lnCls = 'text-base-content/35 font-normal';

  // "Should Be" (left) — green when mismatch (it's the correct one), bold when total
  const shouldBeCls = mismatch
    ? 'text-green-700 font-bold'
    : match
    ? 'text-green-700 font-semibold'
    : dim
    ? 'text-base-content/35'
    : isTotal
    ? 'font-bold text-base-content'
    : 'text-base-content/80';

  // "Contract Says" (right) — red when mismatch (it's wrong)
  const contractCls = mismatch
    ? 'text-red-600 font-bold'
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

      {/* Should Be — LEFT */}
      <td className={`py-1 px-3 text-right font-mono text-xs ${shouldBeCls}`}>
        {mismatch && <span className="mr-1 text-green-600">✓</span>}
        {!mismatch && match && <span className="mr-1 text-green-500">✓</span>}
        {shouldBeVal}
      </td>

      {/* Contract Says — RIGHT */}
      <td className={`py-1 pl-3 text-right font-mono text-xs ${contractCls}`}>
        {contractVal}
        {mismatch && <span className="ml-1 text-red-500">⚠</span>}
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

  // ── "Should Be" down payment % ────────────────────────────────────────────
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

  // ── RIGHT: what the contract/extraction says (raw values) ─────────────────
  const contractCertFunds   = price > 0 && loan > 0 ? price - em - addlEM - loan : 0;
  const contractTotalSeller = comm + conc + credit;

  // ── LEFT: "Should Be" — independent calculation from first principles ──────
  const shouldBeLoan        = price > 0 ? Math.round(price * (ltv / 100)) : 0;
  const shouldBeDownPmt     = price > 0 ? Math.round(price * (rightDpPct / 100)) : 0;
  const shouldBeCertFunds   = shouldBeDownPmt - em - addlEM;
  const shouldBeComm        = commPct > 0 && price > 0 ? Math.round((commPct / 100) * price) : comm;
  const shouldBeTotalSeller = shouldBeComm + conc + credit;

  // ── mismatches ────────────────────────────────────────────────────────────
  const loanMismatch  = loan > 0 && shouldBeLoan > 0 && Math.abs(loan - shouldBeLoan) > 1;
  const certMismatch  = price > 0 && Math.abs(contractCertFunds - shouldBeCertFunds) > 1;
  const commMismatch  = commPct > 0 && Math.abs(comm - shouldBeComm) > 1;
  const totalMismatch = Math.abs(contractTotalSeller - shouldBeTotalSeller) > 1;
  const anyMismatch   = loanMismatch || certMismatch || commMismatch || totalMismatch;
  const missingPrice  = price === 0;

  return (
    <div className={`rounded-lg border text-xs ${
      missingPrice
        ? 'border-amber-200 bg-amber-50/30'
        : anyMismatch
        ? 'border-red-200 bg-red-50/20'
        : 'border-amber-200 bg-amber-50/30'
    } p-3`}>

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">
          📋 Heartland Contract — Check &amp; Balance
        </span>
        {missingPrice
          ? <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Enter Contract Price</span>
          : anyMismatch
          ? <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">⚠ Mismatch Found</span>
          : <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ Numbers Match</span>
        }
      </div>

      {/* ── Missing price banner ── */}
      {missingPrice && (
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
          <p className="font-semibold">⚠ Contract Price missing — enter it above to unlock calculations</p>
          <p className="mt-0.5 text-amber-700">
            {loan > 0 && rightDpPct > 0
              ? `Hint: loan ${fmt(loan)} ÷ ${ltv}% LTV suggests price ≈ ${fmt(Math.round(loan / (ltv / 100)))}`
              : 'Purchase price is required to verify certified funds and loan amount.'}
          </p>
        </div>
      )}

      {/* ── Table ── */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-base-300">
            <th className="text-left pb-1.5 text-[10px] font-semibold text-base-content/40 uppercase tracking-wide w-[42%]">
              Line Item
            </th>
            <th className="text-right pb-1.5 px-3 text-[10px] font-bold text-green-700 uppercase tracking-wide w-[29%]">
              Should Be
            </th>
            <th className="text-right pb-1.5 pl-3 text-[10px] font-bold text-amber-700 uppercase tracking-wide w-[29%]">
              Contract Says
            </th>
          </tr>
        </thead>
        <tbody>

          {/* ─ Section ①: Certified Funds ─ */}
          <Section label="① Certified Funds — ln 200" />

          <Row
            label="Purchase Price"
            lineNo="164"
            shouldBeVal={price > 0 ? fmt(price) : '—'}
            contractVal={price > 0 ? fmt(price) : '—'}
          />
          <Row
            label="− Earnest Money"
            lineNo="176"
            shouldBeVal={fmtSigned(em, '−')}
            contractVal={fmtSigned(em, '−')}
          />
          <Row
            label="− Add'l Earnest Money"
            lineNo="186"
            shouldBeVal={fmtSigned(addlEM, '−')}
            contractVal={fmtSigned(addlEM, '−')}
            dim={addlEM === 0}
          />
          <Row
            label="− Loan Amount"
            lineNo="196"
            shouldBeVal={shouldBeLoan > 0 ? fmtSigned(shouldBeLoan, '−') : '—'}
            contractVal={loan > 0 ? fmtSigned(loan, '−') : '—'}
            mismatch={loanMismatch}
          />
          <Row
            label="= Certified Funds"
            lineNo="200"
            shouldBeVal={shouldBeCertFunds > 0 ? fmt(shouldBeCertFunds) : '—'}
            contractVal={contractCertFunds > 0 ? fmt(contractCertFunds) : '—'}
            mismatch={certMismatch}
            match={!certMismatch && price > 0}
            isTotal
          />

          {/* ─ Section ②: Seller Expenses ─ */}
          <Section label="② Total Seller Expenses — ln 218" />

          <Row
            label="Buyer Agent Comp"
            lineNo="207"
            shouldBeVal={shouldBeComm > 0 ? fmt(shouldBeComm) : '—'}
            contractVal={comm > 0 ? fmt(comm) : '—'}
            mismatch={commMismatch}
          />
          <Row
            label="+ Add'l Seller Costs"
            lineNo="211"
            shouldBeVal={fmtSigned(conc, '+')}
            contractVal={fmtSigned(conc, '+')}
          />
          {credit > 0 && (
            <Row
              label="+ Seller Credit"
              shouldBeVal={fmtSigned(credit, '+')}
              contractVal={fmtSigned(credit, '+')}
            />
          )}
          <Row
            label="= Total Seller Expenses"
            lineNo="218"
            shouldBeVal={shouldBeTotalSeller > 0 ? fmt(shouldBeTotalSeller) : '—'}
            contractVal={contractTotalSeller > 0 ? fmt(contractTotalSeller) : '—'}
            mismatch={totalMismatch}
            match={!totalMismatch && contractTotalSeller > 0}
            isTotal
          />

        </tbody>
      </table>

      {/* ── Mismatch detail box ── */}
      {loanMismatch && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700 space-y-0.5">
          <p className="font-bold">⚠ Loan Amount Discrepancy — Verify line 196 on physical contract</p>
          <p>
            Contract says: <strong>{fmt(loan)}</strong>
            &nbsp;·&nbsp;
            Should be ({rightDpPct}% down on {fmt(price)}): <strong>{fmt(shouldBeLoan)}</strong>
            &nbsp;·&nbsp;
            Difference: <strong>{fmt(Math.abs(loan - shouldBeLoan))}</strong>
          </p>
        </div>
      )}
      {certMismatch && !loanMismatch && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700 space-y-0.5">
          <p className="font-bold">⚠ Certified Funds Discrepancy — Verify line 200 on physical contract</p>
          <p>
            Contract says: <strong>{fmt(contractCertFunds)}</strong>
            &nbsp;·&nbsp;
            Should be: <strong>{fmt(shouldBeCertFunds)}</strong>
            &nbsp;·&nbsp;
            Difference: <strong>{fmt(Math.abs(contractCertFunds - shouldBeCertFunds))}</strong>
          </p>
        </div>
      )}

      {/* ── Calculation basis footnote ── */}
      {price > 0 && (
        <p className="mt-2 text-center text-[10px] text-base-content/40">
          Should Be using&nbsp;
          <span className="font-semibold text-green-700">{dpSource}</span>
          {loanType && <span className="ml-1 capitalize text-base-content/40">· {loanType}</span>}
        </p>
      )}

    </div>
  );
};

export default ContractReferencePanel;
