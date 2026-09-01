"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/lib/supabase";

const DEGREE_OPTIONS: { value: "msc" | "phd" | "both"; label: string }[] = [
  { value: "phd", label: "PhD" },
  { value: "msc", label: "MSc" },
  { value: "both", label: "Both" },
];

export function OnboardingWizard({ userId }: { userId: string }) {
  const { profile, updateProfile } = useProfile(userId);
  const router = useRouter();

  const [step, setStep] = useState(profile?.onboarding_step && profile.onboarding_step > 1 ? profile.onboarding_step : 2);

  // Step 2: CV
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);

  // Step 3: interests
  const [fieldOfStudy, setFieldOfStudy] = useState(profile?.field_of_study ?? "");
  const [keywordsInput, setKeywordsInput] = useState(profile?.keywords?.join(", ") ?? "");

  // Step 4: countries
  const [countriesInput, setCountriesInput] = useState(profile?.target_countries?.join(", ") ?? "");
  const [universitiesInput, setUniversitiesInput] = useState(profile?.target_universities?.join(", ") ?? "");

  // Step 5: degree & prefs
  const [degreeType, setDegreeType] = useState<"msc" | "phd" | "both">(profile?.degree_type ?? "both");
  const [fundingRequired, setFundingRequired] = useState(profile?.funding_required ?? false);
  const [minScore, setMinScore] = useState(profile?.min_score_threshold ?? 40);

  const goNext = async (nextStep: number) => {
    await updateProfile({ onboarding_step: nextStep });
    setStep(nextStep);
  };

  const handleCvUpload = async () => {
    if (!cvFile) return;
    setCvUploading(true);
    setCvError(null);

    const storagePath = `${userId}/${Date.now()}-${cvFile.name}`;
    const { error: uploadError } = await supabase.storage.from("cvs").upload(storagePath, cvFile);
    if (uploadError) {
      setCvError(uploadError.message);
      setCvUploading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const { error: fnError } = await supabase.functions.invoke("upload-cv", {
      body: { storage_path: storagePath, filename: cvFile.name },
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });

    setCvUploading(false);
    if (fnError) {
      setCvError(fnError.message);
      return;
    }
    await goNext(3);
  };

  const handleInterestsSubmit = async () => {
    const keywords = keywordsInput.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 10);
    await updateProfile({ field_of_study: fieldOfStudy, keywords });
    await goNext(4);
  };

  const handleCountriesSubmit = async () => {
    const target_countries = countriesInput.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 15);
    const target_universities = universitiesInput.split(",").map((u) => u.trim()).filter(Boolean);
    await updateProfile({ target_countries, target_universities });
    await goNext(5);
  };

  const handleFinish = async () => {
    await updateProfile({
      degree_type: degreeType,
      funding_required: fundingRequired,
      min_score_threshold: minScore,
      onboarding_step: 5,
    });

    const { data: sessionData } = await supabase.auth.getSession();
    await supabase.functions.invoke("run-search", {
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    });

    router.replace("/dashboard");
  };

  return (
    <div className="mx-auto w-full max-w-lg rounded-lg border border-border bg-surface p-8">
      <p className="mb-1 font-mono text-xs uppercase tracking-wide text-accent">Step {step - 1} of 4</p>

      {step === 2 && (
        <section>
          <h2 className="mb-2 font-serif text-xl font-semibold">Upload your CV</h2>
          <p className="mb-4 text-sm text-muted">
            We&apos;ll extract your education, experience, and skills automatically.
          </p>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
            className="mb-4 block w-full text-sm"
          />
          {cvError && <p className="mb-4 text-sm text-red-600">{cvError}</p>}
          <button
            onClick={handleCvUpload}
            disabled={!cvFile || cvUploading}
            className="w-full rounded bg-accent py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {cvUploading ? "Uploading…" : "Next"}
          </button>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2 className="mb-2 font-serif text-xl font-semibold">Research interests & field</h2>
          <p className="mb-4 text-sm text-muted">These drive the search agent&apos;s queries.</p>

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
            className="mb-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />

          <button
            onClick={handleInterestsSubmit}
            className="w-full rounded bg-accent py-2 text-sm font-medium text-white"
          >
            Next
          </button>
        </section>
      )}

      {step === 4 && (
        <section>
          <h2 className="mb-2 font-serif text-xl font-semibold">Target countries & universities</h2>

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
            className="mb-4 w-full rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />

          <button
            onClick={handleCountriesSubmit}
            className="w-full rounded bg-accent py-2 text-sm font-medium text-white"
          >
            Next
          </button>
        </section>
      )}

      {step === 5 && (
        <section>
          <h2 className="mb-2 font-serif text-xl font-semibold">Degree type & preferences</h2>

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
            <input
              type="checkbox"
              checked={fundingRequired}
              onChange={(e) => setFundingRequired(e.target.checked)}
            />
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
            className="mb-6 w-full"
          />

          <button onClick={handleFinish} className="w-full rounded bg-accent py-2 text-sm font-medium text-white">
            Finish & find opportunities
          </button>
        </section>
      )}
    </div>
  );
}
