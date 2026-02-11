/**
 * Root layout — wraps every page with the theme provider and navbar.
 *
 * An inline `<script>` in `<head>` reads the user's theme preference
 * from `localStorage` (or falls back to `prefers-color-scheme`) and
 * applies the `light`/`dark` class to `<html>` *before* first paint,
 * preventing a flash of the wrong theme.
 */
import type { Metadata } from "next";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Navbar } from "@/components/navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Monitor - Agent SDK Monitor by Exosphere",
  description: "Tool to monitor Claude Agent SDK by exosphere.host",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // Ensure we don't add duplicate classes
                  document.documentElement.classList.remove('light', 'dark');
                  
                  var theme = localStorage.getItem('theme');
                  if (theme && (theme === 'light' || theme === 'dark')) {
                    document.documentElement.classList.add(theme);
                  } else {
                    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    document.documentElement.classList.add(prefersDark ? 'dark' : 'light');
                  }
                } catch (e) {
                  // Fallback to dark theme if there's any error
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              #__loading {
                position: fixed; inset: 0; z-index: 9999;
                display: flex; align-items: center; justify-content: center;
                background: var(--background, #031035);
                color: var(--foreground, #f8fafc);
                font-family: system-ui, sans-serif;
                font-size: 1rem;
                transition: opacity 0.15s;
              }
              body > *:not(#__loading) { opacity: 0; }
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <div id="__loading">Loading…</div>
        <ThemeProvider>
          <Navbar />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
