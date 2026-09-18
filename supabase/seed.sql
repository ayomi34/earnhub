-- EarnHub catalogue seed data
-- Run after schema.sql in the Supabase SQL Editor.
-- Safe to run repeatedly: fixed IDs and upserts prevent duplicates.

insert into public.membership_levels
  (id, name, price, description, features, task_limit_per_day, referral_commission, enabled, sort_order)
values
  ('00000000-0000-0000-0000-000000000001', 'Starter', 6500,
   'Your entry point into legitimate digital earning.',
   '["Access to starter tasks", "Basic earning opportunities", "Full dashboard access", "Referral eligibility", "Standard support"]'::jsonb,
   3, 3, true, 1),
  ('00000000-0000-0000-0000-000000000002', 'Bronze', 15000,
   'More tasks, higher limits, faster growth.',
   '["Access to more tasks", "Higher daily task limits", "Increased earning opportunities", "Referral eligibility", "Priority support"]'::jsonb,
   6, 5, true, 2),
  ('00000000-0000-0000-0000-000000000003', 'Silver', 30000,
   'Premium tasks for serious earners.',
   '["Higher daily task limits", "Premium earning opportunities", "Higher referral commission", "Priority support", "Early access to new tasks"]'::jsonb,
   10, 8, true, 3),
  ('00000000-0000-0000-0000-000000000004', 'Gold', 50000,
   'Maximum access for top performers.',
   '["Maximum task access", "All premium opportunities", "Highest earning limits", "Highest referral commission", "Priority support"]'::jsonb,
   20, 10, true, 4)
on conflict (id) do update set
  name = excluded.name,
  price = excluded.price,
  description = excluded.description,
  features = excluded.features,
  task_limit_per_day = excluded.task_limit_per_day,
  referral_commission = excluded.referral_commission,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order;

insert into public.tasks
  (id, title, description, instructions, category, reward, est_minutes, max_submissions, daily_limit, level_ids, verification, starts_at, ends_at, status)
values
  ('10000000-0000-0000-0000-000000000001', 'Verify 20 product records',
   'Cross-check 20 product names, prices and SKUs against the provided source sheet and flag mismatches.',
   '1. Open the worksheet link.\n2. Compare each row with the source sheet.\n3. Submit the completed worksheet link.',
   'Data Entry', 450, 25, 200, 1,
   array['00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000004'::uuid],
   'manual_review', now(), now() + interval '90 days', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'Consumer habits survey (Lagos)',
   'Complete a 12-question survey about mobile shopping habits. Honest, complete answers only.',
   '1. Open the survey.\n2. Answer all questions honestly.\n3. Submit the completion code.',
   'Surveys', 300, 10, 500, 1,
   array['00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000004'::uuid],
   'manual_review', now(), now() + interval '90 days', 'active'),
  ('10000000-0000-0000-0000-000000000003', 'Transcribe a 3-minute voice note',
   'Listen to a short Hausa/English customer-service recording and transcribe it accurately.',
   '1. Open the audio link.\n2. Transcribe every audible word.\n3. Submit your transcription as proof.',
   'Content', 750, 30, 80, 1,
   array['00000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000004'::uuid],
   'manual_review', now(), now() + interval '90 days', 'active'),
  ('10000000-0000-0000-0000-000000000004', 'Categorize 50 social posts',
   'Label 50 short social-media posts as positive, neutral or negative using the provided rubric.',
   '1. Open the labeling sheet.\n2. Label all 50 rows.\n3. Submit the completed sheet link.',
   'Social Media', 600, 35, 150, 1,
   array['00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000004'::uuid],
   'manual_review', now(), now() + interval '90 days', 'active')
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  instructions = excluded.instructions,
  category = excluded.category,
  reward = excluded.reward,
  est_minutes = excluded.est_minutes,
  max_submissions = excluded.max_submissions,
  daily_limit = excluded.daily_limit,
  level_ids = excluded.level_ids,
  verification = excluded.verification,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  status = excluded.status;
