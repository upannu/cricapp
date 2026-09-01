import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/storage/sign-upload/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/storage/sign-upload";

describe("POST /api/storage/sign-upload", () => {
  test("400 when path missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { path: "p1/s1/front.mp4" }));
    expect(res.status).toBe(401);
  });

  test("403 when caller cannot access the player prefix in the path", async () => {
    routeMockState.cookieUser = rawUser({ role: "player", player_id: "someone-else" });
    const res = await POST(jsonRequest(URL, { path: "p1/s1/front.mp4" }));
    expect(res.status).toBe(403);
  });

  test("returns a signed upload URL for an authorized caller", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.storageResponses = {
      "session-videos": {
        createSignedUploadUrl: { data: { signedUrl: "https://x.test/upload", token: "tok123", path: "p1/s1/front.mp4" }, error: null },
      },
    };

    const res = await POST(jsonRequest(URL, { path: "p1/s1/front.mp4" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ signedUrl: "https://x.test/upload", token: "tok123", path: "p1/s1/front.mp4" });

    const client = routeMockState.lastServiceClient!;
    expect(client.buckets["session-videos"].createSignedUploadUrl).toHaveBeenCalledWith("p1/s1/front.mp4");
  });

  test("500 when Supabase fails to sign the URL", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.storageResponses = {
      "session-videos": { createSignedUploadUrl: { data: null, error: { message: "bucket missing" } } },
    };

    const res = await POST(jsonRequest(URL, { path: "p1/s1/front.mp4" }));
    expect(res.status).toBe(500);
  });
});
