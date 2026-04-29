import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function daysDiff(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}

interface Issue {
  deal_id: string;
  issue_type: string;
  severity: string;
  title: string;
  description: string;
  suggested_action: string;
  action_type: string;
  action_payload: Record<string, unknown>;
}

async function runLoop(): Promise<{ checked: number; issues_found: number; issues_written: number }> {
  const { data: deals, error: dealsErr } = await supabase
    .from('deals')
    .select('id, property_address, pipeline_stage, closing_date, contract_date, buyer_name, seller_name, loan_type, archived_at, updated_at')
    .is('archived_at', null)
    .not('pipeline_stage', 'eq', 'closed');

  if (dealsErr || !deals?.length) {
    console.error('No active deals or error:', dealsErr);
    return { checked: 0, issues_found: 0, issues_written: 0 };
  }

  const dealIds = deals.map(d => d.id);
  const now = new Date().toISOString();

  await supabase.from('deal_issues').delete().in('deal_id', dealIds).eq('status', 'open');

  const [timelinesRes, checklistsRes, docsRes, complianceRes, waitingOnRes] = await Promise.all([
    supabase.from('deal_timeline').select('deal_id, milestone, label, due_date, status, escalated_at').in('deal_id', dealIds),
    supabase.from('tasks').select('deal_id, title, status, due_date').in('deal_id', dealIds).eq('status', 'pending'),
    supabase.from('deal_documents').select('deal_id, document_type, created_at').in('deal_id', dealIds),
    supabase.from('compliance_checks').select('deal_id, rule_id, status, checked_at').in('deal_id', dealIds).eq('status', 'fail'),
    supabase.from('requests').select('deal_id, title, status, created_at, updated_at').in('deal_id', dealIds).eq('status', 'sent'),
  ]);

  const timelines = timelinesRes.data || [];
  const failedCompliance = complianceRes.data || [];
  const sentRequests = waitingOnRes.data || [];

  const allIssues: Issue[] = [];

  for (const deal of deals) {
    const addr = deal.property_address || 'Unknown address';
    const dealTimeline = timelines.filter(t => t.deal_id === deal.id);
    const dealCompliance = failedCompliance.filter(c => c.deal_id === deal.id);
    const dealRequests = sentRequests.filter(r => r.deal_id === deal.id);

    if (deal.closing_date) {
      const daysToClose = daysDiff(deal.closing_date);
      if (daysToClose >= 0 && daysToClose <= 7) {
        allIssues.push({ deal_id: deal.id, issue_type: 'deadline_approaching', severity: daysToClose <= 3 ? 'critical' : 'warning', title: daysToClose === 0 ? `🔴 Closing TODAY — ${addr}` : `⏰ Closing in ${daysToClose} day${daysToClose === 1 ? '' : 's'} — ${addr}`, description: `Scheduled closing: ${deal.closing_date}. Verify all docs, title, and final walkthrough complete.`, suggested_action: 'Review deal checklist and confirm all parties are ready.', action_type: 'none', action_payload: { closing_date: deal.closing_date } });
      }
    }

    for (const milestone of dealTimeline) {
      if (milestone.status === 'pending' && milestone.due_date) {
        const days = daysDiff(milestone.due_date);
        if (days < 0) {
          allIssues.push({ deal_id: deal.id, issue_type: 'overdue_milestone', severity: days <= -3 ? 'critical' : 'warning', title: `⚠️ Overdue: ${milestone.label || milestone.milestone} — ${addr}`, description: `Milestone "${milestone.label || milestone.milestone}" was due ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago (${milestone.due_date}).`, suggested_action: 'Follow up to complete or extend this milestone.', action_type: 'send_nudge', action_payload: { milestone_id: milestone.milestone, due_date: milestone.due_date } });
        } else if (days >= 1 && days <= 3) {
          allIssues.push({ deal_id: deal.id, issue_type: 'deadline_approaching', severity: 'warning', title: `📅 ${milestone.label || milestone.milestone} due in ${days} day${days === 1 ? '' : 's'} — ${addr}`, description: `Milestone "${milestone.label || milestone.milestone}" is due on ${milestone.due_date}.`, suggested_action: 'Confirm this milestone is on track.', action_type: 'none', action_payload: { milestone_id: milestone.milestone, due_date: milestone.due_date } });
        }
      }
    }

    for (const req of dealRequests) {
      const daysSinceSent = Math.abs(daysDiff(req.updated_at || req.created_at));
      if (daysSinceSent >= 3) {
        allIssues.push({ deal_id: deal.id, issue_type: 'waiting_on_stale', severity: daysSinceSent >= 7 ? 'critical' : 'warning', title: `📪 No response: "${req.title}" — ${addr}`, description: `Request "${req.title}" sent ${daysSinceSent} day${daysSinceSent === 1 ? '' : 's'} ago with no response.`, suggested_action: 'Send a follow-up nudge.', action_type: 'send_nudge', action_payload: { request_title: req.title } });
      }
    }

    if (dealCompliance.length > 0) {
      allIssues.push({ deal_id: deal.id, issue_type: 'compliance_fail', severity: 'critical', title: `🚨 ${dealCompliance.length} compliance issue${dealCompliance.length === 1 ? '' : 's'} — ${addr}`, description: `${dealCompliance.length} compliance rule${dealCompliance.length === 1 ? '' : 's'} failing.`, suggested_action: 'Open compliance tab and resolve each failing rule.', action_type: 'run_compliance', action_payload: { fail_count: dealCompliance.length } });
    }

    if (deal.updated_at) {
      const daysSinceActivity = Math.abs(daysDiff(deal.updated_at.split('T')[0]));
      if (daysSinceActivity >= 5) {
        allIssues.push({ deal_id: deal.id, issue_type: 'no_activity', severity: 'info', title: `💤 No activity in ${daysSinceActivity} days — ${addr}`, description: `This deal hasn't been updated since ${deal.updated_at.split('T')[0]}.`, suggested_action: 'Check in on deal status.', action_type: 'none', action_payload: {} });
      }
    }

    const entityKeywords = ['LLC', 'Inc', 'Corp', 'Trust', 'SPE', 'LP', 'LLP', 'Holdings', 'Investments', 'Properties'];
    const hasEntitySeller = entityKeywords.some(k => (deal.seller_name || '').toUpperCase().includes(k.toUpperCase()));
    const hasEntityBuyer  = entityKeywords.some(k => (deal.buyer_name  || '').toUpperCase().includes(k.toUpperCase()));
    if (hasEntitySeller || hasEntityBuyer) {
      const flagged: string[] = [];
      if (hasEntitySeller) flagged.push(`Seller: ${deal.seller_name}`);
      if (hasEntityBuyer)  flagged.push(`Buyer: ${deal.buyer_name}`);
      allIssues.push({ deal_id: deal.id, issue_type: 'name_flag', severity: 'info', title: `🏢 Entity party detected — ${addr}`, description: `Entity name(s): ${flagged.join(', ')}. Verify signing authority.`, suggested_action: 'Confirm entity authorization docs are collected.', action_type: 'request_document', action_payload: { flagged_names: flagged } });
    }
  }

  let written = 0;
  if (allIssues.length > 0) {
    const { error: insertErr } = await supabase.from('deal_issues').insert(allIssues.map(issue => ({ ...issue, loop_run_at: now })));
    if (!insertErr) written = allIssues.length;
  }

  return { checked: deals.length, issues_found: allIssues.length, issues_written: written };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const result = await runLoop();
    return new Response(JSON.stringify({ ok: true, ...result }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
