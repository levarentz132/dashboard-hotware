import { useForm } from "react-hook-form";
import FormCamera from "./form-camera";
import { CameraForm, cameraFormSchema } from "@/validations/camera-validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { INITIAL_CAMERA } from "@/constants/camera-constant";
import { useAddCamerasDialog } from "./useAddCamerasDialog";
import { ICamera } from "@/types/Device";

export default function DialogCreateCamera({ refetch }: { refetch: () => void }) {
  const { addCamera, isLoading } = useAddCamerasDialog();

  const form = useForm<CameraForm>({
    resolver: zodResolver(cameraFormSchema),
    defaultValues: INITIAL_CAMERA,
  });

  const onSubmitHandler = async (data: CameraForm) => {
    const payload: ICamera = {
      ...data,
      id: "",
      group: {
        id: "",
        name: "",
      },
    };

    try {
      await addCamera(payload);

      // JIKA SUKSES
      form.reset(); // Reset form
      refetch(); // Tutup dialog
    } catch (e) {
      // Error sudah ditangani di hook (misalnya menampilkan alert/console.error)
      alert("Gagal submit di form");
      console.error("Gagal submit di form: ", e);
    }
  };

  return <FormCamera form={form} onSubmit={form.handleSubmit(onSubmitHandler)} isLoading={isLoading} />;
}
