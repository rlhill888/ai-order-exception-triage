"use server";

import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { revalidatePath } from "next/cache";

export type LambdaTriggerResult = { ok: true } | { ok: false; error: string };

const LAMBDA_FUNCTION_NAMES = {
  mockData: "mock-data-creation-lambda",
  exceptionChecker: "exception-checker-lambda",
} as const;

async function invokeLambda(
  functionName: string,
  payload: Record<string, unknown> = {}
): Promise<LambdaTriggerResult> {
  try {
    const client = new LambdaClient({ region: process.env.AWS_REGION || "us-east-1" });
    const response = await client.send(
      new InvokeCommand({
        FunctionName: functionName,
        // Fire-and-forget: these lambdas make many LLM calls and can run for
        // minutes, well past typical serverless request timeouts.
        InvocationType: "Event",
        Payload: new TextEncoder().encode(JSON.stringify(payload)),
      })
    );

    if (response.StatusCode && response.StatusCode >= 300) {
      return { ok: false, error: `Lambda responded with status ${response.StatusCode}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function triggerMockDataLambda(): Promise<LambdaTriggerResult> {
  return invokeLambda(LAMBDA_FUNCTION_NAMES.mockData);
}

export async function triggerExceptionCheckerLambda(): Promise<LambdaTriggerResult> {
  return invokeLambda(LAMBDA_FUNCTION_NAMES.exceptionChecker);
}

export async function refreshExceptions(): Promise<void> {
  revalidatePath("/");
}
