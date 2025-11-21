import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

// Browser client - uses anon key, respects RLS policies
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
