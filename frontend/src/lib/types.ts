// Hand-written types mirroring supabase/migrations/0001_init.sql.
// Regenerate with `supabase gen types typescript` once the schema stabilizes.

export type DegreeType = "msc" | "phd" | "both";
export type OpportunityType = "msc" | "phd";
export type NoteStatus = "saved" | "applied" | "rejected" | "offer";
export type ParseStatus = "pending" | "done" | "error";
export type MatchConfidence = "low" | "medium" | "high";

export interface Opportunity {
  id: string;
  title: string;
  university: string | null;
  department: string | null;
  professor: string | null;
  type: OpportunityType;
  deadline: string | null;
  semester: string | null;
  location: string | null;
  stipend: string | null;
  requirements: Record<string, unknown>;
  how_to_apply: string | null;
  contact_info: { email?: string; url?: string };
  source_url: string;
  source_name: string;
  is_valid: boolean;
  created_at: string;
}

export interface Match {
  id: string;
  user_id: string;
  opportunity_id: string;
  score: number;
  score_breakdown: Record<string, number>;
  confidence: MatchConfidence;
  summary: string;
  pros: string[];
  cons: string[];
  recommendations: string[];
  created_at: string;
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  field_of_study: string | null;
  keywords: string[];
  target_countries: string[];
  target_universities: string[];
  degree_type: DegreeType;
  funding_required: boolean;
  start_semester: string | null;
  min_score_threshold: number;
  onboarding_step: number;
  is_admin: boolean;
  updated_at: string;
}

export interface UserNote {
  id: string;
  user_id: string;
  opportunity_id: string;
  note: string | null;
  pinned: boolean;
  status: NoteStatus;
  custom_rank: number | null;
  updated_at: string;
}

export interface MatchWithOpportunity extends Match {
  opportunity: Opportunity;
  user_note: UserNote | null;
}

export type LlmProvider = "groq" | "openai" | "anthropic";

// Status of the user's own AI key. The ciphertext itself is never readable from the browser.
export interface UserLlmKey {
  user_id: string;
  provider: LlmProvider;
  model: string;
  available_models: string[];
  status: "valid" | "invalid" | "model_unavailable";
  status_message: string | null;
  validated_at: string;
}

export interface UserCv {
  id: string;
  filename: string;
  parse_status: ParseStatus;
  parse_error: string | null;
  updated_at: string;
}

// Anything the user can see or track. `match` exists only after personalised
// scoring has run; `user_note` exists once the user saves or tracks it.
export interface OpportunityItem {
  id: string; // the opportunity id
  opportunity: Opportunity;
  match: Match | null;
  user_note: UserNote | null;
}
