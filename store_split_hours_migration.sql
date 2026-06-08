ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS open_time_hour_2 INT,
ADD COLUMN IF NOT EXISTS close_time_hour_2 INT;
