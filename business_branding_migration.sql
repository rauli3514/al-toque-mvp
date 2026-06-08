-- Migration to add logo and banner to businesses
ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- Migration to update product type constraint (if needed, but already handled in overview)
-- ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_business_type_check;
-- ALTER TABLE public.businesses ADD CONSTRAINT businesses_business_type_check 
-- CHECK (business_type IN ('BAR', 'SHOP', 'RETAIL', 'FASHION', 'GIFTS', 'TECH', 'BEAUTY'));
