/**
 * Delivery status rank. A later callback must not move a message backwards.
 * Failures sit between sent and delivered so a late "delivered" can replace
 * an earlier failure, and a failure cannot overwrite a confirmed delivery.
 */
const RANK: Record<string, number> = {
  accepted: 1,
  queued: 2,
  sending: 3,
  sent: 4,
  failed: 5,
  undelivered: 5,
  delivered: 6,
  received: 6,
  read: 7,
};

export function shouldApplyStatus(current: string | null | undefined, next: string | null | undefined): boolean {
  if (!next) return false;
  if (!current) return true;
  if (current === next) return true;
  const currentRank = RANK[current] ?? 0;
  const nextRank = RANK[next] ?? 0;
  return nextRank >= currentRank;
}
