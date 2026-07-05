"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { upsertCameraCalibration } from "@/lib/db";
import type { CameraCalibration } from "@/lib/types";

interface Point { x: number; y: number }

interface Props {
  videoUrl: string;
  academyId: string;
  angle: "front" | "side" | "back";
  onDone: (calibration: CameraCalibration) => void;
  onCancel: () => void;
}

const DEFAULT_PITCH_LENGTH_M = "20.12";

export function CameraCalibrationModal({ videoUrl, academyId, angle, onDone, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null); // kept alive so the coach can scrub to a better frame
  const frameRef = useRef<HTMLCanvasElement | null>(null); // offscreen copy of the raw frame, redrawn under markers
  const [points, setPoints] = useState<Point[]>([]);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [scrubTime, setScrubTime] = useState(0);
  const [distanceM, setDistanceM] = useState(DEFAULT_PITCH_LENGTH_M);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  const captureCurrentFrame = useCallback(() => {
    const video = videoElRef.current;
    if (!video || !video.videoWidth) return;
    const width = video.videoWidth, height = video.videoHeight;
    const offscreen = document.createElement("canvas");
    offscreen.width = width; offscreen.height = height;
    offscreen.getContext("2d")?.drawImage(video, 0, 0, width, height);
    frameRef.current = offscreen;
    setFrameSize({ width, height });
    setPoints([]); // points from the previous frame no longer correspond to anything
  }, []);

  useEffect(() => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = videoUrl;
    videoElRef.current = video;

    let captured = false;
    const onLoadedData = () => {
      if (captured) return;
      captured = true;
      clearTimeout(timeoutId);
      setDuration(video.duration || 0);
      captureCurrentFrame();
    };
    // The stumps are static, so any frame works for calibration — grabbing the
    // first available frame (via `loadeddata`) avoids relying on an explicit
    // seek, since browsers don't fire `seeked` if the target time happens to
    // equal the video's current position (a real bug this used to hit).
    const onError = () => setLoadError("Couldn't load this video to grab a calibration frame.");
    const timeoutId = setTimeout(() => {
      if (!captured) setLoadError("Timed out loading a frame from this video — try again or skip calibration for now.");
    }, 10000);

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("error", onError);
    return () => {
      clearTimeout(timeoutId);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("error", onError);
      videoElRef.current = null;
    };
  }, [videoUrl, captureCurrentFrame]);

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const t = parseFloat(e.target.value);
    setScrubTime(t);
    const video = videoElRef.current;
    if (!video) return;
    const onSeeked = () => { video.removeEventListener("seeked", onSeeked); captureCurrentFrame(); };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = t;
    // Fallback in case `seeked` doesn't fire (e.g. the target time matches where it already is)
    setTimeout(() => { video.removeEventListener("seeked", onSeeked); captureCurrentFrame(); }, 400);
  }

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(frame, 0, 0);

    if (points.length === 2) {
      ctx.strokeStyle = "#00D4AA";
      ctx.lineWidth = Math.max(2, frame.width / 300);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
    }
    points.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? "#00D4AA" : "#FF6B2B";
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(5, frame.width / 120), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }, [points]);

  useEffect(() => { redraw(); }, [redraw, frameSize]);

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (points.length >= 2) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    setPoints((prev) => [...prev, { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }]);
  }

  async function handleSave() {
    if (points.length !== 2 || !frameSize) return;
    const dist = parseFloat(distanceM);
    if (!dist || dist <= 0) { setError("Enter a valid distance greater than zero."); return; }
    setSaving(true);
    setError("");
    try {
      const id = `cal_${academyId}_${angle}`;
      await upsertCameraCalibration({
        id, academy_id: academyId, angle,
        point1_x: points[0].x, point1_y: points[0].y,
        point2_x: points[1].x, point2_y: points[1].y,
        reference_distance_m: dist,
        frame_width: frameSize.width, frame_height: frameSize.height,
      });
      onDone({
        id, academyId, angle,
        point1: points[0], point2: points[1],
        referenceDistanceM: dist, frameWidth: frameSize.width, frameHeight: frameSize.height,
      });
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white mb-1">Calibrate Camera — One-Time Setup</h2>
        <p className="text-zinc-400 text-sm mb-4">
          This lets ball speed and the pitch map be measured in real units instead of estimated. It only needs doing once per fixed camera position — future reports from this academy&apos;s front camera reuse it automatically.
        </p>

        {loadError ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm mb-4">{loadError}</div>
        ) : !frameSize ? (
          <div className="flex items-center justify-center gap-2 py-16 text-zinc-400 text-sm mb-4">
            <div className="w-4 h-4 rounded-full border-2 border-pace-green border-t-transparent animate-spin" />
            Loading a frame from the video…
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-zinc-300 mb-1">
              Click the <span className="text-pace-green">bowler&apos;s end</span> reference point first, then the <span className="text-fire">batsman&apos;s end</span> reference point.
            </p>
            <p className="text-xs text-zinc-500 mb-2">
              Ideally the base of the stumps at each end. If the batsman&apos;s end isn&apos;t visible in this frame, drag the slider below to find a moment where it is. If it&apos;s never visible in this clip (common with a tight/zoomed shot), mark any two points you <em>can</em> see clearly instead — e.g. two pitch/crease markings — and enter the actual real-world distance between them below (measure it on-site) rather than the full pitch length.
            </p>
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              className={`w-full rounded-lg border border-zinc-700 ${points.length < 2 ? "cursor-crosshair" : "cursor-default"}`}
            />

            {duration > 0 && (
              <div className="mt-2">
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.05}
                  value={scrubTime}
                  onChange={handleScrub}
                  className="w-full cursor-pointer accent-pace-green"
                />
                <p className="text-[10px] text-zinc-600 mt-0.5">Drag to look for a frame where both reference points are clearly visible</p>
              </div>
            )}

            <div className="flex items-center justify-between mt-2 mb-4">
              <span className="text-xs text-zinc-500">{points.length}/2 points marked</span>
              {points.length > 0 && (
                <button type="button" onClick={() => setPoints([])} className="text-xs text-zinc-400 hover:text-white underline cursor-pointer">
                  Reset points
                </button>
              )}
            </div>

            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Real-world distance between the two points (meters)
            </label>
            <input
              type="number"
              step="0.01"
              value={distanceM}
              onChange={(e) => setDistanceM(e.target.value)}
              className="w-full bg-ink rounded-xl px-4 py-2.5 text-white border border-zinc-700 focus:border-pace-green focus:outline-none text-sm mb-1"
            />
            <p className="text-xs text-zinc-600 mb-4">Defaults to the standard crease-to-crease pitch length (20.12m) — edit this if you marked different reference points.</p>
          </>
        )}

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={points.length !== 2 || saving || !!loadError}
            className="px-4 py-2.5 text-sm font-bold bg-pace-green text-black rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving ? "Saving…" : points.length !== 2 ? `Mark ${2 - points.length} more point${2 - points.length > 1 ? "s" : ""}` : "Save Calibration"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-medium text-zinc-400 border border-zinc-700 rounded-xl hover:text-white transition-colors cursor-pointer"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
