import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/storage/sign-photo-upload/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/storage/sign-photo-upload";

function signedUrlResponse(path: string) {
  return {
    "profile-photos": {
      createSignedUploadUrl: { data: { signedUrl: "https://x.test/upload", token: "tok123", path }, error: null },
    },
  };
}

describe("POST /api/storage/sign-photo-upload", () => {
  test("400 when path is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("400 for a malformed path (no entityId segment)", async () => {
    const res = await POST(jsonRequest(URL, { path: "player" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { path: "player/p1/123.jpg" }));
    expect(res.status).toBe(401);
  });

  test("400 for an unrecognized entity type", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    const res = await POST(jsonRequest(URL, { path: "booking/b1/123.jpg" }));
    expect(res.status).toBe(400);
  });

  test("403 when a player tries to upload for a different player", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { path: "player/p1/123.jpg" }));
    expect(res.status).toBe(403);
  });

  test("403 when a coach tries to upload for a coach who isn't them", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { path: "coach/c1/123.jpg" }));
    expect(res.status).toBe(403);
  });

  test("403 when an academy_admin tries to upload for a different academy", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "someone-elses" });
    const res = await POST(jsonRequest(URL, { path: "academy/ac1/123.jpg" }));
    expect(res.status).toBe(403);
  });

  test("signs a player photo upload for the player themselves", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "p1" });
    routeMockState.storageResponses = signedUrlResponse("player/p1/123.jpg");
    const res = await POST(jsonRequest(URL, { path: "player/p1/123.jpg" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.token).toBe("tok123");
  });

  test("signs a coach photo upload for an academy_admin managing that coach", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.tableResponses = { coaches: { data: { academy_id: "ac1" }, error: null } };
    routeMockState.storageResponses = signedUrlResponse("coach/c1/123.jpg");
    const res = await POST(jsonRequest(URL, { path: "coach/c1/123.jpg" }));
    expect(res.status).toBe(200);
  });

  test("signs an academy logo upload for that academy's own admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    routeMockState.storageResponses = signedUrlResponse("academy/ac1/123.jpg");
    const res = await POST(jsonRequest(URL, { path: "academy/ac1/123.jpg" }));
    expect(res.status).toBe(200);
  });

  test("500 when Supabase fails to sign the URL", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.storageResponses = {
      "profile-photos": { createSignedUploadUrl: { data: null, error: { message: "bucket missing" } } },
    };
    const res = await POST(jsonRequest(URL, { path: "player/p1/123.jpg" }));
    expect(res.status).toBe(500);
  });
});
