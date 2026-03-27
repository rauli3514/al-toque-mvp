-- 0. CLEANUP (Evitar errores "relation already exists")
DO $$ DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('payments', 'order_items', 'orders', 'promotion_targets', 'promotions', 'products', 'categories', 'business_sequences', 'businesses')) LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS update_modified_column CASCADE;
DROP FUNCTION IF EXISTS set_display_number CASCADE;
DROP FUNCTION IF EXISTS validate_order_status_transition CASCADE;
DROP FUNCTION IF EXISTS calculate_order_total CASCADE;
DROP FUNCTION IF EXISTS enforce_order_items_lock CASCADE;

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 2. TABLAS PRINCIPALES (Core & Menú)
-- ==========================================

CREATE TABLE public.businesses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.business_sequences (
    business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
    last_order_number INT DEFAULT 0
);

CREATE TABLE public.categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    image_url TEXT,
    available BOOLEAN DEFAULT TRUE,
    is_upsell_target BOOLEAN DEFAULT FALSE,
    is_combo BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Soft Delete Support
);

-- ==========================================
-- 3. PROMICIONES (Sistema Escalable Relacional)
-- ==========================================

CREATE TABLE public.promotions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    promo_type TEXT NOT NULL CHECK (promo_type IN ('GLOBAL', 'CATEGORY', 'PRODUCT', 'HAPPY_HOUR')),
    value DECIMAL(10,2) NOT NULL,
    is_percentage BOOLEAN DEFAULT TRUE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.promotion_targets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    -- Ambos nulos permiten Promociones Globales. Si hay uno referenciado, el otro debe ser nulo.
    CHECK (
        (category_id IS NULL AND product_id IS NULL) OR
        (category_id IS NOT NULL AND product_id IS NULL) OR 
        (category_id IS NULL AND product_id IS NOT NULL)
    ),
    UNIQUE(promotion_id, category_id, product_id)
);

-- ==========================================
-- 4. FLUJO DE VENTAS Y PAGOS
-- ==========================================

CREATE TABLE public.orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    display_number INT, 
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    customer_name TEXT,
    customer_phone TEXT,
    order_type TEXT NOT NULL CHECK (order_type IN ('PICKUP', 'TABLE', 'DELIVERY')) DEFAULT 'PICKUP',
    status TEXT NOT NULL CHECK (
        status IN (
            'CREATED', 
            'PENDING_PAYMENT', 
            'PENDING_PAYMENT_CASH', 
            'PAID', 
            'IN_PREPARATION', 
            'READY', 
            'DELIVERED', 
            'CANCELLED'
        )
    ) DEFAULT 'CREATED',
    total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    customer_notes TEXT,
    payment_method TEXT CHECK (payment_method IN ('QR', 'TRANSFER', 'CASH', 'MERCADOPAGO')),
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('QR', 'TRANSFER', 'CASH', 'MERCADOPAGO')),
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')) DEFAULT 'PENDING',
    amount DECIMAL(10,2) NOT NULL,
    external_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 5. ÍNDICES DE PERFORMANCE RADICAL
-- ==========================================

CREATE INDEX idx_orders_business_status ON public.orders(business_id, status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_payments_order_id ON public.payments(order_id);
-- Unique index para evitar Múltiples pagos en una misma orden
CREATE UNIQUE INDEX idx_payments_single_approved ON public.payments(order_id) WHERE status = 'APPROVED';
-- Optimización Promociones
CREATE INDEX idx_promotions_active_time ON public.promotions(business_id, active, start_time, end_time);
-- Filtro catálogo Soft Delete
CREATE INDEX idx_products_deleted_at ON public.products(business_id) WHERE deleted_at IS NULL;

-- ==========================================
-- 6. TRIGGERS Y LÓGICAS
-- ==========================================

-- 6.1 Secuencia Número de Ticket Independiente (Concurrency-Safe SELECT FOR UPDATE)
CREATE OR REPLACE FUNCTION set_display_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INT;
BEGIN
    INSERT INTO public.business_sequences (business_id, last_order_number)
    VALUES (NEW.business_id, 0)
    ON CONFLICT DO NOTHING;

    SELECT last_order_number + 1 INTO next_num
    FROM public.business_sequences
    WHERE business_id = NEW.business_id
    FOR UPDATE;

    UPDATE public.business_sequences
    SET last_order_number = next_num
    WHERE business_id = NEW.business_id;

    NEW.display_number := next_num;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_display_num
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION set_display_number();


-- 6.2 Data Integrity: Bloqueo modificaciones Order Items si orden cerró o pasó de estado
CREATE OR REPLACE FUNCTION enforce_order_items_lock()
RETURNS TRIGGER AS $$
DECLARE
    parent_status TEXT;
BEGIN
    SELECT status INTO parent_status FROM public.orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);
    IF parent_status != 'CREATED' THEN
        RAISE EXCEPTION 'Cannot modify items once order is no longer CREATED (Current: %)', parent_status;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enforce_order_items_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION enforce_order_items_lock();


-- 6.3 Data Integrity: Calcular Total Automático
CREATE OR REPLACE FUNCTION calculate_order_total()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        UPDATE public.orders 
        SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM public.order_items WHERE order_id = OLD.order_id)
        WHERE id = OLD.order_id;
        RETURN OLD;
    ELSE
        UPDATE public.orders 
        SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM public.order_items WHERE order_id = NEW.order_id)
        WHERE id = NEW.order_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_order_total
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION calculate_order_total();


-- 6.4 State Machine Orders
CREATE OR REPLACE FUNCTION validate_order_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();

    -- Reglas de Cancelación
    IF NEW.status = 'CANCELLED' AND OLD.status IN ('DELIVERED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Cannot cancel an already completed or cancelled order.';
    END IF;

    -- Regla IN_PREPARATION: Solo si está pagado
    IF NEW.status = 'IN_PREPARATION' AND OLD.status != 'PAID' THEN
        RAISE EXCEPTION 'Order STRICTLY MUST be PAID before IN_PREPARATION';
    END IF;

    -- Analytics Auto-fill: Set paid_at if transitioning to PAID
    IF NEW.status = 'PAID' AND OLD.status != 'PAID' THEN
        NEW.paid_at = NOW();
    END IF;

    -- Bloqueo mutaciones post finalización
    IF OLD.status IN ('DELIVERED', 'CANCELLED') AND NEW.status NOT IN ('DELIVERED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Cannot change status of a closed order';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_order_status
BEFORE UPDATE ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION validate_order_status_transition();


-- 6.5 Auto-Timestamps básicos
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_modtime BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_categories_modtime BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_payments_modtime BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_promotions_modtime BEFORE UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION update_modified_column();
