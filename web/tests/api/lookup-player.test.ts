import { describe, expect, test } from "vitest";
import { GET } from "@/app/api/lookup-player/route";
import { routeMockState } from "../setup/api";

function req(query: string) {
  return new Request(`http://localhost/api/lookup-player?${query}`);
}

describe("GET /api/lookup-player", () => {
  test("400 when email is missing", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
  });

  test("returns found:true and the first name for a matching player", async () => {
    routeMockState.tableResponses = { players: { data: [{ name: "Alice Bowler" }], error: null } };
    const res = await GET(req("email=alice@example.com"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ found: true, playerName: "Alice Bowler", additionalCount: 0 });
  });

  test("returns found:false with no matching player, never leaking other data", async () => {
    routeMockState.tableResponses = { players: { data: [], error: null } };
    const res = await GET(req("email=nobody@example.com"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ found: false, playerName: null, additionalCount: 0 });
  });

  test("returns additionalCount when the same email matches more than one player (e.g. siblings)", async () => {
    routeMockState.tableResponses = {
      players: { data: [{ name: "Alice Bowler" }, { name: "Bobby Bowler" }, { name: "Cara Bowler" }], error: null },
    };
    const res = await GET(req("email=family@example.com"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ found: true, playerName: "Alice Bowler", additionalCount: 2 });
  });
});
