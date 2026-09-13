import { describe, expect, test, vi } from "vitest";
import { uploadSessionVideo, MAX_UPLOAD_BYTES } from "@/lib/session-video-upload";

const { transcodeToH264 } = vi.hoisted(() => ({ transcodeToH264: vi.fn() }));
vi.mock("@/lib/transcode", () => ({ transcodeToH264 }));

const { uploadToSignedUrl, getPublicUrl } = vi.hoisted(() => ({
  uploadToSignedUrl: vi.fn(),
  getPublicUrl: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl, getPublicUrl }) } }),
}));

const originalFetch = global.fetch;

function makeFile(name: string, size: number, type = "video/mp4"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function setupDefaults() {
  transcodeToH264.mockClear().mockResolvedValue(makeFile("clip.mp4", 1024));
  uploadToSignedUrl.mockClear().mockResolvedValue({ error: null });
  getPublicUrl.mockClear().mockReturnValue({ data: { publicUrl: "https://example.test/clip.mp4" } });
  global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ token: "signed-token" }) }) as unknown as typeof fetch;
}

describe("uploadSessionVideo", () => {
  test("transcodes, uploads via signed URL, and returns a SessionVideo with the public URL", async () => {
    setupDefaults();
    const file = makeFile("original.mov", 2048);

    const video = await uploadSessionVideo({ file, playerId: "p1", sessionId: "s1", angle: "side" });

    expect(transcodeToH264).toHaveBeenCalledWith(file, expect.any(Function));
    expect(global.fetch).toHaveBeenCalledWith("/api/storage/sign-upload", expect.objectContaining({
      body: JSON.stringify({ path: "p1/s1/side.mp4" }),
    }));
    expect(uploadToSignedUrl).toHaveBeenCalledWith("p1/s1/side.mp4", "signed-token", expect.any(File), expect.objectContaining({ contentType: "video/mp4" }));
    expect(video).toMatchObject({ angle: "side", label: "original.mov", url: "https://example.test/clip.mp4", transcoded: true });
  });

  test("falls back to the original file (and its own extension) when transcoding fails", async () => {
    setupDefaults();
    transcodeToH264.mockRejectedValue(new Error("out of memory"));
    const file = makeFile("original.mov", 2048);

    const video = await uploadSessionVideo({ file, playerId: "p1", sessionId: "s1", angle: "front" });

    expect(global.fetch).toHaveBeenCalledWith("/api/storage/sign-upload", expect.objectContaining({
      body: JSON.stringify({ path: "p1/s1/front.mov" }),
    }));
    expect(video.transcoded).toBe(false);
  });

  test("throws when the (possibly transcoded) file exceeds the upload size limit", async () => {
    setupDefaults();
    transcodeToH264.mockResolvedValue(makeFile("clip.mp4", MAX_UPLOAD_BYTES + 1));
    const file = makeFile("original.mov", 2048);

    await expect(uploadSessionVideo({ file, playerId: "p1", sessionId: "s1", angle: "back" }))
      .rejects.toThrow(/exceeds the 50MB upload limit/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("throws with the server's error when requesting a signed upload URL fails", async () => {
    setupDefaults();
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ error: "Not configured." }) }) as unknown as typeof fetch;
    const file = makeFile("original.mov", 2048);

    await expect(uploadSessionVideo({ file, playerId: "p1", sessionId: "s1", angle: "side" }))
      .rejects.toThrow("Not configured.");
  });

  test("throws when the storage upload itself errors", async () => {
    setupDefaults();
    uploadToSignedUrl.mockResolvedValue({ error: new Error("storage quota exceeded") });
    const file = makeFile("original.mov", 2048);

    await expect(uploadSessionVideo({ file, playerId: "p1", sessionId: "s1", angle: "side" }))
      .rejects.toThrow("storage quota exceeded");

    global.fetch = originalFetch;
  });

  test("carries the probed quality metadata through onto the returned SessionVideo", async () => {
    setupDefaults();
    const file = makeFile("original.mov", 2048);

    const video = await uploadSessionVideo({
      file, playerId: "p1", sessionId: "s1", angle: "side",
      quality: { width: 1920, height: 1080, durationSec: 4.2, fps: 30, meetsResolution: true, meetsFps: true },
    });

    expect(video).toMatchObject({ width: 1920, height: 1080, durationSec: 4.2, fps: 30 });
    global.fetch = originalFetch;
  });
});
