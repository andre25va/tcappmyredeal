-- 1. Add health_score column to deals table
ALTER TABLE deals ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 100;

-- 2. Create the health calculation function
CREATE OR REPLACE FUNCTION calculate_deal_health(deal_id UUID)
RETURNS INTEGER AS $$
DECLARE
    score INTEGER := 100;
    overdue_tasks_count INTEGER;
    missing_docs_count INTEGER;
    days_to_closing INTEGER;
BEGIN
    -- Deduct for overdue tasks (-12 each)
    SELECT count(*) INTO overdue_tasks_count 
    FROM tasks 
    WHERE tasks.deal_id = $1 AND status = 'overdue';
    score := score - (overdue_tasks_count * 12);

    -- Deduct for missing compliance docs (-8 each)
    SELECT count(*) INTO missing_docs_count 
    FROM documents 
    WHERE documents.deal_id = $1 AND status = 'pending_request';
    score := score - (missing_docs_count * 8);

    -- Deduct for proximity to closing (-15 if <= 7 days with open issues)
    SELECT (closing_date - CURRENT_DATE) INTO days_to_closing 
    FROM deals WHERE id = $1;
    
    IF days_to_closing <= 7 AND (overdue_tasks_count > 0 OR missing_docs_count > 0) THEN
        score := score - 15;
    END IF;

    RETURN GREATEST(0, LEAST(100, score));
END;
$$ LANGUAGE plpgsql;

-- 3. Create a trigger function to update health_score automatically
CREATE OR REPLACE FUNCTION update_deal_health_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE deals 
    SET health_score = calculate_deal_health(id)
    WHERE id = CASE 
        WHEN TG_TABLE_NAME = 'deals' THEN NEW.id
        ELSE NEW.deal_id
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Apply triggers to tasks and documents
DROP TRIGGER IF EXISTS trigger_update_health_on_task ON tasks;
CREATE TRIGGER trigger_update_health_on_task
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION update_deal_health_trigger();

DROP TRIGGER IF EXISTS trigger_update_health_on_doc ON documents;
CREATE TRIGGER trigger_update_health_on_doc
AFTER INSERT OR UPDATE OR DELETE ON documents
FOR EACH ROW EXECUTE FUNCTION update_deal_health_trigger();

-- 5. Initial update for all existing deals
UPDATE deals SET health_score = calculate_deal_health(id);
