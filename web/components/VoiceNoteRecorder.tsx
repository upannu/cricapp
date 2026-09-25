"use client";

import { useState, useRef } from "react";
import { insertVoiceNote } from "@/lib/db";
import { createClient } from "@/lib/supabase";
import type { VoiceNote } from "@/lib/types";

// The Web Speech API has no standard TS lib typing — declare the minimal shape used here.
interface SpeechRecognitionAlternative { transcript: string }
interface SpeechRecognitionResultLike { isFinal: boolean; 0: SpeechRecognitionAlternative; length: number }
interface SpeechRecognitionResultListLike { length: number; [index: number]: SpeechRecognitionResultLike }
interface SpeechRecognitionEventLike { resultIndex: number; results: SpeechRecognitionResultListLike }
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface Props {
  sessionId?: string;
  playerId: string;
  onClose: () => void;
  onSaved: (note: VoiceNote) => void;
}

export function VoiceNoteRecorder({ sessionId, playerId, onClose, onSaved }: Props) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);

  const speechCtor = typeof window !== "undefined" ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : undefined;

  async function startRecording() {
    setError("");
    setTranscript("");
    setAudioBlob(null);
    setAudioUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = mr;
      startTimeRef.current = Date.now();
      mr.start();
      setRecording(true);

      if (speechCtor) {
        const recognition = new speechCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        let finalText = "";
        recognition.onresult = (event) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) finalText += res[0].transcript + " ";
            else interim += res[0].transcript;
          }
          setTranscript((finalText + interim).trim());
        };
        recognition.onerror = () => {}; // non-fatal — recording continues either way
        recognitionRef.current = recognition;
        recognition.start();
      }
    } catch (err) {
      setError((err as { message?: string })?.message ?? "Couldn't access the microphone.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    recognitionRef.current?.stop();
    setDurationSec(Math.round((Date.now() - startTimeRef.current) / 1000));
    setRecording(false);
  }

  async function handleSave() {
    if (!audioBlob) return;
    setSaving(true);
    setError("");
    try {
      const id = `vn_${Date.now()}`;
      const ext = audioBlob.type.includes("mp4") ? "m4a" : "webm";
      const path = `${playerId}/voice-notes/${id}.${ext}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("session-videos")
        .upload(path, audioBlob, { contentType: audioBlob.type || "audio/webm" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("session-videos").getPublicUrl(path);

      await insertVoiceNote({
        id, session_id: sessionId ?? null, player_id: playerId,
        audio_url: data.publicUrl, transcript, duration_sec: durationSec,
      });
      onSaved({ id, sessionId, playerId, audioUrl: data.publicUrl, transcript, durationSec });
    } catch (err) {
      setError((err as { message?: string })?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-hp-surface p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-widest text-hp-cg">Voice Note</h2>
          <button type="button" onClick={onClose} className="text-hp-paper/45 hover:text-hp-paper text-xl leading-none cursor-pointer">×</button>
        </div>
        <p className="text-hp-paper/45 text-sm mb-4">
          {speechCtor ? "Recorded and transcribed live — edit the text after if needed." : "Recorded as audio — type up a summary below (live transcription isn't supported in this browser)."}
        </p>

        <div className="flex flex-col items-center gap-3 mb-4">
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={saving}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              recording ? "bg-red-500 animate-pulse" : "bg-hp-cg"
            }`}
          >
            <span className="text-hp-paper font-bold text-xs">{recording ? "STOP" : "REC"}</span>
          </button>
          <p className="text-xs text-hp-paper/45">{recording ? "Recording…" : audioBlob ? `Recorded — ${durationSec}s` : "Tap to record"}</p>
        </div>

        {audioUrl && (
          <audio src={audioUrl} controls className="w-full mb-4" />
        )}

        <label className="block text-xs font-mono font-semibold text-hp-paper/52 uppercase tracking-widest mb-1.5">Transcript</label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={speechCtor ? "Transcript will appear here as you speak…" : "Type up what you said…"}
          className="w-full bg-hp-ink px-4 py-2.5 text-hp-paper placeholder-hp-paper/30 border border-white/12 focus:border-hp-cg focus:outline-none text-sm resize-none h-24 mb-4"
        />

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!audioBlob || saving || recording}
            className="px-4 py-2.5 text-sm font-bold bg-hp-cg text-hp-paper hover:bg-hp-cg/90 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving…" : "Save Voice Note"}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-hp-paper/45 border border-white/12 hover:text-hp-paper transition-colors cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
