-- MULTI-BUSINESS MARKETPLACE FOUNDATION MIGRATION
-- Run this in Supabase SQL Editor

-- PART 1 & 4: Create the global platform users table
CREATE TABLE IF NOT EXISTS public.platform_users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    total_platform_orders INT DEFAULT 0,
    preferred_categories JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PART 2 & 3: Link existing business `customers` to `platform_users`
-- This maintains business isolation (PART 3) while keeping a global relationship (PART 2)
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS platform_user_id UUID REFERENCES public.platform_users(id) ON DELETE SET NULL;

-- Automatically migrate any existing customers to platform_users
INSERT INTO public.platform_users (phone, name, total_platform_orders)
SELECT phone, MAX(name), SUM(total_orders)
FROM public.customers
GROUP BY phone
ON CONFLICT (phone) DO NOTHING;

-- Map the existing customers to the newly created platform_users
UPDATE public.customers c
SET platform_user_id = pu.id
FROM public.platform_users pu
WHERE c.phone = pu.phone AND c.platform_user_id IS NULL;

-- Modifying the existing customer trigger to handle global upserting first (PART 5)
CREATE OR REPLACE FUNCTION upsert_customer_on_paid()
RETURNS TRIGGER AS $$
DECLARE
    clean_phone TEXT;
    v_platform_user_id UUID;
BEGIN
    -- Only fire when transitioning INTO PAID
    IF NEW.status = 'PAID' AND (OLD.status IS DISTINCT FROM 'PAID') AND NEW.customer_phone IS NOT NULL THEN
        clean_phone := REGEXP_REPLACE(NEW.customer_phone, '[^0-9]', '', 'g');
        
        IF length(clean_phone) > 0 THEN
            -- A) Upsert into global platform_users
            INSERT INTO public.platform_users (phone, name, total_platform_orders)
            VALUES (
                clean_phone, 
                NULLIF(TRIM(NEW.customer_name), ''), 
                1
            )
            ON CONFLICT (phone) DO UPDATE SET
                total_platform_orders = platform_users.total_platform_orders + 1,
                name = COALESCE(NULLIF(TRIM(EXCLUDED.name), ''), platform_users.name),
                updated_at = NOW()
            RETURNING id INTO v_platform_user_id;

            -- B) Upsert into isolated business customers table
            INSERT INTO public.customers (business_id, phone, name, total_orders, last_order_at, platform_user_id)
            VALUES (
                NEW.business_id,
                clean_phone,
                NULLIF(TRIM(NEW.customer_name), ''),
                1,
                NOW(),
                v_platform_user_id
            )
            ON CONFLICT (business_id, phone) DO UPDATE SET
                total_orders  = customers.total_orders + 1,
                last_order_at = NOW(),
                platform_user_id = v_platform_user_id,
                -- Only update name if not already set and new value provided
                name          = COALESCE(NULLIF(TRIM(EXCLUDED.name), ''), customers.name),
                updated_at    = NOW();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
