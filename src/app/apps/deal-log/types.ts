export interface EmailLogEntry {
  id: string;
  sent_at: string;
  subject: string;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  template_name: string | null;
  sent_by: string | null;
  body_html: string | null;
  email_type: string | null;
  address: string | null;
}

export interface Deal {
  id: string;
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  mls_number: string | null;
  deal_type: string;
  status: string;
  pipeline_stage: string | null;
  purchase_price: number | null;
  closing_date: string | null;
  buyer_name: string | null;
  seller_name: string | null;
  commission_percentage: number | null;
  commission_amount: number | null;
  created_at: string;
}
