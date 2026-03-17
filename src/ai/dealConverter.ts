import { Deal } from "../types";
import { DealRecord } from "./types";
import { buildAddressVariants } from "./address";

export function dealToRecord(deal: Deal): DealRecord {
  const fullAddress = [deal.address, deal.city, deal.state, deal.zipCode]
    .filter(Boolean)
    .join(", ");

  return {
    id: deal.id,
    propertyAddress: fullAddress,
    addressVariants: buildAddressVariants(fullAddress),
    mlsNumber: deal.mlsNumber || undefined,
    clientNames: deal.contacts
      ?.filter((c) => ["buyer", "seller", "agent-client"].includes(c.role))
      .map((c) => c.name) || [],
    participantEmails: deal.contacts
      ?.map((c) => c.email)
      .filter(Boolean) || [],
    linkedThreadIds: [],
    complianceItems: (deal.complianceChecklist || []).map((item) => ({
      id: item.id,
      label: item.title,
      status: item.completed ? ("complete" as const) : ("missing" as const),
      dueDate: item.dueDate,
    })),
    dueDiligenceItems: (deal.dueDiligenceChecklist || []).map((item) => ({
      id: item.id,
      label: item.title,
      status: item.completed ? ("complete" as const) : ("missing" as const),
      dueDate: item.dueDate,
    })),
    tasks: (deal.tasks || []).map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      status: task.completedAt ? ("done" as const) : ("open" as const),
      priority: task.priority as "low" | "medium" | "high",
      source: "manual" as const,
    })),
    stage: deal.milestone,
    closingDate: deal.closingDate,
    lastActivityAt: deal.updatedAt,
  };
}
