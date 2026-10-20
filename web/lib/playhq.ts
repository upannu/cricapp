/**
 * Thin client for PlayHQ's public External API (docs.playhq.com/tech/api/playhq-external-api) —
 * the discovery chain this app uses to find and import a club's completed games:
 *   organisation -> seasons -> grades -> games -> one game's full summary/scorecard.
 * Every call here needs only the public-tier `x-api-key`/`x-phq-tenant` headers (one platform-wide
 * key, set once as an env var — see PLAYHQ_API_KEY/PLAYHQ_TENANT below), no partner JWT.
 *
 * The exact response shapes below are built from PlayHQ's published OpenAPI spec and its example
 * payloads, but haven't yet been exercised against a live PLAYHQ_API_KEY (see the PlayHQ importer
 * plan's "Flagged for review" section) — treat field names here as the best-available mapping,
 * not as verified. mapGameSummaryToImport is deliberately defensive (missing stats default to 0)
 * so an unexpected shape degrades to incomplete stats rather than throwing.
 */

const PLAYHQ_API_BASE = "https://api.playhq.com";

export class PlayHQApiError extends Error {}

async function playhqFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.PLAYHQ_API_KEY;
  const tenant = process.env.PLAYHQ_TENANT;
  if (!apiKey || !tenant) {
    throw new PlayHQApiError("PlayHQ is not configured.");
  }
  const res = await fetch(`${PLAYHQ_API_BASE}${path}`, {
    headers: { "x-api-key": apiKey, "x-phq-tenant": tenant },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { message?: string } | null;
    throw new PlayHQApiError(body?.message ?? `PlayHQ request failed (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export interface PlayHQSeason {
  id: string;
  name: string;
}

export async function fetchOrganisationSeasons(organisationId: string): Promise<PlayHQSeason[]> {
  const body = await playhqFetch<{ data: PlayHQSeason[] }>(`/v1/organisations/${organisationId}/seasons`);
  return body.data;
}

export interface PlayHQGrade {
  id: string;
  name: string;
}

export async function fetchSeasonGrades(seasonId: string): Promise<PlayHQGrade[]> {
  const body = await playhqFetch<{ data: PlayHQGrade[] }>(`/v1/seasons/${seasonId}/grades`);
  return body.data;
}

export interface PlayHQGameTeam {
  id: string;
  name: string;
}

export interface PlayHQGame {
  id: string;
  status: string;
  date: string;
  venue?: string;
  homeTeam: PlayHQGameTeam;
  awayTeam: PlayHQGameTeam;
  result?: string;
}

export async function fetchGradeGames(gradeId: string): Promise<PlayHQGame[]> {
  const body = await playhqFetch<{ data: PlayHQGame[] }>(`/v2/grades/${gradeId}/games`);
  return body.data;
}

/** One player's figures in one discipline for the game — PlayHQ reports batting/bowling/fielding
 * as separate entries per player, which mapGameSummaryToImport merges into one row per player. */
export interface PlayHQAppearanceStat {
  discipline: "BATTING" | "BOWLING" | "FIELDING";
  playerId: string;
  playerName: string;
  teamId: string;
  stats: Record<string, number | string | boolean>;
}

export interface PlayHQGameSummary {
  id: string;
  status: string;
  homeTeam: PlayHQGameTeam;
  awayTeam: PlayHQGameTeam;
  result?: string;
  tossWonBy?: string;
  tossDecision?: "BAT" | "BOWL";
  appearances: PlayHQAppearanceStat[];
}

export async function fetchGameSummary(gameId: string): Promise<PlayHQGameSummary> {
  const body = await playhqFetch<{ data: PlayHQGameSummary }>(`/v2/games/${gameId}/summary`);
  return body.data;
}

// ─── Mapping a game summary onto CRIC HQ's import shape ────────────────────

/** Caller-supplied resolution of each PlayHQ player id to a real CRIC HQ Player — null means no
 * confirmed match (that appearance contributes no imported_match_stats row). Built by the
 * player-matching review step in the import UI; never auto-matched by name (see the importer
 * plan's "Explicitly deferred to Phase 2" section for why). */
export interface PlayHQPlayerLink {
  playhqPlayerId: string;
  playerId: string | null;
}

export interface MappedImportedStat {
  playerId: string;
  runsScored: number;
  ballsFaced: number;
  notOut: boolean;
  wickets: number;
  ballsBowled: number;
  runsConceded: number;
  catches: number;
  runOuts: number;
  stumpings: number;
}

export interface MappedGameImport {
  homeLabel: string;
  awayLabel: string;
  result: string | null;
  tossWonBy: "home" | "away" | null;
  tossDecision: "Bat" | "Bowl" | null;
  stats: MappedImportedStat[];
}

function statNumber(stats: PlayHQAppearanceStat["stats"], key: string): number {
  const v = stats[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  return 0;
}

function statBool(stats: PlayHQAppearanceStat["stats"], key: string): boolean {
  const v = stats[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

/** PlayHQ reports overs in cricket notation (e.g. 4.3 = 4 overs + 3 balls), not decimal — this
 * converts to a ball count the way lib/matches.ts's own aggregation expects. */
function oversToBalls(overs: number): number {
  const wholeOvers = Math.trunc(overs);
  const extraBalls = Math.round((overs - wholeOvers) * 10);
  return wholeOvers * 6 + extraBalls;
}

/** Merges one game summary's per-discipline appearances into one ImportedMatchStats-shaped row
 * per *resolved* player (unresolved playhqPlayerIds — no entry in playerLinks, or linked to null —
 * contribute nothing, since imported_match_stats.player_id is required not-null). Pure/no I/O, so
 * it's testable directly against PlayHQ's own example payloads without a live API key. */
export function mapGameSummaryToImport(summary: PlayHQGameSummary, playerLinks: PlayHQPlayerLink[]): MappedGameImport {
  const linkByPlayhqId = new Map(playerLinks.map((l) => [l.playhqPlayerId, l.playerId]));
  const rows = new Map<string, MappedImportedStat>();

  function rowFor(playhqPlayerId: string): MappedImportedStat | null {
    const playerId = linkByPlayhqId.get(playhqPlayerId);
    if (!playerId) return null;
    let row = rows.get(playerId);
    if (!row) {
      row = {
        playerId, runsScored: 0, ballsFaced: 0, notOut: false, wickets: 0,
        ballsBowled: 0, runsConceded: 0, catches: 0, runOuts: 0, stumpings: 0,
      };
      rows.set(playerId, row);
    }
    return row;
  }

  for (const appearance of summary.appearances) {
    const row = rowFor(appearance.playerId);
    if (!row) continue;

    if (appearance.discipline === "BATTING") {
      row.runsScored += statNumber(appearance.stats, "TOTAL_RUNS");
      row.ballsFaced += statNumber(appearance.stats, "BALLS_FACED");
      row.notOut = row.notOut || statBool(appearance.stats, "NOT_OUT");
    } else if (appearance.discipline === "BOWLING") {
      row.wickets += statNumber(appearance.stats, "WICKETS");
      row.ballsBowled += oversToBalls(statNumber(appearance.stats, "OVERS"));
      row.runsConceded += statNumber(appearance.stats, "RUNS");
    } else if (appearance.discipline === "FIELDING") {
      row.catches += statNumber(appearance.stats, "CATCHES");
      row.runOuts += statNumber(appearance.stats, "RUN_OUTS");
      row.stumpings += statNumber(appearance.stats, "STUMPINGS");
    }
  }

  const tossWonBy = summary.tossWonBy
    ? (summary.tossWonBy === summary.homeTeam.id ? "home" : "away")
    : null;

  return {
    homeLabel: summary.homeTeam.name,
    awayLabel: summary.awayTeam.name,
    result: summary.result ?? null,
    tossWonBy,
    tossDecision: summary.tossDecision === "BAT" ? "Bat" : summary.tossDecision === "BOWL" ? "Bowl" : null,
    stats: [...rows.values()],
  };
}
