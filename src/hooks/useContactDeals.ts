import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface ContactDeal {
  participantId: string;
  dealId: string;
  side: 'buyer' | 'seller' | 'both' | string;
  dealRole: string;
  isPrimary: boolean;
  isClientSide: boolean;
  propertyAddress: string;
  city: string;
  state: string;
  status: string;
  pipelineStage: string;
  contractDate: string | null;
  closingDate: string | null;
  purchasePrice: number | null;
}

export function useContactDeals(contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-deals', contactId],
    queryFn: async (): Promise<ContactDeal[]> => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('deal_participants')
        .select(`
          id,
          side,
          deal_role,
          is_primary,
          is_client_side,
          deal_id,
          deals(id, property_address, city, state, status, pipeline_stage, contract_date, closing_date, purchase_price)
        `)
        .eq('contact_id', contactId);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        participantId: p.id,
        dealId: p.deal_id,
        side: p.side === 'listing' ? 'seller' : p.side === 'vendor' ? 'both' : (p.side || ''),
        dealRole: p.deal_role || '',
        isPrimary: p.is_primary ?? false,
        isClientSide: p.is_client_side ?? false,
        propertyAddress: p.deals?.property_address || 'Unknown Address',
        city: p.deals?.city || '',
        state: p.deals?.state || '',
        status: p.deals?.status || '',
        pipelineStage: p.deals?.pipeline_stage || '',
        contractDate: p.deals?.contract_date || null,
        closingDate: p.deals?.closing_date || null,
        purchasePrice: p.deals?.purchase_price || null,
      }));
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });
}
