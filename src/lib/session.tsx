import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  setAccessToken,
  setOnUnauthorized,
  type AuthResponse,
  type UserProfile,
} from "@/lib/api";
import {
  generateRegistrationKeys,
  importPublicKey,
  unwrapPrivateKey,
} from "@/lib/crypto";

const REFRESH_KEY = "wb_refresh_token";

interface SessionState {
  user: UserProfile | null;
  privateKey: CryptoKey | null;
  publicKey: CryptoKey | null;
  ready: boolean;
}

interface SessionContextValue extends SessionState {
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    displayName: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    user: null,
    privateKey: null,
    publicKey: null,
    ready: false,
  });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAuthResponse = async (auth: AuthResponse, password: string) => {
    setAccessToken(auth.access_token);
    localStorage.setItem(REFRESH_KEY, auth.refresh_token);
    scheduleRefresh(auth.expires_in);
    const privateKey = await unwrapPrivateKey(
      password,
      auth.user.pbkdf2_salt,
      auth.user.wrapped_private_key,
    );
    const publicKey = await importPublicKey(auth.user.public_key);
    setState({ user: auth.user, privateKey, publicKey, ready: true });
  };

  const scheduleRefresh = (expiresIn: number) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const ms = Math.max(10_000, (expiresIn - 60) * 1000);
    refreshTimer.current = setTimeout(async () => {
      const rt = localStorage.getItem(REFRESH_KEY);
      if (!rt) return;
      try {
        const r = await api.refresh(rt);
        setAccessToken(r.access_token);
        scheduleRefresh(r.expires_in);
      } catch {
        await doLogout();
      }
    }, ms);
  };

  const doLogout = async () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const rt = localStorage.getItem(REFRESH_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setAccessToken(null);
    if (rt) {
      try {
        await api.logout(rt);
      } catch {
        // ignore
      }
    }
    setState({ user: null, privateKey: null, publicKey: null, ready: true });
  };

  useEffect(() => {
    setOnUnauthorized(() => {
      // best-effort: drop session
      void doLogout();
    });
    // No persistent session restore — private key requires the password.
    setState((s) => ({ ...s, ready: true }));
    localStorage.removeItem(REFRESH_KEY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      login: async (username, password) => {
        const auth = await api.login({ username, password });
        await handleAuthResponse(auth, password);
      },
      register: async (username, displayName, password) => {
        const keys = await generateRegistrationKeys(password);
        const auth = await api.register({
          username,
          display_name: displayName,
          password,
          public_key: keys.publicKeyB64,
          wrapped_private_key: keys.wrappedPrivateKeyB64,
          pbkdf2_salt: keys.pbkdf2SaltB64,
        });
        setAccessToken(auth.access_token);
        localStorage.setItem(REFRESH_KEY, auth.refresh_token);
        scheduleRefresh(auth.expires_in);
        setState({
          user: auth.user,
          privateKey: keys.privateKey,
          publicKey: keys.publicKey,
          ready: true,
        });
      },
      logout: doLogout,
    }),
    [state],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
