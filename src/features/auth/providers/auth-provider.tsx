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
  type SupabaseClient,
} from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PlatformUser } from "@/features/users/types";

// Define the shape of our context
type AuthContextType = {
  supabase: SupabaseClient;
  session: Session | null;
  user: PlatformUser | null;
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
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      setSession(currentSession);

      if (currentSession?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, role, bio, created_at, updated_at")
          .eq("id", currentSession.user.id)
          .single();

        setUser({
          ...currentSession.user,
          profile: profile
            ? {
                id: profile.id,
                role: profile.role,
                first_name: profile.first_name ?? undefined,
                last_name: profile.last_name ?? undefined,
                bio: profile.bio ?? undefined,
                created_at: new Date(profile.created_at),
                updated_at: new Date(profile.updated_at),
              }
            : {
                id: currentSession.user.id,
                role: "user" as const,
                created_at: new Date(),
                updated_at: new Date(),
              },
        });
      } else {
        setUser(null);
      }

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
