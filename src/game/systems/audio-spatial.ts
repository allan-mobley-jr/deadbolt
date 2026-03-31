/**
 * Pure math utilities for spatial audio calculations.
 *
 * Computes distance-based volume attenuation and stereo panning
 * from source and listener positions. No Phaser or framework
 * imports — purely geometric and highly testable.
 */

import { AUDIO } from "./audio-constants";

// ---------------------------------------------------------------------------
// Volume attenuation (inverse-distance model)
// ---------------------------------------------------------------------------

/**
 * Compute distance-based volume multiplier using an inverse-distance model.
 *
 * Returns 1.0 when the source is within `refDistance`, drops off with the
 * configured rolloff exponent, and reaches 0.0 at or beyond `maxRange`.
 *
 * @param sourceX Source X in world pixels.
 * @param sourceY Source Y in world pixels.
 * @param listenerX Listener X in world pixels.
 * @param listenerY Listener Y in world pixels.
 * @param maxRange Pixels beyond which volume is 0.
 * @param refDistance Pixels at which volume is 1.0.
 * @param rolloff Inverse-distance rolloff exponent.
 * @returns Volume multiplier in [0, 1].
 */
export function computeSpatialVolume(
  sourceX: number,
  sourceY: number,
  listenerX: number,
  listenerY: number,
  maxRange: number = AUDIO.SPATIAL_MAX_RANGE,
  refDistance: number = AUDIO.SPATIAL_REF_DISTANCE,
  rolloff: number = AUDIO.SPATIAL_ROLLOFF,
): number {
  const dx = sourceX - listenerX;
  const dy = sourceY - listenerY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance <= refDistance) return 1.0;
  if (distance >= maxRange) return 0.0;

  // Inverse-distance attenuation: ref / distance, raised to rolloff power
  const attenuation = Math.pow(refDistance / distance, rolloff);
  return Math.max(0, Math.min(1, attenuation));
}

// ---------------------------------------------------------------------------
// Stereo panning
// ---------------------------------------------------------------------------

/**
 * Compute stereo pan based on the horizontal offset from listener to source.
 *
 * Returns -1.0 (full left) to +1.0 (full right). The pan is normalised
 * by the spatial max range so sources at the edge of audibility are fully
 * panned, and nearby sources are close to center.
 *
 * @returns Pan value in [-1, 1].
 */
export function computeStereoPan(
  sourceX: number,
  sourceY: number,
  listenerX: number,
  listenerY: number,
  maxRange: number = AUDIO.SPATIAL_MAX_RANGE,
): number {
  const dx = sourceX - listenerX;
  const raw = dx / maxRange;
  return Math.max(-AUDIO.PAN_MAX, Math.min(AUDIO.PAN_MAX, raw));
}

// ---------------------------------------------------------------------------
// Effective volume
// ---------------------------------------------------------------------------

/**
 * Combine spatial attenuation with user volume settings.
 *
 * @param spatialVolume Volume from distance attenuation (0-1).
 * @param masterVolume User's master volume setting (0-1).
 * @param categoryVolume User's SFX or music volume setting (0-1).
 * @returns Effective volume in [0, 1].
 */
export function computeEffectiveVolume(
  spatialVolume: number,
  masterVolume: number,
  categoryVolume: number,
): number {
  return spatialVolume * masterVolume * categoryVolume;
}
