"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { buttonClass, labelClass, softInputClass } from "@/components/AuthShell";
import { Segmented, ScoreSlider, Switch } from "@/components/ui/Controls";
import { FileDrop } from "@/components/ui/FileDrop";
import { LlmKeyForm } from "@/components/ui/LlmKeyForm";
import { PageLoading } from "@/components/ui/PageShell";
import { TagInput } from "@/components/ui/TagInput";
import { useCv } from "@/hooks/useCv";
import { useLlmKey } from "@/hooks/useLlmKey";
import { useProfile } from "@/hooks/useProfile";
import { invokeFn } from "@/lib/functions";
import { supabase } from "@/lib/supabase";
import type { UserCv, UserLlmKey, UserProfile } from "@/lib/types";

type Degree = "msc" | "phd" | "both";

const DEGREE_OPTIONS: { value: Degree; label: string }[] = [
  { value: "phd", label: "PhD" },
  { value: "msc", label: "MSc" },
  { value: "both", label: "Both" },
];

// Step ids 2..5 are stored in user_profiles.onboarding_step; step 1 (the AI key)
// lives in user_llm_keys, so existing users keep their progress.
const STEPS = [
  { id: 1, title: "Connect your AI", blurb: "Your own Groq, OpenAI or Anthropic key" },
  { id: 2, title: "Upload your CV", blurb: "So we know your background" },
  { id: 3, title: "Your interests", blurb: "What you want to study" },
  { id: 4, title: "Where to study", blurb: "Countries and universities" },
  { id: 5, title: "Preferences", blurb: "Degree, funding and score" },
];

// Waits for the saved state to load, so a returning user resumes where they left off.
export function OnboardingWizard({ userId }: { userId: string }) {
  const { profile, loading: profileLoading, updateProfile } = useProfile(userId);
  const { llmKey, loading: keyLoading, refresh: refreshKey } = useLlmKey(userId);
  const { cv, loading: cvLoading, refresh: refreshCv } = useCv(userId);

  if (profileLoading || keyLoading || cvLoading) return <PageLoading />;
  return <Wizard userId={userId} profile={profile} updateProfile={updateProfile} llmKey={llmKey} refreshKey={refreshKey} cv={cv} refreshCv={refreshCv} />;
}

function firstIncompleteStep(profile: UserProfile | null, llmKey: UserLlmKey | null, cv: UserCv | null): number {
  if (llmKey?.status !== "valid") return 1;
  if (!cv || cv.parse_status === "error") return 2;
  return Math.min(Math.max(profile?.onboarding_step ?? 3, 3), 5);
}

