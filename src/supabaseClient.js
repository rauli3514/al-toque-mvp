import { createClient } from '@supabase/supabase-js'

// Debes reemplazar estas variables con las de tu proyecto en Supabase.
// La arquitectura de Base de Datos que mencionaste se conectará a través de esta instancia.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tu-proyecto.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'tu-llave-anonima'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
