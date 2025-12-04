import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { NxCamera } from "./nxapi";
import { ICamera } from "@/types/Device";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
