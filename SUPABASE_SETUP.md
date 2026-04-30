# Supabase Setup

This project stays a static Vercel site. Supabase handles:

- anonymous player identity
- leaderboard reads
- secure score submission

## 1. Create a Supabase project

Create a new Supabase project and keep these values ready:

- Project URL
- Publishable key
- Service role key

## 2. Run the SQL migration

In the Supabase SQL Editor, run:

- [`supabase/migrations/20260430_leaderboard.sql`](</C:/Users/Ido/Documents/codex proj/online comapre game/supabase/migrations/20260430_leaderboard.sql>)

This creates:

- `player_profiles`
- `score_submissions`
- `public_leaderboard`
- RLS policies

## 3. Enable anonymous auth

In Supabase Auth settings:

- enable **Anonymous Sign-Ins**

The frontend signs players in anonymously on first load and reuses that session in the same browser.

## 4. Deploy the Edge Function

Deploy:

- [`supabase/functions/submit-score/index.ts`](</C:/Users/Ido/Documents/codex proj/online comapre game/supabase/functions/submit-score/index.ts>)

On hosted Supabase projects, this function uses the built-in Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

So in the normal hosted setup, you do not need to add custom function secrets for this v1 flow.

The function code also accepts `SUPABASE_PUBLISHABLE_KEY` as a fallback when serving outside the hosted defaults, but that is not the normal dashboard setup.

If you use the Supabase CLI, the usual flow is:

```bash
supabase functions deploy submit-score
```

## 5. Add Vercel environment variables

In Vercel, add these project environment variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Add them for:

- `Preview`
- `Production`

This repo now generates `public/runtime-config.js` during build, so preview and production deployments can each inject their own public Supabase config.

## 6. Redeploy Vercel

This repo now includes:

- [`vercel.json`](</C:/Users/Ido/Documents/codex proj/online comapre game/vercel.json>)

Vercel should build with:

```bash
npm run build
```

and publish:

```text
public
```

## 7. What to test

On a fresh browser:

1. Finish a 5-round game
2. Open the summary screen
3. Check that local personal best appears
4. Click `שלח לטבלה`
5. Enter a display name
6. Submit
7. Confirm the leaderboard fills in
8. Play again and verify:
   - the name is reused
   - a lower score does not replace the local personal best
   - a higher score updates the local best

## Notes

- Personal best is intentionally device/browser scoped in v1.
- Leaderboard is all-time only in v1.
- Duplicate display names are allowed.
- The backend validates shape and score range, but this is not a full anti-cheat system yet.
