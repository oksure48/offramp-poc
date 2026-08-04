import { NextRequest } from "next/server";
import { createResponse, handleApiError } from "@/lib/api-response";
import { bettermoneyClient } from "@/lib/services/bettermoney";
import { z } from "zod";

type Params = Promise<{ id: string }>;

const transactionsSchema = z.object({
  transactions: z.array(z.object({ hash: z.string().min(1), chain: z.string().min(1) })).min(1),
});

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { transactions } = transactionsSchema.parse(body);
    const result = await bettermoneyClient.confirmTransactions(id, transactions);
    return createResponse(result, 200);
  } catch (error) {
    return handleApiError(error, "bettermoney-payment-order-transactions");
  }
}
