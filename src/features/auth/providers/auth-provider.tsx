"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  type Session,
  type User,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PlatformUser } from "@/features/users/types";

// Define the shape of our context
type AuthContextType = {
  supabase: SupabaseClient;
  session: Session | null;
  user: User | null;
  isLoading: boolean;
};

const Context = createContext<AuthContextType | undefined>(undefined);

export default function SupabaseSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = createClient();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      setSession(currentSession);
      setUser((currentSession?.user as PlatformUser) ?? null);
      setIsLoading(false);

      // Handle specific events
      switch (event) {
        case "SIGNED_IN":
          router.refresh();
          break;
        case "SIGNED_OUT":
          setSession(null);
          setUser(null);
          router.push("/");
          router.refresh();
          break;
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router]);

  return (
    <Context.Provider value={{ supabase, session, user, isLoading }}>
      {children}
    </Context.Provider>
  );
}

// Custom hook for easy access
export const useSession = () => {
  const context = useContext(Context);
  if (context === undefined) {
    throw new Error("useSession must be used inside SupabaseSessionProvider");
  }
  return context;
};
