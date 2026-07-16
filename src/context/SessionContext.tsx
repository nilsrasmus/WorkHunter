import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import type { Profile, ProfileSettings } from "../types";

interface SessionContextValue {
  profile: Profile | null;
  settings: ProfileSettings | null;
  loading: boolean;
  refreshSession: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  setProfile: (p: Profile | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    if (!profile) {
      setSettings(null);
      return;
    }
    const s = await api.getSettings(profile.id);
    setSettings(s);
  }, [profile]);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const session = await api.getSession();
      setProfile(session.profile);
      if (session.profile) {
        const s = await api.getSettings(session.profile.id);
        setSettings(s);
      } else {
        setSettings(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  return (
    <SessionContext.Provider
      value={{
        profile,
        settings,
        loading,
        refreshSession,
        refreshSettings,
        setProfile,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
