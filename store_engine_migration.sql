-- Step 1: Update business_type constraint
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_business_type_check;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_business_type_check 
CHECK (business_type IN ('BAR', 'SHOP', 'RETAIL', 'FASHION', 'GIFTS', 'TECH', 'BEAUTY'));

-- Step 2: PRODUCT VARIANTS SYSTEM
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    option1 TEXT, -- (color)
    option2 TEXT, -- (size / capacity)
    price_modifier DECIMAL(10,2) DEFAULT 0.00,
    stock INT DEFAULT -1, -- -1 means infinite/not tracked
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-Trigger for product_variants updated_at
DROP TRIGGER IF EXISTS update_product_variants_modtime ON public.product_variants;
CREATE TRIGGER update_product_variants_modtime 
BEFORE UPDATE ON public.product_variants 
FOR EACH ROW EXECUTE FUNCTION update_modified_column();


-- Step 3: FLEXIBLE ATTRIBUTES
CREATE TABLE IF NOT EXISTS public.product_attributes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    attribute_name TEXT NOT NULL,
    attribute_value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 6: IMAGE HANDLING
CREATE TABLE IF NOT EXISTS public.product_images (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
