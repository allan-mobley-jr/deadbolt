"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUIStore } from "@/stores/useUIStore";
import { useGameStore } from "@/stores/useGameStore";
import { resetSessionStores } from "@/stores/resetSessionStores";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Pause menu overlay — triggered by ESC key during gameplay.
 *
 * Provides Resume, Settings, Controls, and Abandon Run options.
 * Abandon Run shows a confirmation dialog before navigating to /.
 */
export function PauseMenu() {
  const router = useRouter();
  const activeMenu = useUIStore((s) => s.activeMenu);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleResume = useCallback(() => {
    useUIStore.getState().closeMenu();
    useGameStore.getState().setPaused(false);
  }, []);

  const handleSettings = useCallback(() => {
    useUIStore.getState().openMenu("settings");
  }, []);

  const handleControls = useCallback(() => {
    useUIStore.getState().pushOverlay("controls");
  }, []);

  const handleAbandonConfirm = useCallback(() => {
    try {
      resetSessionStores();
      router.push("/");
    } catch (err) {
      console.error("[PauseMenu] Failed to abandon run:", err);
      window.location.href = "/";
    }
  }, [router]);

  if (activeMenu !== "pause") return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pause menu"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 animate-in fade-in duration-300"
      data-testid="pause-menu"
    >
      <Card className="w-full max-w-xs bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-bold tracking-widest text-foreground">
            PAUSED
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          <Button
            variant="default"
            size="lg"
            className="w-full"
            onClick={handleResume}
            autoFocus
            data-testid="pause-resume-btn"
          >
            Resume
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={handleSettings}
            data-testid="pause-settings-btn"
          >
            Settings
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={handleControls}
            data-testid="pause-controls-btn"
          >
            Controls
          </Button>
          <Button
            variant="destructive"
            size="lg"
            className="w-full"
            onClick={() => {
              setConfirmOpen(true);
              useUIStore.getState().pushOverlay("confirm-abandon");
            }}
            data-testid="pause-abandon-btn"
          >
            Abandon Run
          </Button>
        </CardContent>
      </Card>

      {/* Abandon Run confirmation */}
      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            useUIStore.getState().popOverlay("confirm-abandon");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandon Run?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress will be lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="abandon-cancel-btn">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleAbandonConfirm}
              data-testid="abandon-confirm-btn"
            >
              Abandon
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
