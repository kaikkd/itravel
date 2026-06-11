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

// 默认管理员（无登录页方案）：与后端 auth.ensure_default_admin 一致。
const DEFAULT_ADMIN_EMAIL = "admin@123.com";
const DEFAULT_ADMIN_PASSWORD = "12345678";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadMe: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
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
  // 无登录页：先尝试恢复会话，失败则用默认管理员静默登录。
  bootstrap: async () => {
    set({ loading: true });
    try {
      const me = await getMe();
      if (me) {
        set({ user: me, loading: false });
        return;
      }
      await get().login(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD);
    } catch {
      // 后端不可用时也不阻塞页面，仅保持未登录态。
    } finally {
      set({ loading: false });
    }
  },
}));
