"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { insertVideoAnnotation } from "@/lib/db";
import { createClient } from "@/lib/supabase";
import type { VideoAnnotation } from "@/lib/types";

interface Point { x: number; y: number }
type Tool = "pen" | "arrow" | "circle";
interface Stroke { tool: Tool; color: string; points: Point[] }

const COLORS = ["#00D4AA", "#FF6B2B", "#E8B93F", "#FF4D4D", "#FFFFFF"];

interface Props {
  videoUrl: string;
  angle: "front" | "side" | "back";
  sessionId: string;
  playerId: string;
  onClose: () => void;
  onSaved: (annotation: VideoAnnotation) => void;
}

export function VideoAnnotator({ videoUrl, angle, sessionId, playerId, onClose, onSaved }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const drawingRef = useRef<Stroke | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const redraw = useCallback((liveStroke?: Stroke | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const all = liveStroke ? [...strokes, liveStroke] : strokes;
    for (const s of all) drawStroke(ctx, s);
  }, [strokes]);

  useEffect(() => { redraw(); }, [redraw]);

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setVideoSize({ width: video.videoWidth, height: video.videoHeight });
  }

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    videoRef.current?.pause();
    const p = canvasPoint(e);
    drawingRef.current = { tool, color, points: [p] };
    redraw(drawingRef.current);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = drawingRef.current;
    if (!stroke) return;
    const p = canvasPoint(e);
    if (stroke.tool === "pen") {
      stroke.points.push(p);
    } else {
      stroke.points = [stroke.points[0], p]; // arrow/circle only need start+end
    }
    redraw(stroke);
  }

  function handlePointerUp() {
    const stroke = drawingRef.current;
    if (!stroke || stroke.points.length < 2) { drawingRef.current = null; redraw(); return; }
    setStrokes((prev) => [...prev, stroke]);
    drawingRef.current = null;
  }

  function undo() {
    setStrokes((prev) => prev.slice(0, -1));
  }

  function clearAll() {
    setStrokes([]);
  }

  async function handleSave() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !videoSize) return;
    setSaving(true);
    setError("");
    try {
      const composite = document.createElement("canvas");
      composite.width = videoSize.width;
      composite.height = videoSize.height;
      const ctx = composite.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported.");
      ctx.drawImage(video, 0, 0, videoSize.width, videoSize.height);
      ctx.drawImage(canvas, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        composite.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode image."))), "image/jpeg", 0.85);
      });

      const id = `va_${Date.now()}`;
      const path = `${playerId}/${sessionId}/annotations/${id}.jpg`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("session-videos").upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("session-videos").getPublicUrl(path);

      const timestampSec = video.currentTime;
      await insertVideoAnnotation({
        id, session_id: sessionId, player_id: playerId, angle,
        timestamp_sec: timestampSec, image_url: data.publicUrl, note,
      });

      onSaved({
        id, sessionId, playerId, angle, timestampSec,
        imageUrl: data.publicUrl, note,
      });
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl p-5 max-w-2xl w-full max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white">Markup — {angle} camera</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none cursor-pointer">×</button>
        </div>
        <p className="text-xs text-zinc-500 mb-3">Pause the clip where you want to make a point, draw on it, and save — the markup is saved as an image attached to this session.</p>

        {loadError ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{loadError}</div>
        ) : (
          <>
            <div className="relative w-full mb-3" style={{ aspectRatio: videoSize ? `${videoSize.width}/${videoSize.height}` : "16/9" }}>
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                crossOrigin="anonymous"
                onLoadedMetadata={handleLoadedMetadata}
                onError={() => setLoadError("Couldn't load this video.")}
                className="absolute inset-0 w-full h-full rounded-lg bg-black"
              />
              {videoSize && (
                <canvas
                  ref={canvasRef}
                  width={videoSize.width}
                  height={videoSize.height}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  className="absolute inset-0 w-full h-full rounded-lg cursor-crosshair"
                />
              )}
            </div>

            {/* Tools */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {(["pen", "arrow", "circle"] as Tool[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTool(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer capitalize ${
                    tool === t ? "bg-pace-green/20 border-pace-green text-pace-green" : "bg-ink border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {t}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{ background: c }}
                    className={`w-6 h-6 rounded-full border-2 cursor-pointer ${color === c ? "border-white" : "border-transparent"}`}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <button type="button" onClick={undo} disabled={strokes.length === 0} className="ml-auto text-xs text-zinc-400 hover:text-white underline cursor-pointer disabled:opacity-40 disabled:cursor-default">
                Undo
              </button>
              <button type="button" onClick={clearAll} disabled={strokes.length === 0} className="text-xs text-zinc-400 hover:text-red-400 underline cursor-pointer disabled:opacity-40 disabled:cursor-default">
                Clear
              </button>
            </div>

            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What are you pointing out?"
              className="w-full bg-ink rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none text-sm resize-none h-16 mb-3"
            />

            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !videoSize}
                className="px-4 py-2.5 text-sm font-bold bg-pace-green text-black rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Saving…" : "Save Markup"}
              </button>
              <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white transition-colors cursor-pointer">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = Math.max(3, ctx.canvas.width / 250);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (s.tool === "pen") {
    ctx.beginPath();
    s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    return;
  }

  const [a, b] = s.points;
  if (!a || !b) return;

  if (s.tool === "circle") {
    const rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  if (s.tool === "arrow") {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const headLen = Math.max(12, ctx.canvas.width / 40);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - headLen * Math.cos(angle - Math.PI / 7), b.y - headLen * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(b.x - headLen * Math.cos(angle + Math.PI / 7), b.y - headLen * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  }
}
