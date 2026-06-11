import { create } from "zustand";
import {
  clearToken,
  getMe,
  login as apiLogin,
  register as apiRegister,
  setToken,
} from "../api/client";

// 鉴权状态（PRD §5.4）：token 持久化于 localStorage，user 内存态。
// 访客可完整规划；登录仅在用户主动点击或保存计划时触发（无静默登录）。

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
  bootstrap: () => Promise<void>;
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
  // 仅尝试用已存 token 恢复会话；无 token / 失效则保持访客态。
  bootstrap: async () => {
    set({ loading: true });
    try {
      const me = await getMe();
      set({ user: me, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
