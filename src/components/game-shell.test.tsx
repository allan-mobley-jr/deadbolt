import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Hoisted mocks — available inside vi.mock() factories
// ---------------------------------------------------------------------------

const { mockContainerMount } = vi.hoisted(() => ({
  mockContainerMount: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks — isolate GameShell from all child components
// ---------------------------------------------------------------------------

// Mock next/dynamic: returns a stub component that tracks mount cycles
// via useEffect so we can verify runKey-driven remounting.
vi.mock("next/dynamic", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- vi.mock factories are hoisted before ESM imports; require is the only option
  const { useEffect, createElement } = require("react");
  return {
    __esModule: true,
    default: () => {
      return function MockGameContainer() {
        useEffect(() => {
          mockContainerMount();
        }, []);
        return createElement("div", { "data-testid": "game-container" });
      };
    },
  };
});

vi.mock("@/components/hud/hud-overlay", () => ({
  HudOverlay: () => null,
}));

vi.mock("@/components/interaction-prompt", () => ({
  InteractionPrompt: () => null,
}));

vi.mock("@/components/death-screen", () => ({
  DeathScreen: () => null,
}));

vi.mock("@/components/pause-menu", () => ({
  PauseMenu: () => null,
}));

vi.mock("@/components/settings-dialog", () => ({
  SettingsDialog: () => null,
}));

vi.mock("@/components/controls-reference", () => ({
  ControlsReference: () => null,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are declared)
// ---------------------------------------------------------------------------

import GameShell from "@/components/game-shell";
import { useUIStore } from "@/stores/useUIStore";
import { useGameStore } from "@/stores/useGameStore";
import { usePersistenceStore } from "@/stores/usePersistenceStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fire an ESC keydown event on window, matching the component's listener. */
function pressEsc(options?: { repeat?: boolean }) {
  fireEvent.keyDown(window, {
    key: "Escape",
    code: "Escape",
    repeat: options?.repeat ?? false,
  });
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  useUIStore.getState().reset();
  useGameStore.getState().reset();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GameShell", () => {
  describe("lifecycle", () => {
    it("calls loadFromDB on mount", () => {
      const spy = vi
        .spyOn(usePersistenceStore.getState(), "loadFromDB")
        .mockResolvedValue(undefined);

      render(<GameShell />);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("remounts GameContainer when runKey changes", () => {
      render(<GameShell />);
      const mountsAfterRender = mockContainerMount.mock.calls.length;
      expect(mountsAfterRender).toBeGreaterThanOrEqual(1);

      act(() => {
        useGameStore.getState().incrementRunKey();
      });

      // Key change triggers unmount + remount, producing additional mount calls
      expect(mockContainerMount.mock.calls.length).toBeGreaterThan(
        mountsAfterRender,
      );
    });
  });

  describe("ESC key state machine", () => {
    it("ignores key repeat events", () => {
      render(<GameShell />);

      pressEsc({ repeat: true });

      expect(useUIStore.getState().activeMenu).toBe("none");
      expect(useGameStore.getState().paused).toBe(false);
    });

    it("dismisses confirm-abandon overlay when ESC pressed", () => {
      useUIStore.setState({
        activeMenu: "pause" as const,
        overlays: ["confirm-abandon"],
      });

      render(<GameShell />);
      pressEsc();

      expect(useUIStore.getState().overlays).not.toContain("confirm-abandon");
      // Must stay on pause menu — early return prevents further state changes
      expect(useUIStore.getState().activeMenu).toBe("pause");
    });

    it("closes controls reference when ESC pressed", () => {
      useUIStore.setState({
        activeMenu: "pause" as const,
        overlays: ["controls"],
      });

      render(<GameShell />);
      pressEsc();

      expect(useUIStore.getState().overlays).not.toContain("controls");
      // Must stay on pause menu — early return prevents further state changes
      expect(useUIStore.getState().activeMenu).toBe("pause");
    });

    it("returns to pause menu (not gameplay) when ESC pressed in settings", () => {
      useUIStore.setState({ activeMenu: "settings" as const });

      render(<GameShell />);
      pressEsc();

      expect(useUIStore.getState().activeMenu).toBe("pause");
    });

    it("resumes game when ESC pressed on pause menu", () => {
      useUIStore.setState({ activeMenu: "pause" as const });
      useGameStore.setState({ paused: true });

      render(<GameShell />);
      pressEsc();

      expect(useUIStore.getState().activeMenu).toBe("none");
      expect(useGameStore.getState().paused).toBe(false);
    });

    it("does not dismiss death screen on ESC", () => {
      useUIStore.setState({ activeMenu: "death" as const });

      render(<GameShell />);
      pressEsc();

      expect(useUIStore.getState().activeMenu).toBe("death");
    });

    it("opens pause menu when ESC pressed during gameplay", () => {
      render(<GameShell />);

      pressEsc();

      expect(useUIStore.getState().activeMenu).toBe("pause");
      expect(useGameStore.getState().paused).toBe(true);
    });
  });
});
