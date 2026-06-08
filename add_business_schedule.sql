-- Migration: Add schedule settings to businesses table
-- Run this in Supabase SQL Editor

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS open_time_hour INT NOT NULL DEFAULT 16 CHECK (open_time_hour >= 0 AND open_time_hour <= 23);

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS close_time_hour INT NOT NULL DEFAULT 4 CHECK (close_time_hour >= 0 AND close_time_hour <= 23);
