import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Dev only — blocked in production
  if (process.env.NODE_ENV !== "development" && process.env.VERCEL_ENV !== "development") {
    return res.status(404).json({ error: "Not found" });
  }

  if (req.method !== "POST") return res.status(405).end();

  const { message, stack, componentStack, context } = req.body ?? {};

  const prompt = `You are an expert React/TypeScript/Next.js debugger for a real estate transaction coordinator app built with React, Supabase, TanStack Query, and Tailwind/DaisyUI.

A crash occurred. Analyze it and return a JSON object with EXACTLY these fields:
- plain: one sentence in plain English — what went wrong (no tech jargon)
- why: one sentence — why this happened (root cause)
- fix: one sentence — the exact fix (be specific: file, line, or pattern)
- severity: one of low | medium | high | critical
- category: one of render | api | upload | network | auth | data | type | null-ref | other

Error: ${message}

Stack trace (first 2000 chars):
${stack ?? "none"}

Component stack:
${componentStack ?? "none"}

Extra context:
${JSON.stringify(context ?? {}, null, 2)}

Respond with ONLY a valid JSON object. No markdown, no explanation outside the JSON.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 400,
    });

    const text = completion.choices[0]?.message?.content ?? "{}";
    const decoded = JSON.parse(text);
    return res.status(200).json(decoded);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
}
