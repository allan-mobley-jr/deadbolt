import { ImageResponse } from "next/og";

export const alt = "Deadbolt — Zombie survival base builder";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Generates the Open Graph image for social sharing.
 *
 * Uses the Next.js file convention — this file auto-generates the
 * correct <meta property="og:image"> tags at build time. The image
 * is statically generated for all routes under src/app/.
 *
 * Design: dark background with game title, tagline, and feature pills.
 * Text-only since no real game sprites exist yet.
 */
export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0a0f",
          backgroundImage:
            "radial-gradient(circle at 50% 50%, #1a1a2e 0%, #0a0a0f 70%)",
          fontFamily: "system-ui, sans-serif",
          color: "#ffffff",
          padding: "60px",
        }}
      >
        {/* Border accent */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #ef4444 0%, #f97316 50%, #4ade80 100%)",
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: "96px",
            fontWeight: 800,
            letterSpacing: "-2px",
            marginBottom: "16px",
            display: "flex",
          }}
        >
          DEADBOLT
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "32px",
            color: "#a1a1aa",
            marginBottom: "48px",
            display: "flex",
          }}
        >
          Zombie survival base builder
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: "16px",
          }}
        >
          {["Physics-driven barricading", "Permadeath roguelike", "15-minute runs"].map(
            (feature) => (
              <div
                key={feature}
                style={{
                  fontSize: "20px",
                  padding: "10px 24px",
                  borderRadius: "999px",
                  border: "1px solid #3f3f46",
                  color: "#d4d4d8",
                  display: "flex",
                }}
              >
                {feature}
              </div>
            ),
          )}
        </div>

        {/* Bottom tagline */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            fontSize: "18px",
            color: "#52525b",
            display: "flex",
          }}
        >
          Play free in your browser — no download required
        </div>
      </div>
    ),
    { ...size },
  );
}
