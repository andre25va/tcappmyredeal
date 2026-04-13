-- Prevent duplicate tasks per deal by title
-- Root cause: tasks created with category = NULL bypass UNIQUE(deal_id, category)
-- because PostgreSQL treats NULL != NULL in unique indexes.
-- Adding UNIQUE(deal_id, title) as a second layer catches these cases.

-- Deduplicate first (keep oldest per deal+title pair)
DELETE FROM tasks
WHERE id NOT IN (
  SELECT DISTINCT ON (deal_id, title) id
  FROM tasks
  ORDER BY deal_id, title, created_at ASC
);

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS tasks_deal_id_title_unique
  ON tasks (deal_id, title);
