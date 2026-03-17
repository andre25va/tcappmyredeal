import { DealRecord, EmailClassification, RawEmail } from "./types";
import { includesAny, normalizeText } from "./address";

type DeterministicResult = {
  score: number;
  matchedSignals: string[];
};

function deterministicScore(email: RawEmail, deal: DealRecord): DeterministicResult {
  let score = 0;
  const matchedSignals: string[] = [];

  const subject = email.subject || "";
  const body = `${email.snippet || ""} ${email.bodyText || ""}`;
  const from = email.from || "";
  const attachments = email.attachmentNames || [];
  const addressVariants = deal.addressVariants || [];

  if ((deal.linkedThreadIds || []).includes(email.threadId)) {
    score += 100;
    matchedSignals.push("linked_thread");
  }

  const subjectHits = includesAny(subject, addressVariants);
  if (subjectHits.length) {
    score += 40;
    matchedSignals.push(`address_subject:${subjectHits.join(",")}`);
  }

  const bodyHits = includesAny(body, addressVariants);
  if (bodyHits.length) {
    score += 25;
    matchedSignals.push(`address_body:${bodyHits.join(",")}`);
  }

  if (deal.mlsNumber) {
    const blob = normalizeText(`${subject} ${body}`);
    if (blob.includes(normalizeText(deal.mlsNumber))) {
      score += 35;
      matchedSignals.push(`mls:${deal.mlsNumber}`);
    }
  }

  const clientNameHits = includesAny(`${subject} ${body}`, deal.clientNames || []);
  if (clientNameHits.length) {
    score += 15;
    matchedSignals.push(`client_names:${clientNameHits.join(",")}`);
  }

  const fromNorm = normalizeText(from);
  const senderHit = (deal.participantEmails || []).find((emailAddr) =>
    fromNorm.includes(normalizeText(emailAddr))
  );
  if (senderHit) {
    score += 25;
    matchedSignals.push(`participant_email:${senderHit}`);
  }

  const attachmentKeywords = [
    "contract", "addendum", "amendment", "inspection", "appraisal",
    "title", "invoice", "disclosure", "earnest", "hoa", "closing",
    "settlement", "commitment",
  ];

  const attachmentHits = attachments.filter((name) =>
    attachmentKeywords.some((keyword) =>
      normalizeText(name).includes(normalizeText(keyword))
    )
  );

  if (attachmentHits.length) {
    score += 10;
    matchedSignals.push(`attachments:${attachmentHits.join(",")}`);
  }

  return { score, matchedSignals };
}

function inferCategory(email: RawEmail): EmailClassification["category"] {
  const blob = normalizeText(
    [email.subject, email.snippet, email.bodyText, ...(email.attachmentNames || [])]
      .filter(Boolean)
      .join(" ")
  );

  if (blob.includes("inspection")) return "inspection";
  if (blob.includes("appraisal")) return "appraisal";
  if (blob.includes("title") || blob.includes("commitment")) return "title";
  if (blob.includes("lender") || blob.includes("loan") || blob.includes("underwriting")) return "lender";
  if (blob.includes("closing") || blob.includes("settlement")) return "closing";
  if (blob.includes("compliance") || blob.includes("disclosure")) return "compliance";
  if (blob.includes("contract") || blob.includes("addendum") || blob.includes("amendment")) return "contract";

  return "general";
}

async function fallbackAIReview(
  _email: RawEmail,
  deal: DealRecord,
  deterministic: DeterministicResult
): Promise<EmailClassification> {
  // Phase 1 placeholder — no live OpenAI call.
  // Phase 2 will swap in real structured-output API call.
  const category = inferCategory(_email);

  if (deterministic.score >= 45) {
    return {
      dealId: deal.id,
      shouldAttach: true,
      confidence: 0.72,
      reason: "Medium-confidence rules match. Recommend user confirmation.",
      category,
      extractedSignals: deterministic.matchedSignals,
    };
  }

  return {
    dealId: null,
    shouldAttach: false,
    confidence: 0.68,
    reason: "Signals are too weak for a safe match without human review.",
    category: "unrelated",
    extractedSignals: deterministic.matchedSignals,
  };
}

export async function classifyEmailForDeal(
  email: RawEmail,
  deal: DealRecord
): Promise<EmailClassification> {
  const deterministic = deterministicScore(email, deal);
  const { score, matchedSignals } = deterministic;
  const category = inferCategory(email);

  // Hard accept
  if (score >= 80) {
    return {
      dealId: deal.id,
      shouldAttach: true,
      confidence: 0.98,
      reason: "High-confidence deterministic match.",
      category,
      extractedSignals: matchedSignals,
    };
  }

  // Hard reject
  if (score < 20) {
    return {
      dealId: null,
      shouldAttach: false,
      confidence: 0.95,
      reason: "Insufficient matching signals.",
      category: "unrelated",
      extractedSignals: matchedSignals,
    };
  }

  // Gray zone
  return fallbackAIReview(email, deal, deterministic);
}
