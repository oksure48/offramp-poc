import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bettermoneyClient } from "@/lib/services/bettermoney";
import { z } from "zod";

const addUserSchema = z.object({
  label: z.string().min(1),
  wallets: z
    .array(z.object({ address: z.string().min(1), chain: z.string().min(1) }))
    .min(1),
});

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
    const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");
    const result = await bettermoneyClient.listUsers(limit, offset);
    return createResponse(result, 200);
  } catch (error) {
    return handleApiError(error, "bettermoney-users-list");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const params = addUserSchema.parse(body);
    const user = await bettermoneyClient.addUserRecord(params);
    return createResponse(user, 201);
  } catch (error) {
    return handleApiError(error, "bettermoney-users-create");
  }
}
