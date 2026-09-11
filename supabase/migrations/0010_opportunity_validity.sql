-- Relevance gating (Phase 5 follow-up): the search agent's Tavily catch-all
-- and per-university search sometimes returned blog/listicle content
-- (e.g. "how to fund your PhD") instead of real postings, which then got
-- force-fit into the opportunities schema and confidently scored by the
-- match agent. is_valid lets the match agent flag an opportunity that
-- slipped through structuring as not a real opportunity, so it stops being
-- matched or shown, without deleting the row (source_url uniqueness still
-- prevents it from being re-scraped and re-inserted).

alter table opportunities
  add column is_valid boolean not null default true;
