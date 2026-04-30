import { createClient } from "jsr:@supabase/supabase-js@2";

const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}_ -]+$/u;
const SESSION_ROUNDS = 5;
const MAX_SCORE = 500;
const LEGACY_SUBMISSION_TYPE = "legacy_local_best";
const DISPLAY_NAME_ONLY_SUBMISSION_TYPE = "display_name_only";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type ScoreRound = {
  roundNumber?: number;
  roundScore?: number;
  productId?: string;
  productNameHe?: string;
};

type SubmissionType =
  | "run"
  | typeof LEGACY_SUBMISSION_TYPE
  | typeof DISPLAY_NAME_ONLY_SUBMISSION_TYPE;

function isOptionalString(value: unknown) {
  return typeof value === "undefined" || typeof value === "string";
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function normalizeDisplayName(displayName: string) {
  return displayName.trim().replace(/\s+/g, " ");
}

function validateDisplayName(displayName: string) {
  const normalized = normalizeDisplayName(displayName);

  if (normalized.length < 2 || normalized.length > 20) {
    return { error: "Display name must be 2-20 characters long." };
  }

  if (!DISPLAY_NAME_PATTERN.test(normalized)) {
    return { error: "Display name contains unsupported characters." };
  }

  return { normalized };
}

function normalizeOptionalTimestamp(value: unknown) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function isValidRounds(rounds: unknown): rounds is ScoreRound[] {
  return (
    Array.isArray(rounds) &&
    rounds.length === SESSION_ROUNDS &&
    rounds.every(
      (round) => {
        if (typeof round !== "object" || round === null) {
          return false;
        }

        const scoreRound = round as ScoreRound;

        return (
          Number.isInteger(scoreRound.roundNumber) &&
          (scoreRound.roundNumber as number) >= 1 &&
          (scoreRound.roundNumber as number) <= SESSION_ROUNDS &&
          Number.isInteger(scoreRound.roundScore) &&
          (scoreRound.roundScore as number) >= 0 &&
          (scoreRound.roundScore as number) <= 100 &&
          isOptionalString(scoreRound.productId) &&
          isOptionalString(scoreRound.productNameHe)
        );
      }
    )
  );
}

async function fetchLeaderboardRows(serviceClient: ReturnType<typeof createClient>) {
  const rankedResult = await serviceClient
    .from("public_leaderboard")
    .select("player_id, best_score, best_score_at, rank")
    .order("rank", { ascending: true });
  let data: Array<Record<string, unknown>> | null = rankedResult.data as Array<Record<string, unknown>> | null;
  let error = rankedResult.error;

  if (error) {
    const fallbackResult = await serviceClient
      .from("public_leaderboard")
      .select("player_id, best_score, best_score_at")
      .order("best_score", { ascending: false })
      .order("best_score_at", { ascending: true });
    data = fallbackResult.data as Array<Record<string, unknown>> | null;
    error = fallbackResult.error;
  }

  return {
    data: (data ?? []).map((row, index) => ({
      ...row,
      rank: Number.isInteger(row.rank) ? Number(row.rank) : index + 1
    })),
    error
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabasePublishableKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !supabasePublishableKey || !supabaseServiceRoleKey) {
    return jsonResponse({ error: "Supabase environment variables are missing." }, 500);
  }

  if (!authorization) {
    return jsonResponse({ error: "Missing authorization header." }, 401);
  }

  const authClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } }
  });

  const {
    data: { user },
    error: userError
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  let payload: {
    submissionType?: SubmissionType;
    score?: number;
    rounds?: unknown;
    catalogUpdatedAt?: string | null;
    displayName?: string;
    legacyAchievedAt?: string | null;
  };

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (!Number.isInteger(payload.score) || payload.score < 0 || payload.score > MAX_SCORE) {
    return jsonResponse({ error: "Score must be an integer between 0 and 500." }, 400);
  }

  const submissionType: SubmissionType =
    payload.submissionType === LEGACY_SUBMISSION_TYPE
      ? LEGACY_SUBMISSION_TYPE
      : payload.submissionType === DISPLAY_NAME_ONLY_SUBMISSION_TYPE
        ? DISPLAY_NAME_ONLY_SUBMISSION_TYPE
        : "run";

  if (submissionType === "run" && !isValidRounds(payload.rounds)) {
    return jsonResponse({ error: "Rounds payload must contain exactly 5 round results." }, 400);
  }

  const displayNameInput = typeof payload.displayName === "string" ? payload.displayName : "";
  const displayNameValidation =
    displayNameInput.length > 0 ? validateDisplayName(displayNameInput) : { normalized: null };

  if ("error" in displayNameValidation) {
    return jsonResponse({ error: displayNameValidation.error }, 400);
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  const { data: existingProfile, error: profileError } = await serviceClient
    .from("player_profiles")
    .select("id, display_name, best_score, best_score_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ error: "Could not load player profile." }, 500);
  }

  const effectiveDisplayName =
    displayNameValidation.normalized ?? existingProfile?.display_name ?? null;

  if (!effectiveDisplayName) {
    return jsonResponse({ error: "Display name is required on first submission." }, 400);
  }

  const { data: conflictingProfiles, error: conflictingProfileError } = await serviceClient
    .from("player_profiles")
    .select("id")
    .neq("id", user.id)
    .ilike("display_name", effectiveDisplayName)
    .limit(1);

  if (conflictingProfileError) {
    return jsonResponse({ error: "Could not verify display name availability." }, 500);
  }

  if ((conflictingProfiles ?? []).length > 0) {
    return jsonResponse({ error: "השם כבר תפוס. נסו שם אחר." }, 409);
  }

  const isScoreSubmission = submissionType !== DISPLAY_NAME_ONLY_SUBMISSION_TYPE;
  const isNewBest = isScoreSubmission && (!existingProfile || payload.score > existingProfile.best_score);
  const legacyAchievedAt = normalizeOptionalTimestamp(payload.legacyAchievedAt);
  const bestScore = isScoreSubmission
    ? existingProfile
      ? Math.max(existingProfile.best_score, payload.score)
      : payload.score
    : existingProfile?.best_score ?? 0;
  const bestScoreAt = isNewBest
    ? submissionType === LEGACY_SUBMISSION_TYPE && legacyAchievedAt
      ? legacyAchievedAt
      : new Date().toISOString()
    : existingProfile?.best_score_at ?? null;

  const { error: upsertError } = await serviceClient.from("player_profiles").upsert(
    {
      id: user.id,
      display_name: effectiveDisplayName,
      best_score: bestScore,
      best_score_at: bestScoreAt
    },
    { onConflict: "id" }
  );

  if (upsertError) {
    return jsonResponse({ error: "Could not save player profile." }, 500);
  }

  if (isScoreSubmission) {
    const { error: submissionError } = await serviceClient.from("score_submissions").insert({
      player_id: user.id,
      display_name_snapshot: effectiveDisplayName,
      score: payload.score,
      rounds: submissionType === LEGACY_SUBMISSION_TYPE ? [] : payload.rounds,
      catalog_updated_at: payload.catalogUpdatedAt ?? null
    });

    if (submissionError) {
      return jsonResponse({ error: "Could not save score submission." }, 500);
    }
  }

  const { data: leaderboardRows, error: leaderboardError } = await fetchLeaderboardRows(serviceClient);

  if (leaderboardError) {
    return jsonResponse({ error: "Score saved, but leaderboard rank is unavailable." }, 200);
  }

  const leaderboardRank =
    (leaderboardRows ?? []).find((row) => row.player_id === user.id)?.rank ?? null;

  return jsonResponse({
    accepted: true,
    bestScore,
    isNewBest,
    leaderboardRank: leaderboardRank > 0 ? leaderboardRank : null,
    displayName: effectiveDisplayName
  });
});
