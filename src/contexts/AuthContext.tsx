import { createContext, type ReactNode, useContext } from "react";

const AuthContext = createContext<{ logout: () => void }>({ logout: () => undefined });

export function AuthProvider({ children, logout }: { children: ReactNode; logout: () => void }) {
  return <AuthContext.Provider value={{ logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
