import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(envFile.split('\n').map(l => l.split('=')));

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase
      .from('businesses')
      .select('*, products(id, name, price, image_url, available, description, is_upsell_target, categories(name))')
      .neq('business_type', 'BAR');
  console.log("Error:", error);
  console.log("Data length:", data ? data.length : null);
}
test();
