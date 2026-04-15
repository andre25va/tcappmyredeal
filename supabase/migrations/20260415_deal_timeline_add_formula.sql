-- Migration: deal_timeline_add_formula
-- Adds formula text column to store relative date expressions
-- e.g. "Effective Date + 10 days"
ALTER TABLE deal_timeline ADD COLUMN IF NOT EXISTS formula text;
