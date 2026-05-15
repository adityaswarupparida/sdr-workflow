"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { setError("Username and password are required."); return; }
    setSubmitting(true); setError("");
    const res = await fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Sign in failed.");
      setSubmitting(false);
      return;
    }
    const next = params.get("next") || "/";
    router.replace(next);
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-mark">SDR</div>
        <div className="login-title">Welcome back</div>
        <div className="login-subtitle">Sign in to your SDR Console.</div>

        <form onSubmit={onSubmit}>
          <div className="form-field">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              id="username" className="form-input" autoFocus autoComplete="username"
              value={username} onChange={e => setUsername(e.target.value)} placeholder="admin"
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password" type="password" className="form-input" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 6 }} disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-shell"><div className="login-card"><div className="loading-row">Loading…</div></div></div>}>
      <LoginInner />
    </Suspense>
  );
}
