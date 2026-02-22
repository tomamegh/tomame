import { createClient } from "@/lib/supabase/client"

export const signOut = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut()
}