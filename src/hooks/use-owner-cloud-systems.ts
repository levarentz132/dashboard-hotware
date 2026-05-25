"use client";

import { useEffect, useMemo, useState } from "react";
import { useCloudSystemsWithOnline, type CloudSystemWithOnline } from "@/hooks/use-cloud-systems-with-online";

/**
 * Cloud systems filtered to owner role when available (Dashboard system picker).
 */
export function useOwnerCloudSystems() {
  const { cloudSystems: allSystems, loadingCloud, refetchCloudSystems } = useCloudSystemsWithOnline();
  const [selectedSystemId, setSelectedSystemId] = useState("");

  const cloudSystems = useMemo(() => {
    const ownerSystems = allSystems.filter((s) => s.accessRole === "owner");
    return ownerSystems.length > 0 ? ownerSystems : allSystems;
  }, [allSystems]);

  useEffect(() => {
    if (cloudSystems.length > 0 && !selectedSystemId) {
      const firstOnline = cloudSystems.find((s) => s.isOnline) || cloudSystems[0];
      setSelectedSystemId(firstOnline.id);
    }
  }, [cloudSystems, selectedSystemId]);

  return {
    cloudSystems,
    selectedSystemId,
    setSelectedSystemId,
    loadingCloud,
    refetchCloudSystems,
  };
}

export type { CloudSystemWithOnline };
