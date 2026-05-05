import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  generateRSAKeyPair,
  generateSalt,
  deriveWrappingKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  exportPublicKey,
  importPublicKey,
  base64ToArrayBuffer,
  arrayBufferToBase64
} from "@/lib/crypto";
import { useLocation } from "wouter";

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  publicKey: string;
}

interface CryptoContextType {
  privateKey: CryptoKey | null;
  publicKey: CryptoKey | null;
  currentUser: UserProfile | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  logout: () => void;
  getPublicKey: (userId: string) => Promise<CryptoKey>;
}

const CryptoContext = createContext<CryptoContextType | null>(null);

export function CryptoProvider({ children }: { children: ReactNode }) {
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [publicKey, setPublicKey] = useState<CryptoKey | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const publicKeyCache = new Map<string, CryptoKey>();

  useEffect(() => {
    // Check session storage for session state
    const sessionData = sessionStorage.getItem("whisperbox_session");
    if (sessionData && !privateKey) {
      const parsed = JSON.parse(sessionData);
      if (parsed.refreshToken) {
        // We have a session but need to unlock it
        if (location.pathname !== "/unlock") {
          // If we're not already on unlock, we'll let the router handle it 
          // based on isAuthenticated (which is false until unlocked)
        }
      }
    }
  }, [privateKey]);

  const loadUserAndKeys = async (token: string, passwordString: string, wrappedPkB64: string, saltB64: string) => {
    const meRes = await apiFetch("/auth/me", { token });
    setCurrentUser(meRes);

    const salt = new Uint8Array(base64ToArrayBuffer(saltB64));
    const wrappingKey = await deriveWrappingKey(passwordString, salt);
    
    try {
      const pKey = await unwrapPrivateKey(base64ToArrayBuffer(wrappedPkB64), wrappingKey);
      setPrivateKey(pKey);
      
      const pubKey = await importPublicKey(meRes.publicKey);
      setPublicKey(pubKey);
      setAccessToken(token);
    } catch (e) {
      throw new Error("Invalid password");
    }
  };

  const login = async (username: string, passwordString: string) => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password: passwordString }),
    });

    sessionStorage.setItem("whisperbox_session", JSON.stringify({
      refreshToken: res.refreshToken,
      wrappedPrivateKey: res.wrappedPrivateKey,
      pbkdf2Salt: res.pbkdf2Salt,
    }));

    await loadUserAndKeys(res.accessToken, passwordString, res.wrappedPrivateKey, res.pbkdf2Salt);
  };

  const register = async (username: string, displayName: string, passwordString: string) => {
    const keyPair = await generateRSAKeyPair();
    const salt = generateSalt();
    const wrappingKey = await deriveWrappingKey(passwordString, salt);
    
    const wrappedPrivateKeyBuf = await wrapPrivateKey(keyPair.privateKey, wrappingKey);
    const publicKeyB64 = await exportPublicKey(keyPair.publicKey);
    const wrappedPrivateKeyB64 = arrayBufferToBase64(wrappedPrivateKeyBuf);
    const saltB64 = arrayBufferToBase64(salt.buffer);

    const res = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        displayName,
        publicKey: publicKeyB64,
        wrappedPrivateKey: wrappedPrivateKeyB64,
        pbkdf2Salt: saltB64
      }),
    });

    sessionStorage.setItem("whisperbox_session", JSON.stringify({
      refreshToken: res.refreshToken,
      wrappedPrivateKey: wrappedPrivateKeyB64,
      pbkdf2Salt: saltB64,
    }));

    setPrivateKey(keyPair.privateKey);
    setPublicKey(keyPair.publicKey);
    setAccessToken(res.accessToken);
    
    const meRes = await apiFetch("/auth/me", { token: res.accessToken });
    setCurrentUser(meRes);
  };

  const unlock = async (passwordString: string) => {
    const sessionData = sessionStorage.getItem("whisperbox_session");
    if (!sessionData) throw new Error("No session found");
    const session = JSON.parse(sessionData);

    const refreshRes = await apiFetch("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: session.refreshToken })
    });

    await loadUserAndKeys(refreshRes.accessToken, passwordString, session.wrappedPrivateKey, session.pbkdf2Salt);
  };

  const logout = useCallback(() => {
    sessionStorage.removeItem("whisperbox_session");
    setPrivateKey(null);
    setPublicKey(null);
    setCurrentUser(null);
    setAccessToken(null);
    setLocation("/login");
  }, [setLocation]);

  const getPublicKey = async (userId: string) => {
    if (publicKeyCache.has(userId)) return publicKeyCache.get(userId)!;
    
    const res = await apiFetch(`/users/${userId}/public-key`, { token: accessToken! });
    const key = await importPublicKey(res.publicKey);
    publicKeyCache.set(userId, key);
    return key;
  };

  return (
    <CryptoContext.Provider
      value={{
        privateKey,
        publicKey,
        currentUser,
        accessToken,
        isAuthenticated: !!privateKey && !!accessToken,
        login,
        register,
        unlock,
        logout,
        getPublicKey
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
}

export function useCrypto() {
  const context = useContext(CryptoContext);
  if (!context) throw new Error("useCrypto must be used within a CryptoProvider");
  return context;
}
