import FormInput from "@/components/common/form-input";
import FormSelect from "@/components/common/form-select";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { FormEvent } from "react";
import { FieldValues, Path, UseFormReturn } from "react-hook-form";

export default function FormCamera<T extends FieldValues>({
  form,
  onSubmit,
  isLoading,
  selectItemServers,
  type,
}: {
  form: UseFormReturn<T>;
  onSubmit: (data: FormEvent) => void;
  isLoading: boolean;
  selectItemServers: { value: string; label: string; disabled?: boolean }[];
  selectItemDeviceType: { value: string; label: string; disabled?: boolean }[];
  type: "Create" | "Update";
}) {
  return (
    <DialogContent>
      <Form {...form}>
        <DialogHeader>
          <DialogTitle>{type} Camera</DialogTitle>
          <DialogDescription>{type === "Create" ? "Add a new camera" : "Make changes camera here"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-4 max-h-[60vh] px-1 overflow-y-auto">
            <FormInput
              form={form}
              name={"physicalId" as Path<T>}
              label="PyshicalId"
              placeholder="insert your physicalId"
            />
            <FormInput form={form} name={"url" as Path<T>} label="URL" placeholder="insert your url" />
            <FormInput form={form} name={"typeId" as Path<T>} label="TypeId" placeholder="insert your typeId" />
            {/* <FormSelect form={form} name={"typeId" as Path<T>} label="TypeId" selectItem={selectItemDeviceType} /> */}
            <FormInput form={form} name={"name" as Path<T>} label="Camera Name" placeholder="insert your camera name" />
            <FormInput form={form} name={"mac" as Path<T>} label="Mac" placeholder="insert your mac" />
            <FormSelect form={form} name={"serverId" as Path<T>} label="ServerId" selectItem={selectItemServers} />
            {/* <FormInput form={form} name={"serverId" as Path<T>} label="ServerId" placeholder="insert your serverId" /> */}
            <FormInput form={form} name={"vendor" as Path<T>} label="Vendor" placeholder="insert your vendor" />
            <FormInput form={form} name={"model" as Path<T>} label="Model" placeholder="insert your model" />
            <FormInput form={form} name={"group.id" as Path<T>} label="ID Grup" placeholder="insert your ID Grup" />

            <FormInput
              form={form}
              name={"group.name" as Path<T>}
              label="Name Grup"
              placeholder="insert your Name Grup"
            />
            <FormInput
              form={form}
              name={"credentials.user" as Path<T>}
              label="User credentials"
              placeholder="insert your user credentials"
            />
            <FormInput
              form={form}
              name={"credentials.password" as Path<T>}
              label="Password credentials"
              placeholder="insert your password credentials"
            />
            <FormInput
              form={form}
              name={"logicalId" as Path<T>}
              label="LogicalId"
              placeholder="insert your logicalId"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit">{isLoading ? <Loader2 className="animate-spin" /> : "Submit"}</Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}
