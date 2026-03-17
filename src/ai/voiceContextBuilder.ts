import type { Deal } from '../types';
import { buildDealContext } from './chatContextBuilder';
import type { DealContextPacket } from './chatContextBuilder';

export interface VoiceContextPacket {
  dealContext: DealContextPacket;
  transcript: string;
  recentActivitySummary: string[];
}

export function buildVoiceContext(deal: Deal, transcript: string): VoiceContextPacket {
  const ctx = buildDealContext(deal);

  // Get last 10 activity entries as brief summaries
  const recentActivitySummary = (deal.activityLog || [])
    .slice(0, 10)
    .map(a => `${a.timestamp.split('T')[0]}: ${a.action}${a.detail ? ' - ' + a.detail : ''}`);

  return {
    dealContext: ctx,
    transcript,
    recentActivitySummary,
  };
}
