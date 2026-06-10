import { create } from "zustand";
import {
  clearToken,
  getMe,
  login as apiLogin,
  register as apiRegister,
  setToken,
} from "../api/client";

// 鉴权状态（PRD §5.4）：token 持久化于 localStorage，user 内存态。

interface AuthUser {
  id: number;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  login: async (email, password) => {
    const r = await apiLogin(email, password);
    setToken(r.access_token);
    set({ user: { id: r.user_id, email: r.email } });
  },
  register: async (email, password) => {
    const r = await apiRegister(email, password);
    setToken(r.access_token); // 注册即登录（§5.4.3）
    set({ user: { id: r.user_id, email: r.email } });
  },
  logout: () => {
    clearToken();
    set({ user: null });
  },
  loadMe: async () => {
    const me = await getMe();
    set({ user: me, loading: false });
  },
}));
