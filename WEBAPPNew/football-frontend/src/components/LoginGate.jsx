import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { GOOGLE_CLIENT_ID } from "../config/apiBase";
import logo from "../assets/FPL_analytics_logo.png";

export default function LoginGate({
  authBusy,
  authError,
  onGuestLogin,
  onGoogleCredential,
}) {
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const initializeGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          if (!response?.credential) return;
          setGoogleLoading(true);
          await onGoogleCredential(response.credential);
          setGoogleLoading(false);
        },
      });
      googleBtnRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "signin_with",
        width: 320,
      });
      setGoogleReady(true);
    };

    if (window.google?.accounts?.id) {
      initializeGoogle();
      return;
    }

    const existing = document.getElementById("google-gsi-script");
    if (existing) {
      existing.addEventListener("load", initializeGoogle, { once: true });
      return () => existing.removeEventListener("load", initializeGoogle);
    }

    const script = document.createElement("script");
    script.id = "google-gsi-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogle;
    document.head.appendChild(script);
  }, [onGoogleCredential]);

  return (
    <div className="min-h-screen bg-app-gradient text-slate-800">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10">
        <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-8">
          <div className="space-y-5 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              <ShieldCheck size={14} />
              Secure Session
            </div>

            <div className="flex items-center justify-center gap-3">
              <img
                src={logo}
                alt="FPL Analytics"
                className="h-12 w-12 rounded-full border border-sky-200 object-contain"
              />
              <div className="text-left leading-tight">
                <p className="text-xl font-extrabold text-slate-900">FPL Analytics</p>
                <p className="text-xs text-slate-500">Classic Login</p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Sign in with Google to sync recent Team IDs across devices, or continue without login.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex justify-center">
              {GOOGLE_CLIENT_ID ? (
                <div
                  ref={googleBtnRef}
                  className={["min-h-[44px]", googleLoading ? "pointer-events-none opacity-70" : ""].join(" ")}
                />
              ) : (
                <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Google login is not configured yet. Set <code>VITE_GOOGLE_CLIENT_ID</code>.
                </div>
              )}
            </div>

            <div className="relative py-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span className="bg-white px-2">or</span>
              <div className="absolute left-0 top-1/2 -z-10 h-px w-full -translate-y-1/2 bg-slate-200" />
            </div>

            <button
              type="button"
              onClick={onGuestLogin}
              disabled={authBusy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Lock size={16} />
              {authBusy ? "Starting session..." : "Continue Without Login"}
              <ArrowRight size={16} />
            </button>
          </div>

          {!googleReady && GOOGLE_CLIENT_ID ? (
            <p className="mt-3 text-center text-xs text-slate-400">Preparing Google sign-in...</p>
          ) : null}

          {authError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {authError}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
