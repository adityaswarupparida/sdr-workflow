"use client";

import { useEffect, useState } from "react";

export type SessionUser = {
  id: string;
  username: string;
  role: "admin" | "manager" | "rep";
  repId?: string;
  createdAt: string;
};

export function useSession(): { user: SessionUser | null; loading: boolean } {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!cancelled) {
          if (res.ok) setUser((await res.json()) as SessionUser);
          else setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { user, loading };
}
