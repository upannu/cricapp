import { describe, expect, test, vi } from "vitest";
import { uploadProfilePhoto, MAX_PHOTO_UPLOAD_BYTES } from "@/lib/profile-photo-upload";

const { uploadToSignedUrl, getPublicUrl } = vi.hoisted(() => ({
  uploadToSignedUrl: vi.fn(),
  getPublicUrl: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl, getPublicUrl }) } }),
}));

const originalFetch = global.fetch;

function makeFile(name: string, size: number, type = "image/jpeg"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function setupDefaults() {
  uploadToSignedUrl.mockClear().mockResolvedValue({ error: null });
  getPublicUrl.mockClear().mockReturnValue({ data: { publicUrl: "https://example.test/photo.jpg" } });
  global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ token: "signed-token" }) }) as unknown as typeof fetch;
}

describe("uploadProfilePhoto", () => {
  test("signs, uploads via signed URL, and returns the public URL", async () => {
    setupDefaults();
    const file = makeFile("me.jpg", 1024);

    const url = await uploadProfilePhoto({ file, entityType: "player", entityId: "p1" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/storage/sign-photo-upload",
      expect.objectContaining({ body: expect.stringContaining('"path":"player/p1/') }),
    );
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^player\/p1\/\d+\.jpg$/), "signed-token", file,
      expect.objectContaining({ contentType: "image/jpeg" }),
    );
    expect(url).toBe("https://example.test/photo.jpg");
  });

  test("rejects a non-image file type before ever calling fetch", async () => {
    setupDefaults();
    const file = makeFile("notes.pdf", 1024, "application/pdf");

    await expect(uploadProfilePhoto({ file, entityType: "coach", entityId: "c1" }))
      .rejects.toThrow(/JPEG, PNG, or WebP/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("rejects a file over the 5MB limit before ever calling fetch", async () => {
    setupDefaults();
    const file = makeFile("big.png", MAX_PHOTO_UPLOAD_BYTES + 1, "image/png");

    await expect(uploadProfilePhoto({ file, entityType: "academy", entityId: "ac1" }))
      .rejects.toThrow(/exceeds the 5MB photo upload limit/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("throws with the server's error when requesting a signed upload URL fails", async () => {
    setupDefaults();
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ error: "Not authorized." }) }) as unknown as typeof fetch;
    const file = makeFile("me.jpg", 1024);

    await expect(uploadProfilePhoto({ file, entityType: "player", entityId: "p1" }))
      .rejects.toThrow("Not authorized.");
    global.fetch = originalFetch;
  });

  test("throws when the storage upload itself errors", async () => {
    setupDefaults();
    uploadToSignedUrl.mockResolvedValue({ error: new Error("storage quota exceeded") });
    const file = makeFile("me.jpg", 1024);

    await expect(uploadProfilePhoto({ file, entityType: "player", entityId: "p1" }))
      .rejects.toThrow("storage quota exceeded");
    global.fetch = originalFetch;
  });
});
