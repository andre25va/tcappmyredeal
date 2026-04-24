// ================================================================
// ⚠️  WARNING — THIS IS NOT THE EXTRACTION API ROUTE ⚠️
// ================================================================
//
// The REAL AI extraction serverless function is:
//   /api/ai.ts  (root-level Vercel function)
//
// This file (src/lib/ai.ts) is a utility/library module.
// It is NOT a Vercel API route and is NEVER called for extraction.
//
// DO NOT add extraction logic, schema changes, or prompt edits here.
// ALL extraction changes MUST go to root-level /api/ai.ts.
//
// Editing this file for extraction purposes = silent no-op.
// It will compile fine and do absolutely nothing.
//
// Previous versions of this file contained a stale extraction schema
// with the anyOf null bug — that code has been removed to prevent
// future confusion. The correct schema lives in /api/ai.ts only.
// ================================================================

export {};
