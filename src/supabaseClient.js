import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

// Validate URL format
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const hasSupabaseConfig = Boolean(
  supabaseUrl && supabaseAnonKey && isValidUrl(supabaseUrl)
);

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
