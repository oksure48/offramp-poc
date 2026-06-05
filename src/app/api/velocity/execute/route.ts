import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { velocityClient } from "@/lib/services/velocity";
import { z } from "zod";

const executeSchema = z.object({
  quote_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { quote_id } = executeSchema.parse(body);
    const result = await velocityClient.executeQuote(quote_id);
    return createResponse(result, 200);
  } catch (error) {
    return handleApiError(error, "velocity-execute");
  }
}
