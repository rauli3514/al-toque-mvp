-- MIGRATION: MARKETPLACE EVENTS
-- Tablas necesarias para crear eventos que agrupan comercios (exclusivamente tiendas/catálogos).

-- 1. Tabla de Eventos
CREATE TABLE IF NOT EXISTS public.events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    location TEXT,
    contact TEXT,
    instagram TEXT,
    banner_url TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para auto-timestamp en events
DROP TRIGGER IF EXISTS update_events_modtime ON public.events;
CREATE TRIGGER update_events_modtime 
BEFORE UPDATE ON public.events 
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 2. Tabla intermedia para vincular eventos con comercios
CREATE TABLE IF NOT EXISTS public.event_businesses (
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (event_id, business_id)
);

-- 3. Índices para mejorar rendimiento de búsquedas
CREATE INDEX IF NOT EXISTS idx_events_slug ON public.events(slug);
CREATE INDEX IF NOT EXISTS idx_events_active ON public.events(is_active);

-- Opcional: Índice de texto en productos para agilizar la búsqueda global del Marketplace
-- (Suponiendo que se usará ILIKE en nombre del producto, el índice trigram o índice simple puede ayudar)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS trgm_idx_products_name ON public.products USING gin (name gin_trgm_ops);
