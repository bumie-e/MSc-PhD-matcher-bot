-- Matches are visible only to users who finished personalisation: an AI key,
-- a read CV and completed interests/preferences. Everyone else browses the
-- shared opportunity list and sees no scores.
create or replace function public.is_personalised(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from user_llm_keys k where k.user_id = uid)
     and exists (select 1 from user_cv c where c.user_id = uid and (c.parse_status = 'done' or c.parsed <> '{}'::jsonb))
     and exists (select 1 from user_profiles p where p.id = uid and p.onboarding_step >= 5);
$$;

revoke all on function public.is_personalised(uuid) from public;
grant execute on function public.is_personalised(uuid) to authenticated;

drop policy if exists "users read own matches" on matches;
create policy "users read own matches"
  on matches for select
  to authenticated
  using (auth.uid() = user_id and public.is_personalised(auth.uid()));

-- Name generator: adjective + animal/thing + two digits, e.g. MossyOtter42.
-- 63 x 65 x 90 = 368,550 combinations. Used for new accounts and by the
-- "Suggest another" button in Settings.
create or replace function public.random_display_name()
returns text
language sql
volatile
as $$
  select initcap((array['amber', 'azure', 'bouncy', 'brave', 'breezy', 'bright', 'calm', 'cheery', 'clever', 'coral', 'cozy', 'dreamy', 'dusty', 'fluffy', 'frosty', 'fuzzy', 'gentle', 'glowy', 'golden', 'happy', 'hazy', 'icy', 'ivory', 'jade', 'jolly', 'lazy', 'lilac', 'lucky', 'maple', 'merry', 'minty', 'misty', 'mossy', 'nifty', 'olive', 'pearl', 'peppy', 'plucky', 'plum', 'quirky', 'rosy', 'ruby', 'rusty', 'sandy', 'silky', 'silver', 'sleepy', 'snappy', 'snowy', 'speedy', 'spry', 'sunny', 'sweet', 'swift', 'teal', 'tiny', 'toasty', 'velvet', 'violet', 'wavy', 'wild', 'witty', 'zesty'])[1 + floor(random() * 63)::int])
      || initcap((array['acorn', 'badger', 'beaver', 'beetle', 'biscuit', 'bunny', 'cactus', 'cloud', 'clover', 'comet', 'crane', 'cricket', 'daisy', 'dolphin', 'falcon', 'fawn', 'finch', 'fox', 'frog', 'gecko', 'heron', 'kitten', 'koala', 'lamb', 'lark', 'lemur', 'lotus', 'lynx', 'maple', 'marmot', 'meadow', 'meerkat', 'moth', 'muffin', 'newt', 'noodle', 'orchid', 'otter', 'owl', 'panda', 'peach', 'pebble', 'penguin', 'plum', 'pony', 'pretzel', 'puffin', 'puppy', 'quokka', 'raccoon', 'robin', 'seal', 'sloth', 'sparrow', 'swan', 'tapir', 'toad', 'turtle', 'waffle', 'walrus', 'whale', 'willow', 'wren', 'yak', 'zebra'])[1 + floor(random() * 65)::int])
      || (10 + floor(random() * 90))::int::text;
$$;

grant execute on function public.random_display_name() to authenticated;
