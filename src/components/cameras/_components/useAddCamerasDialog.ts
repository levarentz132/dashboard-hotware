import nxAPI from "@/lib/nxapi";
import { ICamera } from "@/types/Device";
import { useState } from "react";

interface IUseAddCamerasDialog {
  addCamera: (payload: ICamera) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

export const useAddCamerasDialog = (): IUseAddCamerasDialog => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const addCamera = async (payload: ICamera): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await nxAPI.addCamera(payload);
      if (result) {
        alert("Camera successfully added!");
      }
    } catch (error) {
      console.error("Failed to add camera = ", error);
    } finally {
      // 3. Matikan status loading setelah proses selesai (sukses atau gagal)
      setIsLoading(false);
    }
  };

  return { addCamera, isLoading, error };
};
