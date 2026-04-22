"use client";

import dynamic from "next/dynamic";
import type React from "react";
import type ReactPlayerType from "react-player";

/**
 * Ported directly from LangoBee's youtube-reader-client — react-player
 * touches `window` on import, so it has to be dynamic-loaded with
 * `ssr: false`. `next/dynamic` also strips refs, so we wrap the default
 * export and accept a custom `playerRef` prop that gets assigned to the
 * underlying class instance. The ref is what lets us call `seekTo()`.
 */
export type ReactPlayerProgressState = {
  played: number;
  playedSeconds: number;
  loaded: number;
  loadedSeconds: number;
};

export type ReactPlayerRef = React.RefObject<ReactPlayerType | null>;

export const ReactPlayer = dynamic(
  async () => {
    const mod = await import("react-player");
    const RP = mod.default;
    return function ReactPlayerWithRef({
      playerRef,
      ...rest
    }: {
      playerRef?: ReactPlayerRef;
      url?: string;
      controls?: boolean;
      playing?: boolean;
      progressInterval?: number;
      style?: React.CSSProperties;
      width?: string | number;
      height?: string | number;
      onReady?: () => void;
      onPlay?: () => void;
      onPause?: () => void;
      onEnded?: () => void;
      onProgress?: (state: ReactPlayerProgressState) => void;
      onDuration?: (duration: number) => void;
      config?: Record<string, unknown>;
    }) {
      type RPProps = React.ComponentProps<typeof RP>;
      return <RP ref={playerRef as unknown as RPProps["ref"]} {...(rest as unknown as RPProps)} />;
    };
  },
  { ssr: false },
);
