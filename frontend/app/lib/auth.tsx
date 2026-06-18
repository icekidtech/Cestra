"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { login as apiLogin, type LoginResponse } from "./api";

interface AuthState {
  token: string | null;
  walletAddress: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (zkloginToken: string, provider: "google" | "apple") => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "cestra_token";
const WALLET_KEY = "cestra_wallet";
const USER_KEY = "cestra_user_id";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    walletAddress: null,
    userId: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Hydrate from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEY);
    const walletAddress = localStorage.getItem(WALLET_KEY);
    const userId = localStorage.getItem(USER_KEY);

    if (token && walletAddress && userId) {
      setState({
        token,
        walletAddress,
        userId,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = useCallback(
    async (zkloginToken: string, provider: "google" | "apple") => {
      const response: LoginResponse = await apiLogin(zkloginToken, provider);

      localStorage.setItem(STORAGE_KEY, response.access_token);
      localStorage.setItem(WALLET_KEY, response.wallet_address);
      localStorage.setItem(USER_KEY, response.user_id);

      setState({
        token: response.access_token,
        walletAddress: response.wallet_address,
        userId: response.user_id,
        isAuthenticated: true,
        isLoading: false,
      });
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(WALLET_KEY);
    localStorage.removeItem(USER_KEY);

    setState({
      token: null,
      walletAddress: null,
      userId: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
