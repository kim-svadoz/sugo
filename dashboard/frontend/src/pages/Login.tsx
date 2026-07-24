import { useAuth } from "../auth/AuthContext.js";

export function Login() {
  const { login } = useAuth();
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="ck-glass ck-card ck-scan text-center">
        <h1 className="mb-4 font-mono text-xl ck-text-glow" style={{ color: "var(--color-primary)" }}>
          SUGÒ Console
        </h1>
        <button
          type="button"
          onClick={() => void login()}
          className="ck-glow-cyan rounded px-4 py-2 text-sm"
          style={{ border: "1px solid var(--color-primary)" }}
        >
          Sign in
        </button>
      </div>
    </div>
  );
}
