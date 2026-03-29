-- Migration: Add print settings to businesses table
-- Run this in Supabase SQL Editor

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS order_output_mode TEXT
  NOT NULL DEFAULT 'SCREEN'
  CHECK (order_output_mode IN ('SCREEN', 'PRINT', 'BOTH'));

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS paper_width INT
  NOT NULL DEFAULT 80
  CHECK (paper_width IN (58, 80));
