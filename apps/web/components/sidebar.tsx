"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "../hooks/use-session";
import { ChangePasswordModal } from "./change-password-modal";
import { AddUserModal } from "./add-user-modal";
import { AppMark } from "./app-mark";

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
  const [showChangePw, setShowChangePw] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">
            <AppMark />
          </div>
          <div className="sidebar-logo-text">AgentFlow</div>
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
          <div className="sidebar-actions">
            {isAdmin && (
              <button className="sidebar-action-link" onClick={() => setShowAddUser(true)}>+ New user</button>
            )}
            <button className="sidebar-action-link" onClick={() => setShowChangePw(true)}>Change password</button>
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <ChangePasswordModal open={showChangePw} onClose={() => setShowChangePw(false)} />
      <AddUserModal open={showAddUser} onClose={() => setShowAddUser(false)} />
    </>
  );
}
