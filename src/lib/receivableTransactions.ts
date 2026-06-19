import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { getReceivableEscrowTarget, getReceivableTarget, receivableContract } from "./receivableContract";
import { paymentCoin, toBaseUnits } from "./coin";

const SUI_CLOCK_OBJECT_ID = "0x6";

type CreateReceivableInput = {
  payer: string;
  amountSui: number;
  dueDateMs: number;
  blobId: string;
  metadataChecksum: string;
};

type ObjectInput = {
  invoiceObjectId: string;
};

type ListForFinancingInput = ObjectInput & {
  financingPriceSui: number;
  discountBps: number;
};

type BuyReceivableInput = ObjectInput & {
  financingPriceSui: number;
};

type PayInvoiceInput = ObjectInput & {
  amountSui: number;
};

type LockDepositInput = ObjectInput & {
  amountSui: number;
  gracePeriodMs: number;
};

type EscrowObjectInput = ObjectInput & {
  escrowObjectId: string;
};

const coinTypeArgs = [paymentCoin.type];

export function buildCreateReceivableTx(input: CreateReceivableInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: getReceivableTarget("create_invoice_receivable"),
    typeArguments: coinTypeArgs,
    arguments: [
      tx.object(receivableContract.invoiceCounterId),
      tx.pure("address", input.payer),
      tx.pure("u64", toBaseUnits(input.amountSui)),
      tx.pure("u64", input.dueDateMs),
      tx.pure("string", input.blobId),
      tx.pure("string", input.metadataChecksum),
    ],
  });
  return tx;
}

export function buildAcknowledgeInvoiceTx(input: ObjectInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: getReceivableTarget("acknowledge_invoice"),
    typeArguments: coinTypeArgs,
    arguments: [tx.object(input.invoiceObjectId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  return tx;
}

export function buildListForFinancingTx(input: ListForFinancingInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: getReceivableTarget("list_for_financing"),
    typeArguments: coinTypeArgs,
    arguments: [
      tx.object(input.invoiceObjectId),
      tx.pure("u64", toBaseUnits(input.financingPriceSui)),
      tx.pure("u64", input.discountBps),
    ],
  });
  return tx;
}

export function buildBuyReceivableTx(input: BuyReceivableInput) {
  const tx = new Transaction();
  const financingCoin = tx.add(coinWithBalance({ type: paymentCoin.type, balance: toBaseUnits(input.financingPriceSui) }));
  tx.moveCall({
    target: getReceivableTarget("buy_receivable"),
    typeArguments: coinTypeArgs,
    arguments: [tx.object(input.invoiceObjectId), tx.object(receivableContract.platformConfigId), financingCoin],
  });
  return tx;
}

export function buildPayInvoiceTx(input: PayInvoiceInput) {
  const tx = new Transaction();
  const settlementCoin = tx.add(coinWithBalance({ type: paymentCoin.type, balance: toBaseUnits(input.amountSui) }));
  tx.moveCall({
    target: getReceivableTarget("pay_invoice"),
    typeArguments: coinTypeArgs,
    arguments: [tx.object(input.invoiceObjectId), settlementCoin],
  });
  return tx;
}

export function buildCancelListingTx(input: ObjectInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: getReceivableTarget("cancel_listing"),
    typeArguments: coinTypeArgs,
    arguments: [tx.object(input.invoiceObjectId)],
  });
  return tx;
}

export function buildMarkOverdueTx(input: ObjectInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: getReceivableTarget("mark_overdue"),
    typeArguments: coinTypeArgs,
    arguments: [tx.object(input.invoiceObjectId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  return tx;
}

export function buildLockDepositTx(input: LockDepositInput) {
  const tx = new Transaction();
  const depositCoin = tx.add(coinWithBalance({ type: paymentCoin.type, balance: toBaseUnits(input.amountSui) }));
  tx.moveCall({
    target: getReceivableEscrowTarget("lock_deposit"),
    typeArguments: [paymentCoin.type],
    arguments: [
      tx.object(input.invoiceObjectId),
      depositCoin,
      tx.pure("u64", input.gracePeriodMs),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function buildReleaseDepositTx(input: EscrowObjectInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: getReceivableEscrowTarget("release_deposit"),
    typeArguments: [paymentCoin.type],
    arguments: [tx.object(input.escrowObjectId), tx.object(input.invoiceObjectId)],
  });
  return tx;
}

export function buildClaimDepositTx(input: EscrowObjectInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: getReceivableEscrowTarget("claim_deposit"),
    typeArguments: [paymentCoin.type],
    arguments: [tx.object(input.escrowObjectId), tx.object(input.invoiceObjectId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  return tx;
}