function Wizard({
  userId,
  profile,
  updateProfile,
  llmKey,
  refreshKey,
  cv,
  refreshCv,
}: {
  userId: string;
  profile: UserProfile | null;
  updateProfile: ReturnType<typeof useProfile>["updateProfile"];
  llmKey: UserLlmKey | null;
  refreshKey: () => void;
  cv: UserCv | null;
  refreshCv: () => void;
}) {
  const router = useRouter();

  const [step, setStep] = useState(firstIncompleteStep(profile, llmKey, cv));
  const [busy, setBusy] = useState(false);
  const [keyNotice, setKeyNotice] = useState<string | null>(null);

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);

  const [fieldOfStudy, setFieldOfStudy] = useState(profile?.field_of_study ?? "");
  const [keywords, setKeywords] = useState<string[]>(profile?.keywords ?? []);
  const [countries, setCountries] = useState<string[]>(profile?.target_countries ?? []);
  const [universities, setUniversities] = useState<string[]>(profile?.target_universities ?? []);
  const [degreeType, setDegreeType] = useState<Degree>(profile?.degree_type ?? "both");
  const [fundingRequired, setFundingRequired] = useState(profile?.funding_required ?? false);
  const [minScore, setMinScore] = useState(profile?.min_score_threshold ?? 40);

  // The CV is read with the user's own key, so step 2 is unreachable without one.
  const keyReady = llmKey?.status === "valid";
  useEffect(() => {
    if (step >= 2 && !keyReady) {
      setKeyNotice("Connect your AI key first. Your CV and matches are processed with it.");
      setStep(1);
    }
  }, [step, keyReady]);

  const index = STEPS.findIndex((s) => s.id === step);
  const current = STEPS[index];

  // Never lowers saved progress: a returning user who revisits an earlier step keeps their finished status.
  const goNext = async (nextStep: number) => {
    if (nextStep >= 2) await updateProfile({ onboarding_step: Math.max(profile?.onboarding_step ?? 0, nextStep) });
    setStep(nextStep);
  };

  // Going back only moves the screen; saved answers stay saved.
  const goBack = () => setStep(STEPS[Math.max(index - 1, 0)].id);

  const handleCvUpload = async () => {
    if (!cvFile) return;
    if (!keyReady) {
      setKeyNotice("Connect your AI key first. Your CV is read with it.");
      setStep(1);
      return;
    }
    setBusy(true);
    setCvError(null);

    const storagePath = `${userId}/${Date.now()}-${cvFile.name}`;
    const { error: uploadError } = await supabase.storage.from("cvs").upload(storagePath, cvFile);
    if (uploadError) {
      setCvError(uploadError.message);
      setBusy(false);
      return;
    }

    const { error: fnError, code } = await invokeFn("upload-cv", { storage_path: storagePath, filename: cvFile.name });
    if (code === "llm_key_required") {
      setKeyNotice("Your AI key is missing or not working. Connect it, then upload your CV.");
      setStep(1);
      setBusy(false);
      return;
    }
    if (fnError) {
      setCvError(fnError);
      setBusy(false);
      return;
    }
    refreshCv();
    await goNext(3);
    setBusy(false);
  };

  const handleInterestsSubmit = async () => {
    setBusy(true);
    await updateProfile({ field_of_study: fieldOfStudy, keywords });
    await goNext(4);
    setBusy(false);
  };

  const handleCountriesSubmit = async () => {
    setBusy(true);
    await updateProfile({ target_countries: countries, target_universities: universities });
    await goNext(5);
    setBusy(false);
  };

  const handleFinish = async () => {
    setBusy(true);
    await updateProfile({
      degree_type: degreeType,
      funding_required: fundingRequired,
      min_score_threshold: minScore,
      onboarding_step: 5,
    });

    // Refresh the shared pool with the new interests, then score for this user.
    // If the CV is still being read, its own workflow starts scoring when it finishes.
    await invokeFn("run-search");
    if (llmKey?.status === "valid") await invokeFn("rematch-me");

    router.replace("/dashboard");
  };

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] bg-brand-soft font-sans text-black md:grid-cols-[22rem_1fr] md:grid-rows-1">
      {/* Progress: a sidebar on desktop, a bar on phones. */}
      <aside className="bg-brand p-5 text-white md:flex md:flex-col md:justify-between md:p-10">
        <div>
          <Logo className="text-lg md:text-xl" />

          <div className="mt-4 md:hidden">
            <p className="text-base text-white/90">
              Step {index + 1} of {STEPS.length}: {current.title}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/25" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
              <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
            </div>
          </div>

          <ol className="mt-12 hidden space-y-5 md:block">
            {STEPS.map((s, i) => {
              const done = i < index;
              const active = i === index;
              return (
                <li key={s.id} className="flex items-center gap-4" aria-current={active ? "step" : undefined}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold transition-colors ${done ? "bg-white text-brand" : active ? "bg-white text-brand ring-4 ring-white/30" : "bg-brand-deep text-white/80"}`}>
                    {done ? (
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-label="Done">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span>
                    <span className={`block text-lg ${active ? "font-bold" : ""}`}>{s.title}</span>
                    <span className="block text-base text-white/80">{s.blurb}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="mt-8 hidden text-base text-white/80 md:block">Every step is optional. You can browse openings now and finish later, and change anything in Settings.</p>
      </aside>

      <main className="flex items-start justify-center px-5 py-8 sm:px-8 md:items-center md:py-12">
        <div key={step} className="anim-rise w-full max-w-xl">
          {step === 1 && (
            <section>
              <h1 className="text-3xl font-bold">Connect your AI</h1>
              <p className="mb-6 mt-2 text-lg text-black/70">Personalised matching runs on your own key from Groq, OpenAI or Anthropic. Without one you can still browse and track every opening.</p>
              {keyNotice && !keyReady && (
                <p role="alert" className="mb-5 rounded-lg bg-white px-4 py-3 text-base font-bold text-black">
                  {keyNotice}
                </p>
              )}
              <LlmKeyForm llmKey={llmKey} onChanged={refreshKey} />
              {llmKey?.status === "valid" && (
                <button onClick={() => setStep(2)} className={`${buttonClass} mt-6`}>
                  Continue
                </button>
              )}
              <p className="mt-5 text-center text-base">
                <Link href="/dashboard" className="font-bold text-brand underline">
                  Skip for now
                </Link>
                <span className="text-black/60">, and just browse openings.</span>
              </p>
            </section>
          )}

          {step === 2 && (
            <section>
              <h1 className="text-3xl font-bold">Upload your CV</h1>
              <p className="mb-6 mt-2 text-lg text-black/70">We read your education, experience and skills so matches reflect your real background.</p>
              <FileDrop file={cvFile} onFile={setCvFile} disabled={busy} />
              {cvError && (
                <p role="alert" className="mb-5 rounded-lg bg-white px-4 py-3 text-base text-black">
                  Upload failed: {cvError}
                </p>
              )}
              <button onClick={handleCvUpload} disabled={!cvFile || busy} className={buttonClass}>
                {busy ? "Uploading..." : "Upload and continue"}
              </button>
              {cv && cv.parse_status !== "error" && (
                <button type="button" onClick={() => goNext(3)} className="mt-4 block w-full text-center text-lg font-bold text-brand underline">
                  Keep my current CV ({cv.filename})
                </button>
              )}
              <BackButton onClick={goBack} />
              <p className="mt-5 text-center text-base">
                <Link href="/dashboard" className="font-bold text-brand underline">
                  Skip for now
                </Link>
                <span className="text-black/60">, you can upload it from the dashboard later.</span>
              </p>
            </section>
          )}

          {step === 3 && (
            <section>
              <h1 className="text-3xl font-bold">What do you want to study?</h1>
              <p className="mb-6 mt-2 text-lg text-black/70">These words drive every search we run for you.</p>
              <label htmlFor="field" className={labelClass}>
                Field of study
              </label>
              <input id="field" value={fieldOfStudy} onChange={(e) => setFieldOfStudy(e.target.value)} placeholder="Machine learning" className={softInputClass} />
              <TagInput id="keywords" label="Keywords" hint="Press Enter or comma after each one." value={keywords} onChange={setKeywords} max={10} placeholder="federated learning, privacy" />
              <button onClick={handleInterestsSubmit} disabled={busy} className={buttonClass}>
                {busy ? "Saving..." : "Continue"}
              </button>
              <BackButton onClick={goBack} />
            </section>
          )}

          {step === 4 && (
            <section>
              <h1 className="text-3xl font-bold">Where do you want to study?</h1>
              <p className="mb-6 mt-2 text-lg text-black/70">Pick countries, and add specific universities if you have favourites.</p>
              <TagInput id="countries" label="Countries" hint="Press Enter or comma after each one." value={countries} onChange={setCountries} max={15} placeholder="Germany, Netherlands, Canada" />
              <TagInput id="universities" label="Specific universities (optional)" hint="We search their own pages too." value={universities} onChange={setUniversities} placeholder="ETH Zurich, TU Munich" />
              <button onClick={handleCountriesSubmit} disabled={busy} className={buttonClass}>
                {busy ? "Saving..." : "Continue"}
              </button>
              <BackButton onClick={goBack} />
            </section>
          )}

          {step === 5 && (
            <section>
              <h1 className="text-3xl font-bold">Last step: your preferences</h1>
              <p className="mb-6 mt-2 text-lg text-black/70">Then we run your first search.</p>
              <Segmented label="Degree type" options={DEGREE_OPTIONS} value={degreeType} onChange={setDegreeType} />
              <Switch label="Funded positions only" hint="Hide openings that list no funding." checked={fundingRequired} onChange={setFundingRequired} />
              <div className="mb-6">
                <ScoreSlider value={minScore} onChange={setMinScore} />
              </div>
              <button onClick={handleFinish} disabled={busy} className={buttonClass}>
                {busy ? "Starting your search..." : "Finish and find opportunities"}
              </button>
              <BackButton onClick={goBack} />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-5 block w-full text-center text-lg font-bold text-brand underline">
      Back
    </button>
  );
}
