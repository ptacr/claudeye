"use client";

import React, { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { login } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import Link from "next/link";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const from = searchParams.get("from") ?? "/";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("redirectTo", from);

    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else if (result?.redirectTo) {
      router.push(result.redirectTo);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-2 mb-6">
          <Link href="/"><Logo width={36} height={36} /></Link>
          <h2 className="text-xl font-semibold text-foreground">Sign in to Claudeye</h2>
          <p className="text-sm text-muted-foreground">Enter your credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-sm font-medium text-foreground">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              autoFocus
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              placeholder="admin"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-500/10 rounded-md px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
