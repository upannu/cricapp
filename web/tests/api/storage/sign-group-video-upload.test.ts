import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/storage/sign-group-video-upload/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/storage/sign-group-video-upload";

describe("POST /api/storage/sign-group-video-upload", () => {
  test("400 when groupSessionId or path missing", async () => {
    const res = await POST(jsonRequest(URL, { path: "squad/gs1/2026-01-01/1.mp4" }));
    expect(res.status).toBe(400);
  });

  test("401 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { groupSessionId: "gs1", path: "squad/gs1/2026-01-01/1.mp4" }));
    expect(res.status).toBe(401);
  });

  test("403 when caller (a coach) doesn't own the group session", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "other-coach" });
    routeMockState.tableResponses = {
      group_sessions: { data: { academy_id: "ac1", coach_id: "coach-1" }, error: null },
    };
    const res = await POST(jsonRequest(URL, { groupSessionId: "gs1", path: "squad/gs1/2026-01-01/1.mp4" }));
    expect(res.status).toBe(403);
  });

  test("403 when the academy hasn't enabled Squad Video Sharing, even for the owning coach", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "coach-1" });
    routeMockState.tableResponses = {
      group_sessions: { data: { academy_id: "ac1", coach_id: "coach-1" }, error: null },
      academies: { data: { squad_video_sharing_enabled: false }, error: null },
    };
    const res = await POST(jsonRequest(URL, { groupSessionId: "gs1", path: "squad/gs1/2026-01-01/1.mp4" }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/Squad Video Sharing/);
  });

  test("400 when the path isn't namespaced under squad/", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      group_sessions: { data: { academy_id: "ac1", coach_id: "coach-1" }, error: null },
      academies: { data: { squad_video_sharing_enabled: true }, error: null },
    };
    const res = await POST(jsonRequest(URL, { groupSessionId: "gs1", path: "p1/s1/front.mp4" }));
    expect(res.status).toBe(400);
  });

  test("returns a signed upload URL for an authorized caller with video sharing enabled", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = {
      group_sessions: { data: { academy_id: "ac1", coach_id: "coach-1" }, error: null },
      academies: { data: { squad_video_sharing_enabled: true }, error: null },
    };
    routeMockState.storageResponses = {
      "session-videos": {
        createSignedUploadUrl: { data: { signedUrl: "https://x.test/upload", token: "tok123", path: "squad/gs1/2026-01-01/1.mp4" }, error: null },
      },
    };

    const res = await POST(jsonRequest(URL, { groupSessionId: "gs1", path: "squad/gs1/2026-01-01/1.mp4" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ signedUrl: "https://x.test/upload", token: "tok123", path: "squad/gs1/2026-01-01/1.mp4" });

    const client = routeMockState.lastServiceClient!;
    expect(client.buckets["session-videos"].createSignedUploadUrl).toHaveBeenCalledWith("squad/gs1/2026-01-01/1.mp4");
  });

  test("403 when a coach's own group session doesn't exist (not found)", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "coach-1" });
    routeMockState.tableResponses = {
      group_sessions: { data: null, error: null },
    };
    const res = await POST(jsonRequest(URL, { groupSessionId: "does-not-exist", path: "squad/gs1/2026-01-01/1.mp4" }));
    expect(res.status).toBe(403);
  });
});
