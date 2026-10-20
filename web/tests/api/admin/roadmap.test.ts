import { describe, expect, test } from "vitest";
import { POST, DELETE } from "@/app/api/admin/roadmap/route";
import { routeMockState } from "../../setup/api";
import { rawUser, jsonRequest } from "../../mocks/caller";

const URL = "http://localhost/api/admin/roadmap";

describe("POST /api/admin/roadmap", () => {
  test("400 when title is missing", async () => {
    const res = await POST(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("400 for an invalid status", async () => {
    const res = await POST(jsonRequest(URL, { title: "Thing", status: "Done" }));
    expect(res.status).toBe(400);
  });

  test("403 when not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "academy_admin", academy_id: "ac1" });
    const res = await POST(jsonRequest(URL, { title: "Thing" }));
    expect(res.status).toBe(403);
  });

  test("403 when not signed in", async () => {
    const res = await POST(jsonRequest(URL, { title: "Thing" }));
    expect(res.status).toBe(403);
  });

  test("inserts a new item defaulting to Planned", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { platform_roadmap_items: { data: { id: "r1" }, error: null } };

    const res = await POST(jsonRequest(URL, { title: "Add dark mode", description: "Toggle in settings" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe("r1");
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.platform_roadmap_items.insert).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Add dark mode", description: "Toggle in settings", status: "Planned" }),
    );
  });

  test("updates an existing item's status when an id is given", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { platform_roadmap_items: { data: null, error: null } };

    const res = await POST(jsonRequest(URL, { id: "r1", title: "Add dark mode", description: "", status: "In Progress" }));
    expect(res.status).toBe(200);

    const client = routeMockState.lastServiceClient!;
    expect(client.tables.platform_roadmap_items.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "In Progress" }),
    );
  });

  test("500 when the database write fails", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { platform_roadmap_items: { data: null, error: { message: "db error" } } };

    const res = await POST(jsonRequest(URL, { title: "Thing" }));
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/admin/roadmap", () => {
  test("400 when id is missing", async () => {
    const res = await DELETE(jsonRequest(URL, {}));
    expect(res.status).toBe(400);
  });

  test("403 when not a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "coach", coach_id: "c1" });
    const res = await DELETE(jsonRequest(URL, { id: "r1" }));
    expect(res.status).toBe(403);
  });

  test("deletes the item for a platform admin", async () => {
    routeMockState.cookieUser = rawUser({ role: "platform_admin" });
    routeMockState.tableResponses = { platform_roadmap_items: { data: null, error: null } };

    const res = await DELETE(jsonRequest(URL, { id: "r1" }));
    expect(res.status).toBe(200);
    const client = routeMockState.lastServiceClient!;
    expect(client.tables.platform_roadmap_items.delete).toHaveBeenCalled();
  });
});
