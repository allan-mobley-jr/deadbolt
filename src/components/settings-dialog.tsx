"use client";

import { useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useUIStore } from "@/stores/useUIStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { GraphicsQuality } from "@/lib/settings";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VolumeSlider({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-zinc-300">{label}</span>
        <span className="font-mono text-xs text-zinc-400">
          {Math.round(value * 100)}%
        </span>
      </div>
      <Slider
        aria-label={label}
        value={[value * 100]}
        min={0}
        max={100}
        onValueChange={(v) => {
          const arr = Array.isArray(v) ? v : [v];
          onChange(arr[0] / 100);
        }}
        data-testid={testId}
      />
    </div>
  );
}

function SettingToggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-300">{label}</span>
      <Switch
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
        data-testid={testId}
      />
    </div>
  );
}

function QualitySelector({
  value,
  onChange,
}: {
  value: GraphicsQuality;
  onChange: (q: GraphicsQuality) => void;
}) {
  const options: GraphicsQuality[] = ["low", "medium", "high"];

  return (
    <div className="space-y-1.5">
      <span className="text-sm text-zinc-300">Graphics Quality</span>
      <div className="flex gap-1" data-testid="settings-quality">
        {options.map((q) => (
          <Button
            key={q}
            variant={value === q ? "default" : "outline"}
            size="sm"
            className="flex-1 capitalize"
            onClick={() => onChange(q)}
          >
            {q}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Settings screen — shown when "settings" is the active menu.
 *
 * Provides volume sliders, display toggles, and graphics quality selector.
 * All changes are applied immediately and persisted to localStorage.
 */
export function SettingsDialog() {
  const activeMenu = useUIStore((s) => s.activeMenu);

  const masterVolume = useSettingsStore((s) => s.masterVolume);
  const sfxVolume = useSettingsStore((s) => s.sfxVolume);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const screenShake = useSettingsStore((s) => s.screenShake);
  const showFps = useSettingsStore((s) => s.showFps);
  const graphicsQuality = useSettingsStore((s) => s.graphicsQuality);
  const colorBlindMode = useSettingsStore((s) => s.colorBlindMode);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const highContrast = useSettingsStore((s) => s.highContrast);

  const handleBack = useCallback(() => {
    useUIStore.getState().openMenu("pause");
  }, []);

  if (activeMenu !== "settings") return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 animate-in fade-in duration-300"
      data-testid="settings-dialog"
    >
      <Card className="w-full max-w-sm bg-card/95 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              data-testid="settings-back-btn"
              aria-label="Back to pause menu"
            >
              &larr;
            </Button>
            <CardTitle className="text-lg font-bold">Settings</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Audio section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Audio
            </h3>
            <VolumeSlider
              label="Master Volume"
              value={masterVolume}
              onChange={(v) => useSettingsStore.getState().setMasterVolume(v)}
              testId="settings-master-volume"
            />
            <VolumeSlider
              label="SFX Volume"
              value={sfxVolume}
              onChange={(v) => useSettingsStore.getState().setSfxVolume(v)}
              testId="settings-sfx-volume"
            />
            <VolumeSlider
              label="Music Volume"
              value={musicVolume}
              onChange={(v) => useSettingsStore.getState().setMusicVolume(v)}
              testId="settings-music-volume"
            />
          </div>

          {/* Display section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Display
            </h3>
            <SettingToggle
              label="Screen Shake"
              checked={screenShake}
              onChange={(v) => useSettingsStore.getState().setScreenShake(v)}
              testId="settings-screen-shake"
            />
            <SettingToggle
              label="FPS Counter"
              checked={showFps}
              onChange={(v) => useSettingsStore.getState().setShowFps(v)}
              testId="settings-fps-counter"
            />
          </div>

          {/* Graphics section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Graphics
            </h3>
            <QualitySelector
              value={graphicsQuality}
              onChange={(q) => useSettingsStore.getState().setGraphicsQuality(q)}
            />
          </div>

          {/* Accessibility section */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Accessibility
            </h3>
            <SettingToggle
              label="Color-Blind Mode"
              checked={colorBlindMode}
              onChange={(v) => useSettingsStore.getState().setColorBlindMode(v)}
              testId="settings-color-blind"
            />
            <SettingToggle
              label="Reduced Motion"
              checked={reducedMotion}
              onChange={(v) => useSettingsStore.getState().setReducedMotion(v)}
              testId="settings-reduced-motion"
            />
            <SettingToggle
              label="High Contrast"
              checked={highContrast}
              onChange={(v) => useSettingsStore.getState().setHighContrast(v)}
              testId="settings-high-contrast"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
