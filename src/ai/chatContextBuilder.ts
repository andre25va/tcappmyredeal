import type { Deal } from '../types';

export interface DealContextPacket {
  deal: {
    id: string;
    propertyAddress: string;
    city: string;
    state: string;
    zipCode: string;
    mlsNumber: string;
    status: string;
    milestone: string;
    contractDate: string;
    closingDate: string;
    contractPrice: number;
    transactionType: string;
    propertyType: string;
    agentName: string;
    notes: string;
  };
  contacts: Array<{
    name: string;
    role: string;
    email: string;
    phone: string;
    side?: string;
  }>;
  tasks: Array<{
    title: string;
    dueDate: string;
    priority: string;
    completed: boolean;
    category: string;
  }>;
  dueDiligence: Array<{
    title: string;
    completed: boolean;
    dueDate?: string;
    required?: boolean;
  }>;
  compliance: Array<{
    title: string;
    completed: boolean;
    dueDate?: string;
    required?: boolean;
  }>;
  recentActivity: Array<{
    timestamp: string;
    action: string;
    detail?: string;
    type: string;
  }>;
  documentRequests: Array<{
    label: string;
    status: string;
    urgency: string;
  }>;
}

export function buildDealContext(deal: Deal): DealContextPacket {
  return {
    deal: {
      id: deal.id,
      propertyAddress: deal.propertyAddress,
      city: deal.city,
      state: deal.state,
      zipCode: deal.zipCode,
      mlsNumber: deal.mlsNumber,
      status: deal.status,
      milestone: deal.milestone,
      contractDate: deal.contractDate,
      closingDate: deal.closingDate,
      contractPrice: deal.contractPrice,
      transactionType: deal.transactionType,
      propertyType: deal.propertyType,
      agentName: deal.agentName,
      notes: deal.notes || '',
    },
    contacts: (deal.contacts || []).map(c => ({
      name: c.name,
      role: c.role,
      email: c.email,
      phone: c.phone,
      side: c.side,
    })),
    tasks: (deal.tasks || []).map(t => ({
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      completed: !!t.completedAt,
      category: t.category,
    })),
    dueDiligence: (deal.dueDiligenceChecklist || []).map(item => ({
      title: item.title,
      completed: item.completed,
      dueDate: item.dueDate,
      required: item.required,
    })),
    compliance: (deal.complianceChecklist || []).map(item => ({
      title: item.title,
      completed: item.completed,
      dueDate: item.dueDate,
      required: item.required,
    })),
    recentActivity: (deal.activityLog || []).slice(0, 15).map(a => ({
      timestamp: a.timestamp,
      action: a.action,
      detail: a.detail,
      type: a.type,
    })),
    documentRequests: (deal.documentRequests || []).map(d => ({
      label: d.label,
      status: d.status,
      urgency: d.urgency,
    })),
  };
}
