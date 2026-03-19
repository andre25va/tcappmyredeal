export interface Participant { contact_id: string | null; name: string; phone: string; }

export interface Conversation {
  id: string; name: string; deal_id: string | null;
  type: 'direct' | 'broadcast' | 'group';
  channel: 'sms' | 'email' | 'whatsapp';
  participants: Participant[];
  last_message_at: string | null; last_message_preview: string | null;
  unread_count: number; waiting_for_reply?: boolean; waiting_since?: string | null;
  deals?: { property_address: string; city: string; state: string; pipeline_stage: string } | null;
}

export interface Message {
  id: string; conversation_id: string; direction: 'inbound' | 'outbound';
  channel: 'sms' | 'email' | 'whatsapp'; body: string; status: string;
  from_number: string | null; to_number: string | null; sent_at: string;
  need_reply?: boolean; auto_created_task_id: string | null;
  contacts?: { first_name: string; last_name: string; phone: string; contact_type: string } | null;
}

export interface EmailAttachment { filename: string; contentType: string; size: number; downloadUrl: string; }

export interface EmailThread {
  id: string; subject: string; from: string; to: string; snippet: string;
  internalDate: string; messageCount: number; isUnread: boolean;
  hasAttachment?: boolean; labelIds: string[]; waitingForReply?: boolean; priority?: boolean;
}

export interface EmailMessage {
  id: string; threadId: string; subject: string; from: string; to: string; cc: string;
  date: string; internalDate: string; body: string; bodyHtml?: string; snippet: string;
  attachments?: EmailAttachment[];
}

export interface DBContact { id: string; first_name: string; last_name: string; phone: string | null; email: string | null; contact_type: string; company: string | null; }
export interface Deal { id: string; property_address: string; city: string; state: string; }

export interface InboxProps {
  onSelectDeal?: (id: string) => void;
  onWaitingCountChange?: (count: number) => void;
  initialConversationId?: string;
  initialChannel?: 'sms' | 'email' | 'whatsapp';
  initialEmailSubTab?: 'all' | 'linked' | 'needs_review' | 'unmatched';
  onInitHandled?: () => void;
  onCallStarted?: (callData: { contactName: string; contactPhone: string; callSid?: string; startedAt: string }) => void;
  onEmailSubTabCounts?: (counts: { needsReview: number; unmatched: number }) => void;
}
