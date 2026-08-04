import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bettermoneyClient } from "@/lib/services/bettermoney";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const order = await bettermoneyClient.getPaymentOrder(id);
    return createResponse(order, 200);
  } catch (error) {
    return handleApiError(error, "bettermoney-payment-order-get");
  }
}
