"use client";

import { useRouter } from "next/navigation";
import type { SessionUser } from "../hooks/use-session";

export function initials(name: string): string {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
}

export function Sidebar({ user, pendingCount = 0, page }: {
  user: SessionUser;
  pendingCount?: number;
  page: "conversations" | "reps";
}) {
  const router = useRouter();
  const isRep = user.role === "rep";
  const isAdmin = user.role === "admin";

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">SDR</div>
          <div className="sidebar-logo-text">Agent</div>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Workspace</span>
          <a href="/" className={`sidebar-link${page === "conversations" ? " active" : ""}`}>
            <span className="sidebar-link-icon">◈</span>
            Conversations
            {pendingCount > 0 && <span className="sidebar-link-badge">{pendingCount}</span>}
          </a>
          {!isRep && (
            <a href="/reps" className={`sidebar-link${page === "reps" ? " active" : ""}`}>
              <span className="sidebar-link-icon">◎</span>
              Sales Reps
            </a>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-chip">
            <div className="rep-avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(user.username)}</div>
            <div className="user-chip-info">
              <div className="user-chip-name">{user.username}</div>
              <div className="user-chip-role">{user.role}</div>
            </div>
          </div>
          <button className="btn btn-ghost">Sign out</button>
        </div>
      </aside>

    </>
  );
}
