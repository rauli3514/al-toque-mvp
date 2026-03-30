-- Migration: Add slug to businesses
-- Run in Supabase SQL Editor

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Generate slugs for existing businesses (removes accents/special chars)
UPDATE public.businesses
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(name, '[áàäâ]', 'a', 'gi'),
      '[éèëê]', 'e', 'gi'
    ),
    '[^a-z0-9]+', '-', 'g'
  )
) || '-' || SUBSTRING(id::text, 1, 4)
WHERE slug IS NULL;

-- Make slug unique and not null going forward
ALTER TABLE public.businesses
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_slug ON public.businesses(slug);
