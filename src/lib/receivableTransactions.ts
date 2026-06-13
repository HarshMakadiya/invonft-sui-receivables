import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import { getReceivableTarget, receivableContract } from "./receivableContract";
import { suiToMist } from "./format";

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

export function buildCreateReceivableTx(input: CreateReceivableInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: getReceivableTarget("create_invoice_receivable"),
    arguments: [
      tx.object(receivableContract.invoiceCounterId),
      tx.pure.address(input.payer),
      tx.pure.u64(suiToMist(input.amountSui)),
      tx.pure.u64(input.dueDateMs),
      tx.pure.string(input.blobId),
      tx.pure.string(input.metadataChecksum),
    ],
  });
  return tx;
}

export function buildListForFinancingTx(input: ListForFinancingInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: getReceivableTarget("list_for_financing"),
    arguments: [
      tx.object(input.invoiceObjectId),
      tx.pure.u64(suiToMist(input.financingPriceSui)),
      tx.pure.u64(input.discountBps),
    ],
  });
  return tx;
}

export function buildBuyReceivableTx(input: BuyReceivableInput) {
  const tx = new Transaction();
  const financingCoin = coinWithBalance({ balance: suiToMist(input.financingPriceSui) });
  tx.moveCall({
    target: getReceivableTarget("buy_receivable"),
    arguments: [tx.object(input.invoiceObjectId), financingCoin],
  });
  return tx;
}

export function buildPayInvoiceTx(input: PayInvoiceInput) {
  const tx = new Transaction();
  const paymentCoin = coinWithBalance({ balance: suiToMist(input.amountSui) });
  tx.moveCall({
    target: getReceivableTarget("pay_invoice"),
    arguments: [tx.object(input.invoiceObjectId), paymentCoin],
  });
  return tx;
}

export function buildCancelListingTx(input: ObjectInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: getReceivableTarget("cancel_listing"),
    arguments: [tx.object(input.invoiceObjectId)],
  });
  return tx;
}

export function buildMarkOverdueTx(input: ObjectInput) {
  const tx = new Transaction();
  tx.moveCall({
    target: getReceivableTarget("mark_overdue"),
    arguments: [tx.object(input.invoiceObjectId), tx.object("0x6")],
  });
  return tx;
}
