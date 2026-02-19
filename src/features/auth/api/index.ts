import { supabase } from "@/lib/supabase/client"

export const signOut = async () => {
    const { error } = await supabase.auth.signOut()
}