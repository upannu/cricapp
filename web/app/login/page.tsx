"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Role = "coach" | "player";

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("coach");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    router.push("/players");
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-3">
            <SpeedIcon />
            <span className="text-3xl font-bold tracking-widest text-white font-mono">
              PACE HQ
            </span>
          </div>
          <p className="text-zinc-400 text-sm tracking-wide">
            Fast Bowling Performance Platform
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">
            Sign in to your account
          </h2>

          {/* Role toggle */}
          <div className="flex bg-ink rounded-xl p-1 mb-6 gap-1">
            {(["coach", "player"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  role === r
                    ? "bg-pace-green text-black shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors"
                placeholder="your@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-ink rounded-xl px-4 py-3 text-white placeholder-zinc-600 border border-zinc-700 focus:border-pace-green focus:outline-none transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
            <div className="text-right">
              <Link
                href="/forgot-password"
                className="text-xs text-pace-green hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <button
              type="submit"
              className="w-full bg-pace-green text-black font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity text-sm uppercase tracking-wider cursor-pointer"
            >
              Sign In
            </button>
          </form>

          {/* SSO divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-700" />
            <span className="text-xs text-zinc-500 uppercase tracking-wider">
              or continue with
            </span>
            <div className="flex-1 h-px bg-zinc-700" />
          </div>

          {/* SSO buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="flex items-center justify-center gap-2 bg-white text-zinc-800 font-medium py-2.5 rounded-xl hover:bg-zinc-100 transition-colors text-sm cursor-pointer"
            >
              <GoogleIcon />
              Google
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 bg-white text-zinc-800 font-medium py-2.5 rounded-xl hover:bg-zinc-100 transition-colors text-sm cursor-pointer"
            >
              <AppleIcon />
              Apple
            </button>
          </div>

          {/* Sign up */}
          <p className="text-center text-zinc-400 text-sm mt-6">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-pace-green hover:underline font-medium"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function SpeedIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 26 L9 17 L15 19.5 L21 9 L27 13"
        stroke="#00D4AA"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="27" cy="13" r="2.5" fill="#FF6B2B" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg
      width="16"
      height="18"
      viewBox="0 0 16 18"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      <path d="M13.173 9.57c-.022-2.235 1.82-3.308 1.905-3.365-1.04-1.523-2.653-1.73-3.228-1.752-1.373-.14-2.69.813-3.386.813-.696 0-1.771-.795-2.913-.774-1.494.022-2.876.875-3.643 2.217-1.558 2.697-.399 6.694 1.117 8.882.742 1.065 1.625 2.26 2.78 2.217 1.117-.044 1.538-.718 2.89-.718 1.35 0 1.728.718 2.912.696 1.202-.022 1.96-1.086 2.691-2.157.852-1.238 1.2-2.44 1.222-2.503-.026-.012-2.338-.9-2.347-3.556zM11.02 3.064C11.6 2.355 12 1.367 11.876.38c-.837.044-1.86.567-2.46 1.253-.535.617-1.01 1.623-.876 2.578.934.066 1.894-.446 2.48-1.147z" />
    </svg>
  );
}
