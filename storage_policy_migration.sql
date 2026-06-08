-- Create the products bucket if it doesn't already exist (and make it public)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('products', 'products', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop previous policies to avoid duplication errors
DROP POLICY IF EXISTS "Allow public uploads to products bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to products bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletion to products bucket" ON storage.objects;

-- Allow public uploads
CREATE POLICY "Allow public uploads to products bucket"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'products');

-- Allow public updates
CREATE POLICY "Allow public updates to products bucket"
ON storage.objects FOR UPDATE TO public
WITH CHECK (bucket_id = 'products');

-- Allow public deletions
CREATE POLICY "Allow public deletion to products bucket"
ON storage.objects FOR DELETE TO public
USING (bucket_id = 'products');
