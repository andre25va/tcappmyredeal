import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[TC Command] Supabase env vars not set — falling back to localStorage.\n' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment.'
  );
} else {
  console.info('[TC Command] Supabase connected to:', supabaseUrl);
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
