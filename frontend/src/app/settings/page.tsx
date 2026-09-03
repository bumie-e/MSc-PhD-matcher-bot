"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import type { DegreeType } from "@/lib/types";

const DEGREE_OPTIONS: { value: DegreeType; label: string }[] = [
  { value: "phd", label: "PhD" },
  { value: "msc", label: "MSc" },
  { value: "both", label: "Both" },
];

export default function SettingsPage() {
  const { session, loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading, updateProfile } = useProfile(session?.user.id);
  const router = useRouter();

  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [keywordsInput, setKeywordsInput] = useState("");
  const [countriesInput, setCountriesInput] = useState("");
  const [universitiesInput, setUniversitiesInput] = useState("");
  const [degreeType, setDegreeType] = useState<DegreeType>("both");
  const [fundingRequired, setFundingRequired] = useState(false);
  const [minScore, setMinScore] = useState(40);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvMessage, setCvMessage] = useState<string | null>(null);

  const [linkedinCookie, setLinkedinCookie] = useState("");
  const [linkedinSaving, setLinkedinSaving] = useState(false);
  const [linkedinMessage, setLinkedinMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFieldOfStudy(profile.field_of_study ?? "");
    setKeywordsInput(profile.keywords.join(", "));
    setCountriesInput(profile.target_countries.join(", "));
    setUniversitiesInput(profile.target_universities.join(", "));
    setDegreeType(profile.degree_type);
    setFundingRequired(profile.funding_required);
    setMinScore(profile.min_score_threshold);
  }, [profile]);

  useEffect(() => {
    if (!sessionLoading && !session) router.replace("/login");
  }, [sessionLoading, session, router]);

  const interestsChanged =
    profile &&
    (fieldOfStudy !== (profile.field_of_study ?? "") ||
      keywordsInput !== profile.keywords.join(", ") ||
      countriesInput !== profile.target_countries.join(", ") ||
      universitiesInput !== profile.target_universities.join(", "));

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);

    const keywords = keywordsInput.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 10);
    const target_countries = countriesInput.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 15);
    const target_universities = universitiesInput.split(",").map((u) => u.trim()).filter(Boolean);

    const { error } = (await updateProfile({
      field_of_study: fieldOfStudy || null,
      keywords,
      target_countries,
      target_universities,
      degree_type: degreeType,
      funding_required: fundingRequired,
      min_score_threshold: minScore,
    })) ?? {};

    if (error) {
      setSaveMessage("Failed to save — please try again.");
      setSaving(false);
      return;
    }

    // Interests/countries/universities feed the search agent's queries —
    // re-run it so new preferences take effect without waiting for tomorrow's
    // cron. A pure threshold change needs no re-search: the dashboard
    // already filters existing matches by profile.min_score_threshold live.
    if (interestsChanged) {
      const { data: sessionData } = await supabase.auth.getSession();
      await supabase.functions.invoke("run-search", {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      setSaveMessage("Saved — searching for new opportunities based on your updated interests.");
    } else {
      setSaveMessage("Saved.");
    }

    setSaving(false);
  };

  const handleCvUpload = async () => {
    if (!cvFile || !session) return;
    setCvUploading(true);
    setCvMessage(null);

    const storagePath = `${session.user.id}/${Date.now()}-${cvFile.name}`;
    const { error: uploadError } = await supabase.storage.from("cvs").upload(storagePath, cvFile);
    if (uploadError) {
      setCvMessage(`Upload failed: ${uploadError.message}`);
      setCvUploading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const { error: fnError } = await supabase.functions.invoke("upload-cv", {
      body: { storage_path: storagePath, filename: cvFile.name },
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });

    setCvUploading(false);
    setCvFile(null);
    if (fnError) {
      setCvMessage(`Upload failed: ${fnError.message}`);
      return;
    }
    setCvMessage("CV uploaded — re-parsing and re-matching now.");
  };

  const handleLinkedinSave = async () => {
    if (!linkedinCookie.trim()) return;
    setLinkedinSaving(true);
    setLinkedinMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.functions.invoke("save-linkedin", {
      body: { cookie: linkedinCookie.trim() },
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });

    setLinkedinSaving(false);
    if (error) {
      setLinkedinMessage(`Failed to save: ${error.message}`);
      return;
    }
    setLinkedinCookie("");
    setLinkedinMessage("Saved — the search agent will scan your LinkedIn feed on its next run.");
  };

  if (sessionLoading || profileLoading || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <Link href="/dashboard" className="mb-6 inline-block text-sm text-muted hover:text-ink">
        ← Back to dashboard
      </Link>

      <h1 className="mb-1 font-serif text-2xl font-semibold text-ink">Settings</h1>
      <p className="mb-8 text-sm text-muted">
        Update your interests, target schools, and match threshold any time.
      </p>

      <section className="mb-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">
          Research interests & field
        </h2>

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          Field of study
        </label>
        <input
          value={fieldOfStudy}
          onChange={(e) => setFieldOfStudy(e.target.value)}
          placeholder="Machine Learning"
          className="mb-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          Keywords (up to 10, comma-separated)
        </label>
        <input
          value={keywordsInput}
          onChange={(e) => setKeywordsInput(e.target.value)}
          placeholder="federated learning, privacy-preserving ML, NeurIPS"
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </section>

      <section className="mb-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">
          Target countries & universities
        </h2>

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          Target countries (up to 15, comma-separated)
        </label>
        <input
          value={countriesInput}
          onChange={(e) => setCountriesInput(e.target.value)}
          placeholder="Germany, Netherlands, Canada"
          className="mb-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          Specific universities (optional, comma-separated)
        </label>
        <input
          value={universitiesInput}
          onChange={(e) => setUniversitiesInput(e.target.value)}
          placeholder="ETH Zurich, TU Munich"
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </section>

      <section className="mb-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">
          Degree type & threshold
        </h2>

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Degree type</label>
        <div className="mb-4 flex gap-2">
          {DEGREE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDegreeType(opt.value)}
              className={`flex-1 rounded border px-3 py-2 text-sm ${
                degreeType === opt.value ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={fundingRequired} onChange={(e) => setFundingRequired(e.target.checked)} />
          Funded positions only
        </label>

        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          Minimum match score to show ({minScore})
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
          className="w-full"
        />
      </section>

      {saveMessage && <p className="mb-4 text-sm text-accent">{saveMessage}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="mb-8 w-full rounded bg-accent py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>

      <section className="mb-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">Re-upload CV</h2>
        <p className="mb-4 text-sm text-muted">
          Replacing your CV re-parses it and re-scores every opportunity against the new content.
        </p>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
          className="mb-4 block w-full text-sm"
        />
        {cvMessage && <p className="mb-4 text-sm text-accent">{cvMessage}</p>}
        <button
          onClick={handleCvUpload}
          disabled={!cvFile || cvUploading}
          className="w-full rounded border border-accent py-2 text-sm font-medium text-accent disabled:opacity-50"
        >
          {cvUploading ? "Uploading…" : "Upload new CV"}
        </button>
      </section>

      <section className="mb-8 rounded-lg border border-border bg-surface p-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">LinkedIn</h2>
        <p className="mb-4 text-sm text-muted">
          Paste your <code className="rounded bg-surface-2 px-1 py-0.5">li_at</code> session cookie so the search
          agent can scan hashtagged posts from your feed. It&apos;s encrypted at rest and never shown again once
          saved.
        </p>
        <input
          type="password"
          value={linkedinCookie}
          onChange={(e) => setLinkedinCookie(e.target.value)}
          placeholder="li_at cookie value"
          className="mb-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {linkedinMessage && <p className="mb-4 text-sm text-accent">{linkedinMessage}</p>}
        <button
          onClick={handleLinkedinSave}
          disabled={!linkedinCookie.trim() || linkedinSaving}
          className="w-full rounded border border-accent py-2 text-sm font-medium text-accent disabled:opacity-50"
        >
          {linkedinSaving ? "Saving…" : "Save cookie"}
        </button>
      </section>
    </main>
  );
}
