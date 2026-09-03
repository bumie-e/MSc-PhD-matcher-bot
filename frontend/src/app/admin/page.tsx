"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";

interface Invite {
  id: string;
  email: string;
  token: string;
  created_at: string;
  used_at: string | null;
  expires_at: string;
}

type AgentName = "search" | "match" | "cv_parse";
type RunStatus = "running" | "success" | "error";

interface AgentRun {
  id: string;
  agent: AgentName;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  summary: Record<string, unknown>;
  meta: Record<string, unknown>;
  error: string | null;
}

const STATUS_TONE: Record<RunStatus, string> = {
  running: "text-signal",
  success: "text-signal-green",
  error: "text-red-700",
};

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "in progress";
  const seconds = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function AdminPage() {
  const { session, loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading } = useProfile(session?.user.id);
  const router = useRouter();

  const [invites, setInvites] = useState<Invite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);

  const refreshInvites = useCallback(async () => {
    setInvitesLoading(true);
    const { data } = await supabase.from("pending_invites").select("*").order("created_at", { ascending: false });
    setInvites((data as Invite[]) ?? []);
    setInvitesLoading(false);
  }, []);

  const refreshRuns = useCallback(async () => {
    setRunsLoading(true);
    const { data } = await supabase
      .from("agent_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(30);
    setRuns((data as AgentRun[]) ?? []);
    setRunsLoading(false);
  }, []);

  useEffect(() => {
    if (!sessionLoading && !session) router.replace("/login");
  }, [sessionLoading, session, router]);

  useEffect(() => {
    if (!profileLoading && profile && !profile.is_admin) router.replace("/dashboard");
  }, [profileLoading, profile, router]);

  useEffect(() => {
    if (profile?.is_admin) {
      refreshInvites();
      refreshRuns();
    }
  }, [profile, refreshInvites, refreshRuns]);

  const handleSendInvite = async () => {
    if (!email.trim()) return;
    setSending(true);
    setMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke("send-invite", {
      body: { email: email.trim() },
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });

    setSending(false);
    if (error) {
      setMessage(`Failed: ${error.message}`);
      return;
    }
    setEmail("");
    setMessage(`Invite created: ${(data as { signupLink?: string })?.signupLink ?? "sent"}`);
    refreshInvites();
  };

  const handleRevoke = async (id: string) => {
    await supabase.from("pending_invites").delete().eq("id", id);
    refreshInvites();
  };

  if (sessionLoading || profileLoading || !session || !profile?.is_admin) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/dashboard" className="mb-6 inline-block text-sm text-muted hover:text-ink">
        ← Back to dashboard
      </Link>

      <h1 className="mb-1 font-serif text-2xl font-semibold text-ink">Invite manager</h1>
      <p className="mb-8 text-sm text-muted">Signup is invite-only. Create and revoke invites here.</p>

      <section className="mb-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">Send an invite</h2>
        <div className="flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
            className="flex-1 rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={handleSendInvite}
            disabled={!email.trim() || sending}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? "Sending…" : "Invite"}
          </button>
        </div>
        {message && <p className="mt-3 break-all text-sm text-accent">{message}</p>}
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border p-4 text-xs font-semibold uppercase tracking-wide text-muted">
          All invites
        </h2>
        {invitesLoading ? (
          <p className="p-4 text-sm text-muted">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="p-4 text-sm text-muted">No invites yet.</p>
        ) : (
          invites.map((invite) => {
            const expired = new Date(invite.expires_at).getTime() < Date.now();
            return (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-3 border-b border-border p-4 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{invite.email}</p>
                  <p className="font-mono text-xs text-muted">
                    {invite.used_at ? "Used" : expired ? "Expired" : "Pending"} · created{" "}
                    {new Date(invite.created_at).toLocaleDateString()}
                  </p>
                </div>
                {!invite.used_at && (
                  <button
                    onClick={() => handleRevoke(invite.id)}
                    className="shrink-0 rounded border border-border px-3 py-1 text-xs text-muted hover:border-signal hover:text-signal"
                  >
                    Revoke
                  </button>
                )}
              </div>
            );
          })
        )}
      </section>

      <section className="mt-8 rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Agent run log</h2>
          <button onClick={refreshRuns} className="text-xs text-muted hover:text-ink">
            Refresh
          </button>
        </div>
        {runsLoading ? (
          <p className="p-4 text-sm text-muted">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="p-4 text-sm text-muted">No runs recorded yet.</p>
        ) : (
          runs.map((run) => (
            <div
              key={run.id}
              className="flex items-center justify-between gap-3 border-b border-border p-4 text-sm last:border-b-0"
            >
              <div className="min-w-0">
                <p className="font-medium capitalize text-ink">
                  {run.agent.replace("_", " ")}{" "}
                  <span className={`font-mono text-xs uppercase ${STATUS_TONE[run.status]}`}>{run.status}</span>
                </p>
                <p className="truncate font-mono text-xs text-muted">
                  {new Date(run.started_at).toLocaleString()} · {formatDuration(run.started_at, run.finished_at)}
                  {Object.keys(run.summary).length > 0 && ` · ${JSON.stringify(run.summary)}`}
                </p>
                {run.error && <p className="mt-1 truncate text-xs text-red-700">{run.error}</p>}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
