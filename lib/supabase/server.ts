import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { cookies } from "next/headers"

// Server client - uses service role key, bypasses RLS (use with caution!)
export const supabaseServer = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Create auth-aware client from request cookies (respects RLS, sees user session)
export async function createServerClient() {
  const cookieStore = await cookies()

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storage: {
          getItem: async (key: string) => {
            return cookieStore.get(key)?.value ?? null
          },
          setItem: async (key: string, value: string) => {
            cookieStore.set(key, value)
          },
          removeItem: async (key: string) => {
            cookieStore.delete(key)
          },
        },
      },
    }
  )
}
