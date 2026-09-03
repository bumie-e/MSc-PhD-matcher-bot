-- Score confidence indicator (Phase 5): the match agent now self-reports
-- how confident it is in a score, based on how much CV/opportunity detail
-- it actually had to work with. Defaults 'medium' for any pre-existing rows.

alter table matches
  add column confidence text not null default 'medium' check (confidence in ('low', 'medium', 'high'));
