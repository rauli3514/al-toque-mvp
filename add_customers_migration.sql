-- ══════════════════════════════════════════════════════
-- CUSTOMER RETENTION SYSTEM — Migration
-- Run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════

-- 1. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT,
    total_orders INT NOT NULL DEFAULT 0,
    last_order_at TIMESTAMPTZ,
    notes TEXT, -- internal business notes (future: tags, segments)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- One customer per phone per business
    UNIQUE(business_id, phone)
);

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_customers_business ON public.customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(business_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_top ON public.customers(business_id, total_orders DESC);

-- 3. AUTO-TIMESTAMP
CREATE TRIGGER update_customers_modtime
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 4. AUTO-UPSERT TRIGGER: runs when order.status → PAID
--    Increments total_orders and sets last_order_at
CREATE OR REPLACE FUNCTION upsert_customer_on_paid()
RETURNS TRIGGER AS $$
BEGIN
    -- Only fire when transitioning INTO PAID
    IF NEW.status = 'PAID' AND (OLD.status IS DISTINCT FROM 'PAID') AND NEW.customer_phone IS NOT NULL THEN
        INSERT INTO public.customers (business_id, phone, name, total_orders, last_order_at)
        VALUES (
            NEW.business_id,
            REGEXP_REPLACE(NEW.customer_phone, '[^0-9]', '', 'g'), -- strip non-digits
            NULLIF(TRIM(NEW.customer_name), ''),
            1,
            NOW()
        )
        ON CONFLICT (business_id, phone) DO UPDATE SET
            total_orders  = customers.total_orders + 1,
            last_order_at = NOW(),
            -- Only update name if not already set and new value provided
            name          = COALESCE(
                NULLIF(TRIM(EXCLUDED.name), ''),
                customers.name
            ),
            updated_at    = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_upsert_customer
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'PAID' AND OLD.status IS DISTINCT FROM 'PAID')
EXECUTE FUNCTION upsert_customer_on_paid();

-- 5. COMPUTED FIELD VIEW (loyalty_points = total_orders for now)
CREATE OR REPLACE VIEW public.customer_loyalty AS
SELECT
    c.*,
    c.total_orders AS loyalty_points,
    CASE
        WHEN c.total_orders >= 10 THEN 'GOLD'
        WHEN c.total_orders >= 5  THEN 'SILVER'
        ELSE 'BRONZE'
    END AS loyalty_tier,
    CASE
        WHEN c.total_orders >= 10 THEN '🏆 Cliente Gold'
        WHEN c.total_orders >= 5  THEN '⭐ Cliente frecuente'
        ELSE '🌱 Cliente nuevo'
    END AS tier_label
FROM public.customers c;

-- GRANT SELECT on view to anon/authenticated (for Supabase RLS)
-- Adjust according to your RLS policies if needed
