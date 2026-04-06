-- Seed default milestone notification rules per MLS
-- CAR (IL), Heartland MLS (KS), Heartland MLS (MO)
INSERT INTO mls_milestone_config (mls_id, milestone_type_id, notify_agent, notify_buyer, notify_seller, days_before_notification, due_days_from_contract)
SELECT m.mls_id, mt.id, m.notify_agent, m.notify_buyer, m.notify_seller, m.days_before, m.due_days
FROM (VALUES
  -- CAR IL (attorney review included)
  ('f0467a62-2bc0-4152-95f3-64ad6cfcf047'::uuid, 'emd_due',          true,  true,  false, 3, 3),
  ('f0467a62-2bc0-4152-95f3-64ad6cfcf047'::uuid, 'attorney_review',  true,  true,  true,  2, 5),
  ('f0467a62-2bc0-4152-95f3-64ad6cfcf047'::uuid, 'inspection_period',true,  true,  false, 3, 10),
  ('f0467a62-2bc0-4152-95f3-64ad6cfcf047'::uuid, 'appraisal',        true,  false, false, 5, 21),
  ('f0467a62-2bc0-4152-95f3-64ad6cfcf047'::uuid, 'loan_approval',    true,  true,  false, 7, 21),
  ('f0467a62-2bc0-4152-95f3-64ad6cfcf047'::uuid, 'final_walkthrough',true,  true,  false, 2, 28),
  ('f0467a62-2bc0-4152-95f3-64ad6cfcf047'::uuid, 'closing',          true,  true,  true,  7, 30),
  -- Heartland KS
  ('dd0a3c60-dc49-4d3d-a86e-6d83c46cf2d8'::uuid, 'emd_due',          true,  true,  false, 3, 3),
  ('dd0a3c60-dc49-4d3d-a86e-6d83c46cf2d8'::uuid, 'inspection_period',true,  true,  false, 3, 10),
  ('dd0a3c60-dc49-4d3d-a86e-6d83c46cf2d8'::uuid, 'appraisal',        true,  false, false, 5, 21),
  ('dd0a3c60-dc49-4d3d-a86e-6d83c46cf2d8'::uuid, 'loan_approval',    true,  true,  false, 7, 21),
  ('dd0a3c60-dc49-4d3d-a86e-6d83c46cf2d8'::uuid, 'final_walkthrough',true,  true,  false, 2, 28),
  ('dd0a3c60-dc49-4d3d-a86e-6d83c46cf2d8'::uuid, 'closing',          true,  true,  true,  7, 30),
  -- Heartland MO
  ('9469ad05-d6ef-40d6-a3f6-8369e70083b1'::uuid, 'emd_due',          true,  true,  false, 3, 3),
  ('9469ad05-d6ef-40d6-a3f6-8369e70083b1'::uuid, 'inspection_period',true,  true,  false, 3, 10),
  ('9469ad05-d6ef-40d6-a3f6-8369e70083b1'::uuid, 'appraisal',        true,  false, false, 5, 21),
  ('9469ad05-d6ef-40d6-a3f6-8369e70083b1'::uuid, 'loan_approval',    true,  true,  false, 7, 21),
  ('9469ad05-d6ef-40d6-a3f6-8369e70083b1'::uuid, 'final_walkthrough',true,  true,  false, 2, 28),
  ('9469ad05-d6ef-40d6-a3f6-8369e70083b1'::uuid, 'closing',          true,  true,  true,  7, 30)
) AS m(mls_id, milestone_key, notify_agent, notify_buyer, notify_seller, days_before, due_days)
JOIN milestone_types mt ON mt.key = m.milestone_key
ON CONFLICT DO NOTHING;
