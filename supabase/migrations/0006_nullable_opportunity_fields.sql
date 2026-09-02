-- university and location were NOT NULL, but real listings legitimately
-- lack one or both — e.g. a broad fellowship (ProFellow) not tied to any
-- single institution, or a scholarship open to "various" locations. Groq
-- correctly returns null for these; the NOT NULL constraint was rejecting
-- the whole insert batch over a single such row.

alter table opportunities alter column university drop not null;
alter table opportunities alter column location drop not null;
