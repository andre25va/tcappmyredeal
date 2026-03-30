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
  sellerCredit?: string;        // additional seller credit (separate)
}

// Standard down payment % fallback by loan type (used only if ln 330 not extracted)
const LOAN_DP_DEFAULTS: Record<string, number> = {
  fha: 3.5,
  va: 0,
  usda: 0,
  conventional: 5,
  cash: 0,
  other: 0,
};

// ─── tiny helper row ──────────────────────────────────────────────────────────
const Row: React.FC<{
  label: string;
  note?: string;
  value: string;
  dim?: boolean;
  flag?: 'error' | 'ok';
}> = ({ label, note, value, dim, flag }) => (
  <div className="flex justify-between gap-2 leading-relaxed">
    <span className={
      flag === 'error' ? 'text-red-600 font-semibold' :
      flag === 'ok'    ? 'text-green-700 font-semibold' :
      dim              ? 'text-base-content/35' :
                         'text-base-content/55'
    }>
      {label}{note && <span className="text-base-content/30 ml-0.5">({note})</span>}
    </span>
    <span className={
      flag === 'error' ? 'font-bold text-red-600' :
      flag === 'ok'    ? 'font-bold text-green-700' :
                         'font-medium'
    }>{value}</span>
  </div>
);

// ─── divider row ─────────────────────────────────────────────────────────────
const TotalRow: React.FC<{
  label: string;
  note?: string;
  value: string;
  mismatch?: boolean;
  side: 'left' | 'right';
}> = ({ label, note, value, mismatch, side }) => (
  <div className={`flex justify-between gap-2 border-t pt-1 mt-0.5 ${
    side === 'left'
      ? mismatch ? 'border-red-300' : 'border-amber-200'
      : mismatch ? 'border-green-300' : 'border-green-200'
  }`}>
    <span className={`font-semibold ${
      mismatch
        ? side === 'left' ? 'text-red-600' : 'text-green-700'
        : 'text-amber-700'
    }`}>
      {label}{note && <span className="text-amber-500/70 ml-0.5">({note})</span>}
      {mismatch && (side === 'left' ? ' ⚠' : ' ✓')}
    </span>
    <span className={`font-bold ${
      mismatch
        ? side === 'left' ? 'text-red-600' : 'text-green-700'
        : 'text-amber-800'
    }`}>{value}</span>
  </div>
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
  const loan    = parseFloat(loanAmount) || 0;       // what contract line 196 says
  const em      = parseFloat(earnestMoney) || 0;
  const addlEM  = parseFloat(additionalEarnestMoney) || 0;
  const comm    = parseFloat(clientAgentCommission) || 0;
  const commPct = parseFloat(clientAgentCommissionPct) || 0;
  const conc    = parseFloat(sellerConcessions) || 0;
  const credit  = parseFloat(sellerCredit) || 0;

  // ── determine right-side down payment % ──────────────────────────────────
  // Priority: extracted ln 330 % → loan type default
  const extractedDpPct  = parseFloat(downPaymentPercent) || 0;
  const loanTypeLower   = loanType.toLowerCase();
  const fallbackDpPct   = LOAN_DP_DEFAULTS[loanTypeLower] ?? 0;
  const rightDpPct      = extractedDpPct > 0 ? extractedDpPct : fallbackDpPct;
  const ltv             = 100 - rightDpPct; // e.g. 97 for 3% down

  const dpSourceLabel = extractedDpPct > 0
    ? `${rightDpPct.toFixed(rightDpPct % 1 === 0 ? 0 : 1)}% down · from ln 330 LTV = ${ltv.toFixed(0)}%`
    : loanType
      ? `${rightDpPct}% down · ${loanType} default`
      : '';

  // ── LEFT SIDE: strictly what's written on the contract ───────────────────
  const leftCertFunds   = price > 0 && loan > 0 ? price - em - addlEM - loan : 0;
  const leftTotalSeller = comm + conc + credit;

  // ── RIGHT SIDE: independent calculations ─────────────────────────────────
  const rightLoan       = price > 0 && rightDpPct > 0 ? Math.round(price * (1 - rightDpPct / 100) * 100) / 100 : 0;
  const rightDownPmt    = price > 0 && rightDpPct > 0 ? price * (rightDpPct / 100) : 0;
  const rightCertFunds  = rightDownPmt - em - addlEM;
  // Commission: if pct available recalculate; else use same $ amount (no independent data)
  const rightComm       = commPct > 0 && price > 0 ? Math.round((commPct / 100) * price * 100) / 100 : comm;
  const rightTotalSeller = rightComm + conc + credit;

  // ── mismatches ────────────────────────────────────────────────────────────
  const loanMismatch    = price > 0 && loan > 0 && rightLoan > 0 && Math.abs(loan - rightLoan) > 1;
  const certMismatch    = Math.abs(leftCertFunds - rightCertFunds) > 1;
  const commMismatch    = commPct > 0 && Math.abs(comm - rightComm) > 1;
  const anyMismatch     = loanMismatch || certMismatch || commMismatch;

  // ── formatters ────────────────────────────────────────────────────────────
  const fmt = (n: number) =>
    n === 0 ? '—' :
    (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMinus = (n: number) => n > 0 ? '− ' + fmt(n) : '—';
  const fmtPlus  = (n: number) => n > 0 ? '+ ' + fmt(n) : '—';

  return (
    <div className={`border rounded-lg p-3 text-xs space-y-3 ${
      anyMismatch ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/60'
    }`}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-amber-700 font-semibold uppercase tracking-wide text-[10px]">
          📋 Heartland Contract — Check &amp; Balance
        </p>
        {anyMismatch
          ? <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">⚠ MISMATCH FOUND</span>
          : <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">✓ Numbers Match</span>
        }
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-amber-100 text-amber-800 rounded px-2 py-0.5 font-bold text-[10px] uppercase tracking-wide">
          📄 Contract Says
        </div>
        <div className="bg-green-100 text-green-800 rounded px-2 py-0.5 font-bold text-[10px] uppercase tracking-wide">
          ✓ Should Be
        </div>
      </div>

      {/* Down payment basis */}
      {dpSourceLabel && (
        <p className="text-[10px] text-center text-base-content/50">
          Right side using&nbsp;
          <span className="font-semibold text-green-700">{dpSourceLabel}</span>
          {loanType && <span className="ml-1 text-base-content/40 capitalize">· {loanType}</span>}
        </p>
      )}

      {/* ── Section ①: Certified Funds ─────────────────────────────────── */}
      <div>
        <p className="text-amber-700 font-semibold mb-1.5">① Certified Funds — ln 200</p>
        <div className="grid grid-cols-2 gap-3 font-mono">

          {/* LEFT */}
          <div className="space-y-0.5">
            <Row label="Purchase Price" note="ln 164" value={price > 0 ? fmt(price) : '—'} />
            <Row label="− Earnest Money" note="ln 176" value={fmtMinus(em)} />
            {addlEM > 0 && <Row label="− Add'l EM" note="ln 186" value={fmtMinus(addlEM)} />}
            {addlEM === 0 && <Row label="− Add'l EM" note="ln 186" value="—" dim />}
            <Row
              label="− Total Financed"
              note="ln 196"
              value={loan > 0 ? fmtMinus(loan) : '—'}
              flag={loanMismatch ? 'error' : undefined}
            />
            <TotalRow
              label="= Certified Funds"
              note="ln 200"
              value={leftCertFunds > 0 ? fmt(leftCertFunds) : '—'}
              mismatch={certMismatch}
              side="left"
            />
          </div>

          {/* RIGHT */}
          <div className="space-y-0.5">
            <Row label="Purchase Price" value={price > 0 ? fmt(price) : '—'} />
            <Row label="− Earnest Money" value={fmtMinus(em)} />
            {addlEM > 0 && <Row label="− Add'l EM" value={fmtMinus(addlEM)} />}
            {addlEM === 0 && <Row label="− Add'l EM" value="—" dim />}
            <Row
              label="− Expected Loan"
              value={rightLoan > 0 ? fmtMinus(rightLoan) : '—'}
              flag={loanMismatch ? 'ok' : undefined}
            />
            <TotalRow
              label="= Certified Funds"
              value={rightCertFunds > 0 ? fmt(rightCertFunds) : '—'}
              mismatch={certMismatch}
              side="right"
            />
          </div>
        </div>

        {/* Mismatch callout */}
        {loanMismatch && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 text-[10px] text-red-700 space-y-0.5">
            <p className="font-bold">⚠ Loan Amount Mismatch</p>
            <p>Contract ln 196: <strong>{fmt(loan)}</strong> — Expected ({rightDpPct.toFixed(rightDpPct % 1 === 0 ? 0 : 1)}% down on {fmt(price)}): <strong>{fmt(rightLoan)}</strong></p>
            <p>Difference: <strong>{fmt(Math.abs(loan - rightLoan))}</strong> — Verify line 196 on physical contract.</p>
          </div>
        )}
      </div>

      {/* ── Section ②: Down Payment Breakdown ─────────────────────────── */}
      {rightDpPct > 0 && (
        <div>
          <p className="text-amber-700 font-semibold mb-1.5">② Down Payment Breakdown</p>
          <div className="grid grid-cols-2 gap-3 font-mono">
            {/* LEFT */}
            <div className="space-y-0.5">
              <Row label={`Price × ${rightDpPct.toFixed(rightDpPct % 1 === 0 ? 0 : 1)}% (ln 330)`} value={price > 0 ? fmt(parseFloat(downPaymentAmount) || (price * rightDpPct / 100)) : '—'} />
              <Row label="− Earnest Money" note="ln 176" value={fmtMinus(em)} />
              <TotalRow
                label="= Cash at Close"
                value={parseFloat(downPaymentAmount) > 0 ? fmt(parseFloat(downPaymentAmount) - em) : '—'}
                side="left"
              />
            </div>
            {/* RIGHT */}
            <div className="space-y-0.5">
              <Row label={`Price × ${rightDpPct.toFixed(rightDpPct % 1 === 0 ? 0 : 1)}%`} value={rightDownPmt > 0 ? fmt(rightDownPmt) : '—'} />
              <Row label="− Earnest Money" value={fmtMinus(em)} />
              <TotalRow
                label="= Cash at Close"
                value={rightDownPmt > em ? fmt(rightDownPmt - em) : '—'}
                side="right"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Section ③: Seller Expenses ─────────────────────────────────── */}
      <div>
        <p className="text-amber-700 font-semibold mb-1.5">③ Total Additional Seller Expenses — ln 218</p>
        <div className="grid grid-cols-2 gap-3 font-mono">
          {/* LEFT */}
          <div className="space-y-0.5">
            <Row
              label="Buyer's Broker"
              note="ln 207"
              value={comm > 0 ? fmt(comm) : '—'}
              flag={commMismatch ? 'error' : undefined}
            />
            <Row label="+ Add'l Seller Costs" note="ln 211" value={fmtPlus(conc)} />
            {credit > 0 && <Row label="+ Seller Credit" value={fmtPlus(credit)} />}
            <TotalRow
              label="= Total Seller Exp"
              note="ln 218"
              value={leftTotalSeller > 0 ? fmt(leftTotalSeller) : '—'}
              side="left"
            />
          </div>
          {/* RIGHT */}
          <div className="space-y-0.5">
            <Row
              label="Buyer's Broker"
              value={rightComm > 0 ? fmt(rightComm) : '—'}
              flag={commMismatch ? 'ok' : undefined}
            />
            <Row label="+ Add'l Seller Costs" value={fmtPlus(conc)} />
            {credit > 0 && <Row label="+ Seller Credit" value={fmtPlus(credit)} />}
            <TotalRow
              label="= Total Seller Exp"
              value={rightTotalSeller > 0 ? fmt(rightTotalSeller) : '—'}
              side="right"
            />
          </div>
        </div>
        <p className="text-base-content/30 mt-1 text-[10px]">Verify line 218 on physical contract matches ↑</p>
      </div>

    </div>
  );
};

export default ContractReferencePanel;
