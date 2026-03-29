-- Fix: Allow deleting businesses even when they have historical orders
-- Changes product_id FK in order_items from RESTRICT to SET NULL
-- This preserves order history but allows product/business deletion

ALTER TABLE public.order_items 
  DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;

ALTER TABLE public.order_items 
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.order_items 
  ADD CONSTRAINT order_items_product_id_fkey 
  FOREIGN KEY (product_id) 
  REFERENCES public.products(id) 
  ON DELETE SET NULL;
