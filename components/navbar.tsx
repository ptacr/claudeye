/** Top navigation bar with logo, app title, and theme toggle. */
"use client";

import React from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReachDevelopers } from "@/components/reach-developers";
import { RefreshButton } from "@/app/components/refresh-button";

export const Navbar: React.FC = () => {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Logo width={32} height={32} className="flex-shrink-0" />
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-foreground leading-tight">
                Claudeye
              </h1>
              <p className="text-xs text-muted-foreground leading-tight">
                visualize your Claude Code agent logs by{" "}
                <a
                  href="https://exosphere.host"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline transition-colors"
                >
                  exosphere.host
                </a>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton />
            <ReachDevelopers />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
};

