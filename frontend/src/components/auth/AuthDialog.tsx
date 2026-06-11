import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useAuthStore } from "../../store/authStore";
import { useUiStore } from "../../store/uiStore";

type Tab = "login" | "register";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthDialog() {
  const open = useUiStore((s) => s.authOpen);
  const afterAuth = useUiStore((s) => s.afterAuth);
  const closeAuth = useUiStore((s) => s.closeAuth);
  const showToast = useUiStore((s) => s.showToast);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setEmail("");
    setPassword("");
    setConfirm("");
    setError("");
  }

  function switchTab(next: Tab) {
    setTab(next);
    setError("");
  }

  async function submit() {
    setError("");
    if (!EMAIL_RE.test(email)) {
      setError("请输入有效的邮箱地址");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }
    if (tab === "register" && password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      if (tab === "login") await login(email, password);
      else await register(email, password);
      const cb = afterAuth;
      reset();
      closeAuth();
      showToast(tab === "login" ? "已登录" : "注册成功，已登录");
      cb?.();
    } catch (e) {
      setError((e as Error).message || "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          closeAuth();
        }
      }}
    >
      <DialogContent className="max-w-md border-line bg-surface">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-ink">
            {tab === "login" ? "登录 itravel" : "注册 itravel"}
          </DialogTitle>
          <DialogDescription className="text-stone">
            {tab === "login"
              ? "登录后即可保存行程，并随时回来继续编辑。"
              : "用邮箱创建账号，行程将与账号绑定持久化。"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-full bg-sand p-1">
          {(["login", "register"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 rounded-full py-1.5 text-sm font-semibold transition-all ${
                tab === t ? "bg-surface text-clay shadow-soft" : "text-stone hover:text-ink"
              }`}
            >
              {t === "login" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            autoComplete="email"
            className="w-full rounded-xl border border-line bg-ivory px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-clay"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tab === "login" && submit()}
            placeholder="密码（至少 8 位）"
            autoComplete={tab === "login" ? "current-password" : "new-password"}
            className="w-full rounded-xl border border-line bg-ivory px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-clay"
          />
          {tab === "register" && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="再次输入密码"
              autoComplete="new-password"
              className="w-full rounded-xl border border-line bg-ivory px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-clay"
            />
          )}
          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>

        <Button onClick={submit} disabled={busy} size="lg" className="w-full">
          {tab === "login" ? (
            <>
              <LogIn className="h-4 w-4" />
              {busy ? "登录中…" : "登录"}
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              {busy ? "注册中…" : "注册并登录"}
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
