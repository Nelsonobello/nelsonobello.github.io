const PAYSTACK_BASE_URL = "https://api.paystack.co";

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

type InitializeParams = {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string;
};

type InitializeResponse = {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
};

/**
 * Calls Paystack's /transaction/initialize, restricted to the one-time
 * "Pay with Transfer" channel — NOT Dedicated Virtual Accounts. Each
 * transaction gets its own one-off account number that expires after use.
 */
export async function initializeTransaction({
  email,
  amountKobo,
  reference,
  callbackUrl,
}: InitializeParams): Promise<InitializeResponse["data"]> {
  console.log("Paystack callback_url being sent:", callbackUrl ?? process.env.PAYSTACK_CALLBACK_URL);
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
     method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountKobo,
      reference,
      channels: ["bank_transfer"],
      callback_url: callbackUrl ?? process.env.PAYSTACK_CALLBACK_URL,
    }),
  });

  const json = (await res.json()) as InitializeResponse;

  if (!res.ok || !json.status) {
    throw new Error(json.message || "Paystack initialize failed");
  }

  return json.data;
}

type VerifyResponse = {
  status: boolean;
  message: string;
  data: {
    status: "success" | "failed" | "abandoned";
    reference: string;
    amount: number; // kobo
    currency: string;
    paid_at: string | null;
    customer: { email: string };
  };
};

/**
 * Calls Paystack's /transaction/verify/:reference. This is the
 * server-to-server check that actually confirms payment — never trust
 * a client-side redirect alone.
 */
export async function verifyTransaction(
  reference: string
): Promise<VerifyResponse["data"]> {
  const res = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secretKey()}` },
    }
  );

  const json = (await res.json()) as VerifyResponse;

  if (!res.ok || !json.status) {
    throw new Error(json.message || "Paystack verify failed");
  }

  return json.data;
}
