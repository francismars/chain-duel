import { useCallback, useEffect, useRef, useState } from 'react';
import {
  capturePopDurationMs,
  capturingPlayerIntensity,
  captureHitFlashDurationMs,
  distributionSurgeDurationMs,
  satsCaptureBarIntensity,
  satsCaptureBarIntensityFromLabel,
  segmentGlowStyleFromColor,
  type CaptureFeedbackContext,
  type CaptureSide,
  type FfaPlayerIndex,
} from '@/features/game/hudCaptureFeedback';

export function useHudCaptureFeedback() {
  const timersRef = useRef<{
    p1?: number;
    p2?: number;
    row?: number;
    sats?: number;
    barClear?: number;
    ffaBarClear?: number;
    ffaSats?: number;
  }>({});
  const barHitGenerationRef = useRef(0);
  const ffaBarHitGenerationRef = useRef(0);

  const [captureP1Highlight, setCaptureP1Highlight] = useState(false);
  const [captureP2Highlight, setCaptureP2Highlight] = useState(false);
  const [captureRowFlash, setCaptureRowFlash] = useState<CaptureSide | null>(null);
  const [satsSurge, setSatsSurge] = useState<CaptureSide | null>(null);
  const [barCaptureHit, setBarCaptureHit] = useState<{
    side: CaptureSide;
    intensity: number;
    generation: number;
  } | null>(null);
  const [ffaBarCaptureHit, setFfaBarCaptureHit] = useState<{
    playerIndex: FfaPlayerIndex;
    intensity: number;
    generation: number;
    glow: 'light' | 'dark';
  } | null>(null);
  const [ffaSatsSurge, setFfaSatsSurge] = useState<{
    playerIndex: FfaPlayerIndex;
    intensity: number;
  } | null>(null);

  const triggerBarCaptureHit = useCallback(
    (side: CaptureSide, ctx: CaptureFeedbackContext) => {
      const intensity = satsCaptureBarIntensity(side, ctx);
      const flashMs = captureHitFlashDurationMs(intensity);
      barHitGenerationRef.current += 1;

      if (timersRef.current.barClear) {
        window.clearTimeout(timersRef.current.barClear);
      }

      setBarCaptureHit({
        side,
        intensity,
        generation: barHitGenerationRef.current,
      });
      timersRef.current.barClear = window.setTimeout(
        () => setBarCaptureHit(null),
        flashMs
      );
    },
    []
  );

  const triggerSatsSurge = useCallback(
    (side: CaptureSide, ctx: CaptureFeedbackContext) => {
      const intensity = satsCaptureBarIntensity(side, ctx);
      const surgeMs = distributionSurgeDurationMs(intensity);

      setSatsSurge(side);
      if (timersRef.current.sats) window.clearTimeout(timersRef.current.sats);
      timersRef.current.sats = window.setTimeout(
        () => setSatsSurge(null),
        surgeMs
      );
    },
    []
  );

  /** Capture % tier label changed — pop the percentage and flash the row. */
  const handleCaptureTierChanged = useCallback(
    (side: CaptureSide, ctx: CaptureFeedbackContext) => {
      const intensity = capturingPlayerIntensity(side, ctx);
      const popMs = capturePopDurationMs(intensity);

      setCaptureRowFlash(side);
      if (timersRef.current.row) window.clearTimeout(timersRef.current.row);
      timersRef.current.row = window.setTimeout(
        () => setCaptureRowFlash(null),
        popMs
      );

      if (side === 'P1') {
        setCaptureP1Highlight(true);
        if (timersRef.current.p1) window.clearTimeout(timersRef.current.p1);
        timersRef.current.p1 = window.setTimeout(
          () => setCaptureP1Highlight(false),
          popMs
        );
      } else {
        setCaptureP2Highlight(true);
        if (timersRef.current.p2) window.clearTimeout(timersRef.current.p2);
        timersRef.current.p2 = window.setTimeout(
          () => setCaptureP2Highlight(false),
          popMs
        );
      }
    },
    []
  );

  /** Sats captured from a coinbase — bar slide effects and sats counter surge. */
  const handleSatsCaptured = useCallback(
    (side: CaptureSide, ctx: CaptureFeedbackContext) => {
      triggerBarCaptureHit(side, ctx);
      triggerSatsSurge(side, ctx);
    },
    [triggerBarCaptureHit, triggerSatsSurge]
  );

  const handleFfaSatsCaptured = useCallback(
    (playerIndex: FfaPlayerIndex, captureLabel: string, color: string) => {
      const intensity = satsCaptureBarIntensityFromLabel(captureLabel);
      const flashMs = captureHitFlashDurationMs(intensity);
      const surgeMs = distributionSurgeDurationMs(intensity);
      ffaBarHitGenerationRef.current += 1;

      if (timersRef.current.ffaBarClear) {
        window.clearTimeout(timersRef.current.ffaBarClear);
      }
      setFfaBarCaptureHit({
        playerIndex,
        intensity,
        generation: ffaBarHitGenerationRef.current,
        glow: segmentGlowStyleFromColor(color),
      });
      timersRef.current.ffaBarClear = window.setTimeout(
        () => setFfaBarCaptureHit(null),
        flashMs
      );

      setFfaSatsSurge({ playerIndex, intensity });
      if (timersRef.current.ffaSats) {
        window.clearTimeout(timersRef.current.ffaSats);
      }
      timersRef.current.ffaSats = window.setTimeout(
        () => setFfaSatsSurge(null),
        surgeMs
      );
    },
    []
  );

  useEffect(
    () => () => {
      if (timersRef.current.p1) window.clearTimeout(timersRef.current.p1);
      if (timersRef.current.p2) window.clearTimeout(timersRef.current.p2);
      if (timersRef.current.row) window.clearTimeout(timersRef.current.row);
      if (timersRef.current.sats) window.clearTimeout(timersRef.current.sats);
      if (timersRef.current.barClear) {
        window.clearTimeout(timersRef.current.barClear);
      }
      if (timersRef.current.ffaBarClear) {
        window.clearTimeout(timersRef.current.ffaBarClear);
      }
      if (timersRef.current.ffaSats) {
        window.clearTimeout(timersRef.current.ffaSats);
      }
    },
    []
  );

  return {
    captureP1Highlight,
    captureP2Highlight,
    captureRowFlash,
    satsSurge,
    barCaptureHit,
    ffaBarCaptureHit,
    ffaSatsSurge,
    handleCaptureTierChanged,
    handleSatsCaptured,
    handleFfaSatsCaptured,
  };
}
