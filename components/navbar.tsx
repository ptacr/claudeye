/** Top navigation bar with logo, app title, and theme toggle. */
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FolderOpen, LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReachDevelopers } from "@/components/reach-developers";
import { RefreshButton } from "@/app/components/refresh-button";
import { logout } from "@/app/actions/auth";

const NAV_LINKS = [
  { href: "/", label: "Projects", icon: FolderOpen },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [authActive] = useState(
    () => typeof document !== "undefined" && document.cookie.includes("claudeye_auth"),
  );

  async function handleLogout() {
    const result = await logout();
    router.push(result.redirectTo);
  }

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <a
              href="https://claudeye.exosphere.host"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <Logo width={28} height={28} className="flex-shrink-0" />
              <h1 className="text-lg font-semibold text-foreground leading-tight tracking-tight">
                Claudeye
              </h1>
            </a>

            <div className="w-px h-8 bg-border ml-2" />

            <nav className="flex items-center h-16">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => {
                const active = href === "/"
                  ? pathname === "/" || pathname.startsWith("/project")
                  : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`relative flex items-center gap-1.5 px-3 h-full text-sm transition-colors ${
                      active
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? "text-primary" : ""}`} />
                    {label}
                    <span
                      className={`absolute inset-x-1 bottom-0 h-[2px] rounded-full transition-all ${
                        active
                          ? "bg-primary"
                          : "bg-transparent group-hover:bg-muted"
                      }`}
                    />
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <RefreshButton />
            <div className="w-px h-6 bg-border mx-1" />
            <ReachDevelopers />
            <ThemeToggle />
            {authActive && (
              <>
                <div className="w-px h-6 bg-border mx-1" />
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
