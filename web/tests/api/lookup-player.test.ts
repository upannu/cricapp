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

  test("returns found:true for a matching player, without naming them — this route is unauthenticated", async () => {
    routeMockState.tableResponses = { players: { data: [{ id: "p1" }], error: null } };
    const res = await GET(req("email=alice@example.com"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ found: true, additionalCount: 0 });
    expect(body).not.toHaveProperty("playerName");
  });

  test("returns found:false with no matching player", async () => {
    routeMockState.tableResponses = { players: { data: [], error: null } };
    const res = await GET(req("email=nobody@example.com"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ found: false, additionalCount: 0 });
  });

  test("returns additionalCount when the same email matches more than one player (e.g. siblings), still without any names", async () => {
    routeMockState.tableResponses = {
      players: { data: [{ id: "p1" }, { id: "p2" }, { id: "p3" }], error: null },
    };
    const res = await GET(req("email=family@example.com"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ found: true, additionalCount: 2 });
  });
});
