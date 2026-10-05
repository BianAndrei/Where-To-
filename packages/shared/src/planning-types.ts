import { z } from "zod";

const key = z.string().min(1).max(100);
const amount = z
  .string()
  .regex(/^\d+(\.\d{1,8})?$/)
  .max(24);
export const planningDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Choose a valid date",
  );
export const reservationSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  reference: z.string().max(120),
  source: z.enum(["text", "pdf", "image"]),
  importedAt: z.string().datetime(),
});
export const receiptSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  rate: amount,
  rateDate: planningDate,
  total: amount,
  rows: z
    .array(
      z.object({
        id: key,
        label: z.string().min(1).max(120),
        amount,
        kind: z.enum(["purchase", "discount"]),
        participantIds: z.array(key).min(1).max(50),
      }),
    )
    .min(1)
    .max(100),
});
export type Receipt = z.infer<typeof receiptSchema>;
export const pollSchema = z.object({
  id: key,
  question: z.string().min(3).max(200),
  optionIds: z.array(key).min(2).max(8),
  status: z.enum(["open", "resolved", "cancelled"]),
  votes: z
    .array(z.object({ userId: key, name: z.string().max(100), optionId: key }))
    .max(100),
  selectedId: key.optional(),
  createdAt: z.string().datetime(),
});
export type TripPoll = z.infer<typeof pollSchema>;
export const transferSchema = z.object({
  departureOffset: z
    .string()
    .regex(/^[+-]\d{2}:\d{2}$/)
    .optional(),
  flightId: key,
  stayId: key,
  direction: z.enum(["arrival", "departure"]),
  mode: z.enum(["train", "bus", "taxi"]),
  changes: z.number().int().min(0).max(30).nullable(),
  costSource: z.enum(["manual", "provider-confirmed"]),
});
export const planningCommands = [
  z.object({
    type: z.literal("poll.create"),
    id: key,
    question: z.string().min(3).max(200),
    optionIds: z.array(key).min(2).max(8),
  }),
  z.object({ type: z.literal("poll.vote"), id: key, optionId: key.nullable() }),
  z.object({
    type: z.literal("poll.resolve"),
    id: key,
    selectedId: key,
    day: planningDate,
  }),
  z.object({ type: z.literal("poll.cancel"), id: key }),
  z.object({
    type: z.literal("receipt.save"),
    itemId: key,
    receipt: receiptSchema,
  }),
] as const;
export type PlanningCommand = z.infer<(typeof planningCommands)[number]>;
