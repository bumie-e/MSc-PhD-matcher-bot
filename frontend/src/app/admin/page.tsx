"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { softInputClass, labelClass } from "@/components/AuthShell";
import { Card, PageLoading, PageShell } from "@/components/ui/PageShell";
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

const STATUS_CHIP: Record<RunStatus, string> = {
  running: "bg-brand-mid text-brand-deep",
  success: "bg-brand text-white",
  error: "border-2 border-black bg-white text-black",
};

const STATUS_LABEL: Record<RunStatus, string> = { running: "Running", success: "Succeeded", error: "Failed" };

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
    const { data } = await supabase.from("agent_runs").select("*").order("started_at", { ascending: false }).limit(30);
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

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setMessage(`Could not send the invite: ${error.message}`);
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

  if (sessionLoading || profileLoading || !session || !profile?.is_admin) return <PageLoading />;

  const failed = runs.filter((r) => r.status === "error").length;

  return (
    <PageShell active="/admin" isAdmin title="Admin" subtitle="Watch the search and match agents, and send optional invites. Anyone can sign up without one." width="max-w-4xl">
      <Card
        title="Agent runs"
        description={runsLoading ? "Loading recent runs..." : runs.length === 0 ? "Nothing has run yet." : failed > 0 ? `${failed} of the last ${runs.length} runs failed.` : `The last ${runs.length} runs all finished without errors.`}
      >
        <button onClick={refreshRuns} className="mb-4 rounded-lg bg-white px-4 py-2 text-base font-bold text-brand transition-colors hover:bg-brand-mid">
          Refresh
        </button>
        {runsLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => (
              <li key={run.id} className="rounded-2xl bg-white p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-lg font-bold capitalize">{run.agent.replace("_", " ")}</span>
                  <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${STATUS_CHIP[run.status]}`}>{STATUS_LABEL[run.status]}</span>
                  <span className="text-base text-black/70">
                    {new Date(run.started_at).toLocaleString()}, {formatDuration(run.started_at, run.finished_at)}
                  </span>
                </div>
                {Object.keys(run.summary).length > 0 && <p className="mt-1 break-words text-sm text-black/70">{JSON.stringify(run.summary)}</p>}
                {run.error && <p className="mt-2 break-words rounded-lg bg-brand-soft px-3 py-2 text-sm font-bold text-black">{run.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Invite someone" description="Optional. Sends a signup link to this email address.">
        <form onSubmit={handleSendInvite}>
          <label htmlFor="invite-email" className={labelClass}>
            Email address
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" className={`${softInputClass} sm:mb-0 sm:flex-1`} />
            <button type="submit" disabled={!email.trim() || sending} className="rounded-xl bg-brand px-7 py-3 text-lg font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50">
              {sending ? "Sending..." : "Send invite"}
            </button>
          </div>
        </form>
        {message && (
          <p role="status" className="mt-4 break-all rounded-lg bg-white px-4 py-3 text-base text-brand-deep">
            {message}
          </p>
        )}
      </Card>

      <Card title="All invites" description={invitesLoading ? "Loading..." : invites.length === 0 ? "No invites yet." : undefined}>
        <ul className="space-y-2">
          {invites.map((invite) => {
            const expired = new Date(invite.expires_at).getTime() < Date.now();
            const state = invite.used_at ? "Used" : expired ? "Expired" : "Pending";
            return (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4">
                <div className="min-w-0">
                  <p className="break-all text-lg font-bold">{invite.email}</p>
                  <p className="text-base text-black/70">
                    {state}, created {new Date(invite.created_at).toLocaleDateString()}
                  </p>
                </div>
                {!invite.used_at && (
                  <button onClick={() => handleRevoke(invite.id)} className="rounded-lg border-2 border-brand px-4 py-1.5 text-base font-bold text-brand transition-colors hover:bg-brand hover:text-white">
                    Revoke
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </PageShell>
  );
}
