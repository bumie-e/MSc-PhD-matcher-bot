"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { softInputClass, labelClass } from "@/components/AuthShell";
import { Segmented, ScoreSlider, Switch } from "@/components/ui/Controls";
import { FileDrop } from "@/components/ui/FileDrop";
import { LlmKeyForm } from "@/components/ui/LlmKeyForm";
import { Card, PageLoading, PageShell } from "@/components/ui/PageShell";
import { TagInput } from "@/components/ui/TagInput";
import { useCv } from "@/hooks/useCv";
import { useLlmKey } from "@/hooks/useLlmKey";
import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";
import { invokeFn } from "@/lib/functions";
import { supabase } from "@/lib/supabase";
import type { DegreeType } from "@/lib/types";

const DEGREE_OPTIONS: { value: DegreeType; label: string }[] = [
  { value: "phd", label: "PhD" },
  { value: "msc", label: "MSc" },
  { value: "both", label: "Both" },
];

const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

function Message({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="status" className="mb-4 rounded-lg bg-white px-4 py-3 text-base text-brand-deep">
      {text}
    </p>
  );
}

export default function SettingsPage() {
  const { session, loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading, updateProfile } = useProfile(session?.user.id);
  const { llmKey, loading: keyLoading, refresh: refreshKey } = useLlmKey(session?.user.id);
  const { cv, refresh: refreshCv } = useCv(session?.user.id);
  const router = useRouter();

  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [universities, setUniversities] = useState<string[]>([]);
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
    setKeywords(profile.keywords);
    setCountries(profile.target_countries);
    setUniversities(profile.target_universities);
    setDegreeType(profile.degree_type);
    setFundingRequired(profile.funding_required);
    setMinScore(profile.min_score_threshold);
  }, [profile]);

  useEffect(() => {
    if (!sessionLoading && !session) router.replace("/login");
  }, [sessionLoading, session, router]);

  const interestsChanged =
    !!profile &&
    (fieldOfStudy !== (profile.field_of_study ?? "") ||
      !same(keywords, profile.keywords) ||
      !same(countries, profile.target_countries) ||
      !same(universities, profile.target_universities));

  const dirty =
    interestsChanged ||
    (!!profile && (degreeType !== profile.degree_type || fundingRequired !== profile.funding_required || minScore !== profile.min_score_threshold));

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);

    const { error } =
      (await updateProfile({
        field_of_study: fieldOfStudy || null,
        keywords,
        target_countries: countries,
        target_universities: universities,
        degree_type: degreeType,
        funding_required: fundingRequired,
        min_score_threshold: minScore,
      })) ?? {};

    if (error) {
      setSaveMessage("Your changes did not save. Check your connection and try again.");
      setSaving(false);
      return;
    }

    // Interests, countries and universities feed the search agent's queries, so
    // re-run it to apply them now. A threshold change needs no re-search: the
    // dashboard already filters existing matches by min_score_threshold.
    if (interestsChanged) {
      const { data: sessionData } = await supabase.auth.getSession();
      await supabase.functions.invoke("run-search", {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
      });
      setSaveMessage("Saved. We are searching for new opportunities based on your updated interests.");
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

    const { error: fnError } = await invokeFn("upload-cv", { storage_path: storagePath, filename: cvFile.name });

    setCvUploading(false);
    if (fnError) {
      setCvMessage(fnError);
      return;
    }
    setCvFile(null);
    setCvMessage("CV uploaded. We are reading it with your AI key and will re-score your matches.");
    refreshCv();
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
      setLinkedinMessage(`Could not save the cookie: ${error.message}`);
      return;
    }
    setLinkedinCookie("");
    setLinkedinMessage("Saved. The search will scan your LinkedIn feed on its next run.");
  };

  if (sessionLoading || profileLoading || keyLoading || !session) return <PageLoading />;

  return (
    <PageShell active="/settings" isAdmin={profile?.is_admin} title="Settings" subtitle="Change what we search for and which matches you see. Updates apply to your next search." width="max-w-3xl">
      <Card id="ai" title="Your AI key" description="Personalised matching runs on your own key from Groq, OpenAI or Anthropic. Browsing and saving openings never needs one.">
        <LlmKeyForm llmKey={llmKey} onChanged={() => { refreshKey(); refreshCv(); }} />
      </Card>

      <Card title="What you study" description="These words drive every search.">
        <label htmlFor="field" className={labelClass}>
          Field of study
        </label>
        <input id="field" value={fieldOfStudy} onChange={(e) => setFieldOfStudy(e.target.value)} placeholder="Machine learning" className={softInputClass} />
        <TagInput id="keywords" label="Keywords" hint="Press Enter or comma after each one." value={keywords} onChange={setKeywords} max={10} placeholder="federated learning, privacy" />
      </Card>

      <Card title="Where you want to study" description="Leave universities empty to search everywhere in your countries.">
        <TagInput id="countries" label="Countries" hint="Press Enter or comma after each one." value={countries} onChange={setCountries} max={15} placeholder="Germany, Netherlands, Canada" />
        <TagInput id="universities" label="Specific universities (optional)" hint="We search their own pages too." value={universities} onChange={setUniversities} placeholder="ETH Zurich, TU Munich" />
      </Card>

      <Card title="What you are looking for">
        <Segmented label="Degree type" options={DEGREE_OPTIONS} value={degreeType} onChange={setDegreeType} />
        <Switch label="Funded positions only" hint="Hide openings that list no funding." checked={fundingRequired} onChange={setFundingRequired} />
        <ScoreSlider value={minScore} onChange={setMinScore} />
      </Card>

      {/* Appears once something changes; stays reachable on long phone screens. */}
      {(dirty || saveMessage) && (
        <div className="anim-rise sticky bottom-3 z-10 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand p-4 text-white shadow-[0_12px_30px_-10px_rgba(0,30,100,0.6)]">
          <p role="status" className="min-w-0 flex-1 text-lg">
            {saveMessage ?? "You have unsaved changes."}
          </p>
          <button onClick={handleSave} disabled={saving || !dirty} className="rounded-lg bg-white px-6 py-2.5 text-lg font-bold text-brand transition-colors hover:bg-brand-soft disabled:opacity-60">
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      )}

      <Card title={cv ? "Replace your CV" : "Upload your CV"} description="We read it with your AI key, then re-score openings against it.">
        {cv && (
          <p className="mb-4 rounded-lg bg-white px-4 py-3 text-base" role="status">
            {cv.filename}:{" "}
            {cv.parse_status === "done" ? "read and ready" : cv.parse_status === "pending" ? "being read now" : cv.parse_error ?? "could not be read"}
          </p>
        )}
        {llmKey?.status !== "valid" && (
          <p className="mb-4 rounded-lg bg-white px-4 py-3 text-base font-bold">Connect your AI key above before uploading a CV.</p>
        )}
        <FileDrop file={cvFile} onFile={setCvFile} disabled={cvUploading || llmKey?.status !== "valid"} />
        <Message text={cvMessage} />
        <button onClick={handleCvUpload} disabled={!cvFile || cvUploading || llmKey?.status !== "valid"} className="w-full rounded-xl bg-brand py-3 text-lg font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50 sm:w-auto sm:px-8">
          {cvUploading ? "Uploading..." : "Upload new CV"}
        </button>
      </Card>

      <Card title="LinkedIn" description="Optional. Add your session cookie and the search also scans hashtag posts from your feed.">
        <ol className="mb-5 list-decimal space-y-1 pl-6 text-base text-black/80">
          <li>Sign in to LinkedIn in your browser.</li>
          <li>Open developer tools, then Application, then Cookies.</li>
          <li>
            Copy the value of the <code className="rounded bg-white px-1.5 py-0.5">li_at</code> cookie and paste it below.
          </li>
        </ol>
        <label htmlFor="li-at" className={labelClass}>
          li_at cookie
        </label>
        <input id="li-at" type="password" autoComplete="off" value={linkedinCookie} onChange={(e) => setLinkedinCookie(e.target.value)} placeholder="Paste the cookie value" className={softInputClass} />
        <p className="-mt-3 mb-5 text-sm text-black/60">It is encrypted when stored and never shown again.</p>
        <Message text={linkedinMessage} />
        <button onClick={handleLinkedinSave} disabled={!linkedinCookie.trim() || linkedinSaving} className="w-full rounded-xl bg-brand py-3 text-lg font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50 sm:w-auto sm:px-8">
          {linkedinSaving ? "Saving..." : "Save cookie"}
        </button>
      </Card>
    </PageShell>
  );
}
