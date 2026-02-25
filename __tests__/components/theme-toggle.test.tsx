import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/theme-toggle";
import { renderWithProviders } from "../helpers/test-utils";

describe("ThemeToggle", () => {
  it("renders button with accessible label", () => {
    renderWithProviders(<ThemeToggle />);
    // Default theme is "dark", so label says "Switch to light mode"
    expect(screen.getByLabelText("Switch to light mode")).toBeInTheDocument();
  });

  it("toggles between light and dark themes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);

    // Start in dark mode → button says "Switch to light mode"
    const btn = screen.getByLabelText("Switch to light mode");
    await user.click(btn);

    // MutationObserver fires asynchronously in jsdom, so wait for the re-render
    await waitFor(() => {
      expect(screen.getByLabelText("Switch to dark mode")).toBeInTheDocument();
    });
  });
});
