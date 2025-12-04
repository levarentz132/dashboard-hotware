import z from "zod";

const credentialsFormSchema = z.object({
  user: z.string().min(1, "User is required for credentials"),
  password: z.string().min(1, "Password is required for credentials"),
});

// 2. Skema Group (Opsional untuk form)
const groupFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
});

export const cameraFormSchema = z.object({
  id: z.string(),
  physicalId: z.string().optional(),
  url: z.string().min(1, "URL is required"),
  typeId: z.string().optional(),
  name: z.string().min(1, "Camera Name is required"),
  mac: z.string().optional(),
  serverId: z.string().min(1, "Server ID is required"),
  vendor: z.string().optional(),
  model: z.string().optional(),
  group: groupFormSchema.optional(),
  credentials: credentialsFormSchema,
  logicalId: z.string().optional(),
});

export const cameraSchema = z.object({
  physicalId: z.string(),
  url: z.string(),
  typeId: z.string(),
  name: z.string(),
  mac: z.string(),
  serverId: z.string(),
  vendor: z.string(),
  model: z.string(),
  logicalId: z.string(),
  // Properti Baru Bertingkat
  group: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
  credentials: z.object({ user: z.string(), password: z.string() }),
});

export type Camera = z.infer<typeof cameraSchema> & { id: string };
export type CameraForm = z.infer<typeof cameraFormSchema>;
