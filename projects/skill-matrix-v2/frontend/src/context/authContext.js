import { createContext } from "react";

export const AuthContext = createContext({
  user: null,
  login: () => {},
  logout: () => {},
  setUser: () => {},
  updateManagerEmail: () => {},
  uploadCV: () => {},
  handleAuthCallback: () => {},
  token: null,
});
