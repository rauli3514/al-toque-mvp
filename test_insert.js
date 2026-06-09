import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
const url = env.split('\n').find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim();
const key = env.split('\n').find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim();
const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.from('businesses')
      .insert({ 
        name: "prueba de registro", 
        business_type: "FOOD", 
        slug: "prueba-de-registro",
        whatsapp_number: null
      })
      .select()
      .single();
  console.log("Error:", error);
}
test();
