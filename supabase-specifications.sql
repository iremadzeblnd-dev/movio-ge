-- Run once in the Supabase SQL editor before saving specifications online.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS specifications jsonb NOT NULL DEFAULT '[]'::jsonb;
