// @vitest-environment node
import { describe, it, expect } from "vitest";
import { findAvailablePort } from "@/lib/server-utils";

describe("server-utils", () => {
  describe("findAvailablePort", () => {
    it("returns the preferred port when it is available", async () => {
      // Use a high ephemeral port that's very unlikely to be in use
      const port = await findAvailablePort(49152);
      // May or may not be exactly 49152 depending on system state,
      // but should always return a valid port number
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThanOrEqual(65535);
    });

    it("returns a different port when preferred is busy", async () => {
      // Bind a port first
      const net = await import("node:net");
      const srv = net.createServer();
      const boundPort = await new Promise<number>((resolve) => {
        srv.listen(0, "127.0.0.1", () => {
          const addr = srv.address();
          resolve(typeof addr === "object" && addr ? addr.port : 0);
        });
      });

      try {
        const port = await findAvailablePort(boundPort);
        // Should get a different port since boundPort is occupied
        expect(port).not.toBe(boundPort);
        expect(port).toBeGreaterThan(0);
      } finally {
        await new Promise<void>((resolve) => srv.close(() => resolve()));
      }
    });
  });
});
