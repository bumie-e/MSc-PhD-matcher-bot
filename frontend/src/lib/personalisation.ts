import type { UserCv, UserLlmKey, UserProfile } from "./types";

export type StepState = "done" | "todo" | "working" | "problem" | "locked";

export interface PersonalisationStep {
  id: "key" | "cv" | "prefs" | "matches";
  title: string;
  detail: string;
  state: StepState;
}

export interface Personalisation {
  steps: PersonalisationStep[];
  /** AI key valid, CV read and preferences set: scoring can run. */
  ready: boolean;
  doneCount: number;
  /** Where the next action lives. */
  nextHref: string;
  /** What the next action is called on buttons. */
  nextLabel: string;
}

export function getPersonalisation(args: {
  llmKey: UserLlmKey | null;
  cv: UserCv | null;
  profile: UserProfile | null;
  matchCount: number;
}): Personalisation {
  const { llmKey, cv, profile, matchCount } = args;
  const keyOk = llmKey?.status === "valid";
  const cvOk = cv?.parse_status === "done";
  const prefsOk = (profile?.onboarding_step ?? 0) >= 5;

  const key: PersonalisationStep = !llmKey
    ? { id: "key", title: "Connect your AI key", detail: "Use Groq, OpenAI or Anthropic. You pay your provider directly, and it is only used for your own matches.", state: "todo" }
    : keyOk
      ? { id: "key", title: "AI key connected", detail: `Using your ${llmKey.provider} key.`, state: "done" }
      : llmKey.status === "model_unavailable"
        ? { id: "key", title: "Choose a new AI model", detail: llmKey.status_message ?? "Your model is no longer available. Pick another in Settings.", state: "problem" }
        : { id: "key", title: "Your AI key needs attention", detail: llmKey.status_message ?? "Your provider rejected the key. Replace it in Settings.", state: "problem" };

  const cvStep: PersonalisationStep = !keyOk
    ? { id: "cv", title: "Upload your CV", detail: "Unlocks after you connect an AI key.", state: "locked" }
    : cvOk
      ? { id: "cv", title: "CV read", detail: `${cv.filename} is ready.`, state: "done" }
      : cv?.parse_status === "pending"
        ? { id: "cv", title: "Reading your CV", detail: "This usually takes a minute or two.", state: "working" }
        : cv?.parse_status === "error"
          ? { id: "cv", title: "We could not read your CV", detail: cv.parse_error ?? "Upload it again.", state: "problem" }
          : { id: "cv", title: "Upload your CV", detail: "We read your education and experience so scores reflect you.", state: "todo" };

  const prefs: PersonalisationStep = prefsOk
    ? { id: "prefs", title: "Interests and preferences set", detail: "Change them any time in Settings.", state: "done" }
    : { id: "prefs", title: "Set your interests", detail: "Field, countries, degree type and funding.", state: keyOk ? "todo" : "locked" };

  const ready = keyOk && cvOk && prefsOk;
  const matches: PersonalisationStep =
    matchCount > 0
      ? { id: "matches", title: "Matches scored", detail: `${matchCount} openings scored against your profile.`, state: "done" }
      : ready
        ? { id: "matches", title: "Scoring your first matches", detail: "Results appear here as they finish, usually within a few minutes.", state: "working" }
        : { id: "matches", title: "Get personalised matches", detail: "Each opening gets a score, reasons and a confidence level.", state: "locked" };

  const steps = [key, cvStep, prefs, matches];
  const keyNeedsFix = key.state === "problem";
  const nextLabel =
    key.state === "todo"
      ? "Connect your AI key"
      : keyNeedsFix
        ? llmKey?.status === "model_unavailable"
          ? "Choose a new model"
          : "Replace your AI key"
        : cvStep.state === "todo" || cvStep.state === "problem"
          ? "Upload your CV"
          : "Finish setup";
  return {
    steps,
    ready,
    doneCount: steps.filter((s) => s.state === "done").length,
    nextHref: keyNeedsFix ? "/settings" : "/onboarding",
    nextLabel,
  };
}
