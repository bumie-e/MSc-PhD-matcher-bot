-- 1. Personalised matches belong only to users who connect their own AI key.
--    Matches written before bring-your-own-key were scored with the owner's key,
--    so remove them for anyone who has not connected a key, and hide matches
--    from anyone whose key row does not exist (for example after they remove it).
delete from matches m
where not exists (select 1 from user_llm_keys k where k.user_id = m.user_id);

drop policy if exists "users read own matches" on matches;
create policy "users read own matches"
  on matches for select
  to authenticated
  using (
    auth.uid() = user_id
    and exists (select 1 from user_llm_keys k where k.user_id = auth.uid())
  );

-- 2. Friendly random display names (one 8-letter word) instead of the email.
create or replace function public.random_display_name()
returns text
language sql
volatile
as $$
  select initcap((array['sparkles', 'dumpling', 'pancakes', 'bluebell', 'cupcakes', 'starfish', 'raindrop', 'moonbeam', 'sunshine', 'mushroom', 'marigold', 'pinecone', 'cinnamon', 'hazelnut', 'snowdrop', 'lollipop', 'goldfish', 'pretzels', 'daffodil', 'cherries', 'hedgehog', 'penguins', 'dolphins', 'seashell', 'pumpkins', 'gumdrops', 'mooncake', 'ladybird', 'snowball', 'rainbows', 'sweetpea', 'honeybee', 'snuggles'])[1 + floor(random() * 33)::int]);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, display_name)
  values (new.id, public.random_display_name())
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Existing accounts currently show their email as a name; replace those.
update public.user_profiles
set display_name = public.random_display_name()
where display_name is null or display_name like '%@%';
