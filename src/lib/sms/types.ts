export type ConsentStatus = 'opted_in' | 'opted_out' | 'unknown';
export type SmsDirection = 'inbound' | 'outbound';

export interface SmsContactCard {
  id: string;
  name: string;
  stage: string | null;
  tags: string[];
  phones: { value: string; type?: string }[];
  emails: { value: string; type?: string }[];
}

export type ContactCardState = 'matched' | 'not_found' | 'unconfigured' | 'error';

export interface SmsConversation {
  id: string;
  phone_e164: string;
  display_name: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_direction: SmsDirection | null;
  consent: ConsentStatus;
}

export interface SmsMessage {
  id: string;
  direction: SmsDirection;
  body: string;
  status: string;
  created_at: string;
  error_code: string | null;
  error_message: string | null;
}
