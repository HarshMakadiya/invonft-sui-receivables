import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { handleOptions, jsonResponse } from "../_shared/receivables.js";

const DEFAULT_SUI_RPC_URL = "https://fullnode.testnet.sui.io:443";
const SUI_COIN_TYPE = "0x2::sui::SUI";
const GAS_BUDGET = 50_000_000; // 0.05 SUI ceiling per sponsored transaction

export function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost({ request, env }) {
  try {
    const privateKey = env.SPONSOR_PRIVATE_KEY?.trim();
    if (!privateKey) {
      return jsonResponse({ error: "Gas sponsorship is not configured." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const sender = typeof body?.sender === "string" ? body.sender : "";
    const kindB64 = typeof body?.transactionKindBytes === "string" ? body.transactionKindBytes : "";

    if (!/^0x[0-9a-fA-F]{64}$/.test(sender)) {
      return jsonResponse({ error: "A valid sender address is required." }, { status: 400 });
    }
    if (!kindB64) {
      return jsonResponse({ error: "transactionKindBytes is required." }, { status: 400 });
    }

    const { secretKey } = decodeSuiPrivateKey(privateKey);
    const sponsor = Ed25519Keypair.fromSecretKey(secretKey);
    const sponsorAddress = sponsor.toSuiAddress();

    const client = new SuiJsonRpcClient({
      network: "testnet",
      url: env.SUI_RPC_URL?.trim() || DEFAULT_SUI_RPC_URL,
    });

    const tx = Transaction.fromKind(fromBase64(kindB64));

    // Abuse guard: only sponsor Move calls into our own receivable package.
    const allowedPackage = (env.RECEIVABLE_PACKAGE_ID || env.VITE_INVO_RECEIVABLE_PACKAGE_ID || "").trim();
    if (allowedPackage) {
      const data = tx.getData();
      const commands = Array.isArray(data?.commands) ? data.commands : [];
      const moveCalls = commands.filter((command) => command?.MoveCall);
      const onlyOurPackage = moveCalls.length > 0 && moveCalls.every((command) => command.MoveCall.package === allowedPackage);
      if (!onlyOurPackage) {
        return jsonResponse({ error: "Sponsor only covers InvoNFT receivable transactions." }, { status: 403 });
      }
    }

    tx.setSender(sender);
    tx.setGasOwner(sponsorAddress);
    tx.setGasBudget(GAS_BUDGET);

    const coins = await client.getCoins({ owner: sponsorAddress, coinType: SUI_COIN_TYPE });
    if (!coins.data?.length) {
      return jsonResponse({ error: "Sponsor wallet has no SUI gas coins." }, { status: 503 });
    }
    tx.setGasPayment(
      coins.data.slice(0, 10).map((coin) => ({
        objectId: coin.coinObjectId,
        version: coin.version,
        digest: coin.digest,
      })),
    );

    const bytes = await tx.build({ client });
    const { signature } = await sponsor.signTransaction(bytes);

    return jsonResponse({ txBytes: toBase64(bytes), sponsorSignature: signature, sponsor: sponsorAddress });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error?.message || "Sponsorship failed." }, { status: 500 });
  }
}
