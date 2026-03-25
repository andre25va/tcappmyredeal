export interface NudgeTaskStatus {
  task_id: string;
  task_name: string;
  deal_id: string;
  deal_ref: string;
  property_address: string;
  due_date: string;
  status: string;
  urgency: 'overdue' | 'due_today' | 'approaching' | 'on_track';
  nudge_count: number;
  last_nudged_at: string | null;
  needs_nudge: boolean;
}

export interface NudgeTemplate {
  id: string;
  org_id: string | null;
  name: string;
  channel: 'email' | 'sms' | 'both';
  subject: string | null;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NudgeLogEntry {
  id: string;
  task_id: string;
  deal_id: string;
  template_id: string | null;
  recipient_id: string;
  sent_by: string;
  channel: 'email' | 'sms';
  subject: string | null;
  body: string;
  delivery_status: 'sent' | 'delivered' | 'failed' | 'bounced';
  sent_at: string;
}
