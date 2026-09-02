import { createClient } from "@supabase/supabase-js";

// Untyped client: our hand-written types in lib/types.ts describe the row
// shapes we use, but don't try to satisfy supabase-js's generic Database
// constraint (its exact shape has drifted across versions). Query results
// are cast to our own types at the call site instead.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey);
