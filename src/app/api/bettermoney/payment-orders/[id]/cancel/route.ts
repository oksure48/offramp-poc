import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bettermoneyClient } from "@/lib/services/bettermoney";
import { z } from "zod";

type Params = Promise<{ id: string }>;

const cancelSchema = z.object({ reason: z.string().optional() });

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { reason } = cancelSchema.parse(body);
    await bettermoneyClient.cancelPaymentOrder(id, reason);
    return createResponse({ paymentOrderId: id, canceled: true }, 202);
  } catch (error) {
    return handleApiError(error, "bettermoney-payment-order-cancel");
  }
}
