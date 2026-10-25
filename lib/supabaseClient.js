import { createClient } from "@supabase/supabase-js";

if (typeof window === "undefined" && !globalThis.WebSocket) {
  try {
    const ws = require("ws");
    globalThis.WebSocket = ws;
  } catch (e) {
    // ws optional fallback
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = () => {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabaseKey) &&
    !supabaseUrl.includes("your-project") &&
    supabaseUrl.startsWith("http")
  );
};

// Client for browser usage (anonymous / user authenticated sessions)
export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

// Server / Admin client (for API routes)
export const getSupabaseServerClient = () => {
  if (!isSupabaseConfigured()) return null;
  const keyToUse = supabaseServiceKey || supabaseKey;
  return createClient(supabaseUrl, keyToUse, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};
