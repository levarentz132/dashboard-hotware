/**
 * TanStack Query key factory — keeps cache keys consistent across the app.
 */

export const queryKeys = {
  cloudSystems: {
    all: ["cloud-systems"] as const,
  },
} as const;
