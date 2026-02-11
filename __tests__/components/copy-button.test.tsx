import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyButton } from "@/app/components/copy-button";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Copy: (props: any) => <span data-testid="copy-icon" {...props} />,
  Check: (props: any) => <span data-testid="check-icon" {...props} />,
}));

describe("CopyButton", () => {
  beforeEach(() => {
    // jsdom doesn't provide navigator.clipboard by default
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it("renders copy icon by default", () => {
    render(<CopyButton text="hello" />);
    expect(screen.getByTestId("copy-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("check-icon")).not.toBeInTheDocument();
  });

  it("copies text to clipboard on click and shows check icon", async () => {
    const user = userEvent.setup();
    render(<CopyButton text="session-id-123" />);

    expect(screen.getByTestId("copy-icon")).toBeInTheDocument();

    await user.click(screen.getByTitle("Copy to clipboard"));

    await waitFor(() => {
      expect(screen.getByTestId("check-icon")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("copy-icon")).not.toBeInTheDocument();
  });

  it("reverts to copy icon after 2 seconds", async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(<CopyButton text="test" />);
    await user.click(screen.getByTitle("Copy to clipboard"));

    expect(screen.getByTestId("check-icon")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByTestId("copy-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("check-icon")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("applies custom className", () => {
    render(<CopyButton text="test" className="custom-class" />);
    const button = screen.getByTitle("Copy to clipboard");
    expect(button.className).toContain("custom-class");
  });
});
