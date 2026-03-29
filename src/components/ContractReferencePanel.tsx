import React from 'react';
import { calculateDownPayment } from '../utils/helpers';

interface Props {
  contractPrice: string;
  listPrice: string;
  loanAmount: string;
  earnestMoney: string;
  downPaymentAmount: string;
  downPaymentPercent: string;
  clientAgentCommission: string;
  sellerConcessions: string;
}

const ContractReferencePanel: React.FC<Props> = ({
  contractPrice,
  listPrice,
  loanAmount,
  earnestMoney,
  downPaymentAmount,
  downPaymentPercent,
  clientAgentCommission,
  sellerConcessions,
}) => {
  const price      = parseFloat(contractPrice) || parseFloat(listPrice) || 0;
  const loan       = parseFloat(loanAmount) || 0;
  const em         = parseFloat(earnestMoney) || 0;
  const dp         = parseFloat(downPaymentAmount) || 0;
  const enteredPct = parseFloat(downPaymentPercent) || 0; // what agent wrote on line 330
  const comm       = parseFloat(clientAgentCommission) || 0;
  const conc       = parseFloat(sellerConcessions) || 0;
  // derivedPct + conflict check via shared helper (guards loan > 0 to preserve original behaviour)
  const { derivedPct: _rawDerivedPct, hasConflict } = calculateDownPayment(price, loan, em, enteredPct);
  const derivedPct  = price > 0 && loan > 0 ? _rawDerivedPct : 0;
  // Line 330 % is the agent's intent (the truth); fall back to derivedPct only if not extracted
  const pctForCalc  = enteredPct > 0 ? enteredPct : derivedPct;
  const totalDown   = price > 0 && pctForCalc ? price * (pctForCalc / 100) : (dp + em);
  const certFunds   = price > 0 && loan > 0 ? price - em - loan : 0;
  const cashClose   = totalDown > em ? totalDown - em : dp;
  const totalSeller = comm + conc;
  const showPctWarning = price > 0 && loan > 0 && enteredPct > 0 && hasConflict;
  const fmt = (n: number) => n > 0 ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const fmtPct = (n: number) => n.toFixed(2).replace(/\.?0+$/, '') + '%';

  return (
    <div className="border border-amber-200 rounded-lg p-3 text-xs bg-amber-50/60 space-y-3">
      <p className="text-amber-700 font-semibold uppercase tracking-wide text-[10px]">📋 Heartland Contract Reference</p>

      {/* Section 1: Certified Funds */}
      <div>
        <p className="text-amber-700 font-semibold mb-1.5">① Verify Certified Funds — line 200</p>
        <div className="space-y-0.5 font-mono">
          <div className="flex justify-between gap-4">
            <span className="text-base-content/55">Purchase Price <span className="text-base-content/35">(ln 164)</span></span>
            <span className="font-medium">{price > 0 ? fmt(price) : '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-base-content/55">− Earnest Money <span className="text-base-content/35">(ln 176)</span></span>
            <span className="font-medium">{em > 0 ? '− ' + fmt(em) : '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-base-content/55">− Add'l Earnest Money <span className="text-base-content/35">(ln 186)</span></span>
            <span className="text-base-content/35">—</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-base-content/55">− Total Financed by Buyer <span className="text-base-content/35">(ln 196)</span></span>
            <span className="font-medium">{loan > 0 ? '− ' + fmt(loan) : '—'}</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-amber-200 pt-1">
            <span className="text-amber-700 font-semibold">= Certified Funds <span className="text-amber-500/70">(ln 200)</span></span>
            <span className="text-amber-800 font-bold">{certFunds > 0 ? fmt(certFunds) : '—'}</span>
          </div>
        </div>
        <p className="text-base-content/40 mt-1 text-[10px]">Verify line 200 on physical contract matches ↑</p>
      </div>

      {/* Section 2: Down Payment — line 330 % is the truth; warning fires if ln 196 conflicts */}
      <div>
        <p className="text-amber-700 font-semibold mb-1.5">② Down Payment</p>
        <div className="space-y-0.5 font-mono">
          <div className="flex justify-between gap-4">
            <span className="text-base-content/55">Purchase Price × {pctForCalc > 0 ? fmtPct(pctForCalc) : '%'} <span className="text-base-content/35">(incl. EM)</span></span>
            <span className="font-medium">{totalDown > 0 ? fmt(totalDown) : '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-base-content/55">− Earnest Money <span className="text-base-content/35">(ln 176)</span></span>
            <span className="font-medium">{em > 0 ? '− ' + fmt(em) : '—'}</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-amber-200 pt-1">
            <span className="text-amber-700 font-semibold">= Cash at Close</span>
            <span className="text-amber-800 font-bold">{cashClose > 0 ? fmt(cashClose) : '—'}</span>
          </div>
        </div>
        {showPctWarning && (
          <p className="text-orange-600 mt-1 text-[10px]">⚠ Ln 196 loan amount implies {fmtPct(derivedPct)} down — agent's ln 330 says {fmtPct(enteredPct)} — verify line 196 is correct</p>
        )}
      </div>

      {/* Section 3: Seller Expenses */}
      <div>
        <p className="text-amber-700 font-semibold mb-1.5">③ Total Additional Seller Expenses</p>
        <div className="space-y-0.5 font-mono">
          <div className="flex justify-between gap-4">
            <span className="text-base-content/55">Seller comp to Buyer's Broker <span className="text-base-content/35">(ln 207)</span></span>
            <span className="font-medium">{comm > 0 ? fmt(comm) : '—'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-base-content/55">+ Add'l Seller paid costs <span className="text-base-content/35">(ln 211)</span></span>
            <span className="font-medium">{conc > 0 ? '+ ' + fmt(conc) : '—'}</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-amber-200 pt-1">
            <span className="text-amber-700 font-semibold">= Total Additional Seller Expenses <span className="text-amber-500/70">(ln 218)</span></span>
            <span className="text-amber-800 font-bold">{totalSeller > 0 ? fmt(totalSeller) : '—'}</span>
          </div>
        </div>
        <p className="text-base-content/40 mt-1 text-[10px]">Verify line 218 on physical contract matches ↑</p>
      </div>
    </div>
  );
};

export default ContractReferencePanel;
