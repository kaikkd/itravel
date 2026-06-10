import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { Alert, Button } from "./ui";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function AuthPanel() {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const emailOk = EMAIL_RE.test(email);
  const pwOk = password.length >= 8;
  const confirmOk = mode === "login" || password === confirm;
  const canSubmit = emailOk && pwOk && confirmOk && !busy;

  async function handleSubmit() {
    setError("");
    if (mode === "register" && password !== confirm) {
      setError("两次密码不一致");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-copy">
        <p className="section-kicker">Account</p>
        <h2>登录后保存你的行程</h2>
        <p>
          规划可直接体验。登录后，草案会绑定到账号，刷新或重登后仍可继续编辑。
        </p>
      </div>

      <div className="auth-form">
        <div className="segmented" role="tablist" aria-label="登录或注册">
          {(["login", "register"] as const).map((m) => (
            <Button
              key={m}
              variant={mode === m ? "primary" : "ghost"}
              onClick={() => {
                setMode(m);
                setError("");
              }}
              type="button"
              role="tab"
              aria-selected={mode === m}
            >
              {m === "login" ? "登录" : "注册"}
            </Button>
          ))}
        </div>

        <div>
          <input
            className="form-input"
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {email && !emailOk && <div className="field-error">邮箱格式不正确</div>}

        <div>
          <input
            className="form-input"
            type="password"
            placeholder="密码（至少 8 位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {password && !pwOk && <div className="field-error">密码至少 8 位</div>}

        {mode === "register" && (
          <>
            <input
              className="form-input"
              type="password"
              placeholder="确认密码"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {confirm && !confirmOk && (
              <div className="field-error">两次密码不一致</div>
            )}
          </>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {busy ? "提交中…" : mode === "login" ? "登录" : "注册并登录"}
        </Button>
      </div>
    </div>
  );
}
