import {
  useDAppKit,
  useCurrentAccount,
  useCurrentClient,
  useCurrentNetwork,
  useCurrentWallet,
  useWalletConnection,
} from "@mysten/dapp-kit-react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import {
  ArrowRight,
  Banknote,
  Check,
  CircleDollarSign,
  Clock3,
  DatabaseZap,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  Gauge,
  Landmark,
  LayoutDashboard,
  LineChart,
  Network,
  ReceiptText,
  Search,
  ShieldCheck,
  Store,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { evidence, wallets } from "./data/mockReceivables";
import { appMode, isProductionMode } from "./lib/appMode";
import { buildEvidencePackage } from "./lib/evidencePackage";
import { isRealSuiId, isRealTransactionDigest, isRealWalrusBlobId, suiObjectUrl, suiTransactionUrl } from "./lib/explorer";
import { fromBase64 } from "@mysten/sui/utils";
import { paymentCoin, roundAmount } from "./lib/coin";
import { feeBreakdown } from "./lib/platform";
import { isSponsorshipEnabled, requestSponsorship } from "./lib/sponsor";
import { compactNumber, formatToken, shortAddress } from "./lib/format";
import { healthScore } from "./lib/healthScore";
import { createInvoicePdfBlob, downloadInvoicePdf } from "./lib/invoicePdf";
import { fetchReceivablesFromIndexer, isIndexerConfigured, syncReceivableWithIndexer } from "./lib/receivableIndex";
import { getReceivableContractReadiness, receivableContract } from "./lib/receivableContract";
import {
  buildBuyReceivableTx,
  buildCreateReceivableTx,
  buildListForFinancingTx,
  buildMarkOverdueTx,
  buildPayInvoiceTx,
} from "./lib/receivableTransactions";
import { fetchReceivablesFromDb, isSupabaseConfigured, saveReceivableToDb } from "./lib/supabaseReceivables";
import { downloadEvidencePackage, evidenceUrl, uploadEvidencePackage, uploadWalrusBlob } from "./lib/walrus";
import type { EvidenceLineItem, EvidencePackage } from "./types/evidence";
import type { FinancingStatus, Invoice, InvoiceStatus, Page, WalletRole } from "./types/receivable";

function readInvoiceIdFromLocation() {
  const match = window.location.pathname.match(/^\/invoice\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function readPageFromLocation(): Page {
  const path = window.location.pathname;
  if (path.startsWith("/invoice/")) return "dashboard";
  if (path.startsWith("/dashboard")) return "dashboard";
  if (path.startsWith("/create")) return "create";
  if (path.startsWith("/marketplace")) return "marketplace";
  if (path.startsWith("/portfolio")) return "portfolio";
  return "landing";
}

function parseLineItems(raw: FormDataEntryValue | null): EvidenceLineItem[] {
  if (typeof raw !== "string" || !raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => ({
        description: String(item?.description ?? ""),
        quantity: Number(item?.quantity) || 0,
        unitPrice: Number(item?.unitPrice) || 0,
      }))
      .filter((item) => item.description.trim() !== "" || item.quantity > 0 || item.unitPrice > 0);
  } catch {
    return [];
  }
}

function sameAddress(left: string | undefined, right: string | undefined) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function isSuiAddress(value: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function canListInvoice(invoice: Invoice, walletRole: WalletRole, activeAddress: string) {
  if (invoice.status !== "PENDING" || invoice.financingStatus !== "NOT_LISTED") {
    return false;
  }

  return isProductionMode ? sameAddress(activeAddress, invoice.issuer) : walletRole === "issuer";
}

function canBuyInvoice(invoice: Invoice, walletRole: WalletRole, activeAddress: string) {
  if (invoice.status !== "PENDING" || invoice.financingStatus !== "LISTED") {
    return false;
  }

  return isProductionMode ? Boolean(activeAddress && !sameAddress(activeAddress, invoice.issuer)) : walletRole === "buyer";
}

function canPayInvoice(invoice: Invoice, walletRole: WalletRole, activeAddress: string) {
  if (invoice.status !== "PENDING") {
    return false;
  }

  return isProductionMode ? sameAddress(activeAddress, invoice.payer) : walletRole === "payer";
}

function App() {
  const account = useCurrentAccount();
  const suiClient = useCurrentClient();
  const dAppKit = useDAppKit();
  const [page, setPage] = useState<Page>(readPageFromLocation());
  const [walletRole, setWalletRole] = useState<WalletRole>("issuer");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(readInvoiceIdFromLocation());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [listingInvoice, setListingInvoice] = useState<Invoice | null>(null);

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? invoices[0] ?? null;
  const wallet = wallets[walletRole];
  const activeAddress = account?.address ?? "";
  const contractReadiness = getReceivableContractReadiness();
  const canSubmitTransactions = Boolean(account && contractReadiness.ready);

  useEffect(() => {
    let isMounted = true;

    async function loadReceivables() {
      const canReadIndex = isProductionMode ? isIndexerConfigured() : isSupabaseConfigured();
      if (!canReadIndex) {
        return;
      }

      try {
        const savedInvoices = isProductionMode
          ? await fetchReceivablesFromIndexer()
          : await fetchReceivablesFromDb();
        if (!isMounted || savedInvoices.length === 0) {
          return;
        }

        const linkedInvoiceId = readInvoiceIdFromLocation();
        const linkedInvoice = savedInvoices.find((invoice) => invoice.id === linkedInvoiceId);

        setInvoices(savedInvoices);
        setSelectedInvoiceId(linkedInvoice?.id ?? savedInvoices[0].id);
      } catch (error) {
        console.warn("Could not load receivables from index", error);
      }
    }

    void loadReceivables();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function syncFromLocation() {
      setPage(readPageFromLocation());
      const linkedId = readInvoiceIdFromLocation();
      if (linkedId) {
        setSelectedInvoiceId(linkedId);
      }
    }

    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const stats = useMemo(() => {
    const pending = invoices.filter((invoice) => invoice.status === "PENDING").length;
    const listed = invoices.filter((invoice) => invoice.financingStatus === "LISTED").length;
    const financed = invoices.filter((invoice) => invoice.financingStatus === "FINANCED").length;
    const paid = invoices.filter((invoice) => invoice.status === "PAID").length;
    const volume = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    return { pending, listed, financed, paid, volume };
  }, [invoices]);

  const filteredInvoices = invoices.filter((invoice) => {
    const haystack = `${invoice.id} ${invoice.clientName} ${invoice.description}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function selectInvoice(id: string) {
    setSelectedInvoiceId(id);
    window.history.replaceState(null, "", `/invoice/${encodeURIComponent(id)}`);
  }

  function navigate(nextPage: Page) {
    setPage(nextPage);
    window.history.pushState(null, "", nextPage === "landing" ? "/" : `/${nextPage}`);
  }

  function updateInvoice(nextInvoice: Invoice) {
    setInvoices((current) => current.map((invoice) => (invoice.id === nextInvoice.id ? nextInvoice : invoice)));
    void syncReceivable(nextInvoice);
  }

  async function syncReceivable(invoice: Invoice) {
    try {
      if (isProductionMode) {
        if (!isIndexerConfigured()) {
          notify("Production indexer API is not configured; persisted state was not changed.");
          return;
        }

        const savedInvoice = await syncReceivableWithIndexer(invoice);
        if (savedInvoice) {
          setInvoices((current) =>
            current.map((item) => (item.id === invoice.id || item.objectId === invoice.objectId ? savedInvoice : item)),
          );
          setSelectedInvoiceId((current) => (current === invoice.id ? savedInvoice.id : current));
        }
        return;
      }

      await saveReceivableToDb(invoice);
    } catch (error) {
      console.warn("Could not sync receivable", error);
      notify(isProductionMode ? "Indexer sync failed; persisted state was not changed." : "Database sync failed; the current browser session still has the update.");
    }
  }

  async function trySubmitTransaction(
    label: string,
    buildTransaction: () => ReturnType<typeof buildCreateReceivableTx>,
    createdObjectType?: string,
  ) {
    if (!canSubmitTransactions) {
      return null;
    }

    try {
      const result = isSponsorshipEnabled()
        ? await executeSponsoredTransaction(buildTransaction())
        : await dAppKit.signAndExecuteTransaction({ transaction: buildTransaction() });

      if (result.FailedTransaction) {
        throw new Error(result.FailedTransaction.status.error?.message ?? "Transaction failed");
      }

      const digest = result.Transaction.digest;
      const createdObjectId = createdObjectType ? await findCreatedObjectId(digest, createdObjectType) : undefined;

      notify(`${label} submitted: ${shortAddress(digest)}`);
      return { digest, createdObjectId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transaction failed";
      notify(`${label} could not be submitted: ${message}`);
      return null;
    }
  }

  async function executeSponsoredTransaction(transaction: ReturnType<typeof buildCreateReceivableTx>) {
    // 1. Serialize just the transaction commands (no gas/sender yet).
    const kindBytes = await transaction.build({ client: suiClient, onlyTransactionKind: true });
    // 2. Backend sponsor sets itself as gas owner, attaches its SUI, and signs.
    const sponsored = await requestSponsorship(activeAddress, kindBytes);
    // 3. The connected wallet signs the exact sponsored bytes (authorizing the action).
    const { signature: userSignature } = await dAppKit.signTransaction({ transaction: sponsored.txBytes });
    // 4. Execute with both signatures (user + sponsor).
    return suiClient.executeTransaction({
      transaction: fromBase64(sponsored.txBytes),
      signatures: [userSignature, sponsored.sponsorSignature],
    });
  }

  async function findCreatedObjectId(digest: string, expectedType: string) {
    try {
      const result = await suiClient.waitForTransaction({
        digest,
        include: { effects: true, objectTypes: true },
        timeout: 30_000,
      });

      if (result.FailedTransaction) {
        throw new Error(result.FailedTransaction.status.error?.message ?? "Transaction failed");
      }

      const createdObjects = result.Transaction.effects.changedObjects.filter((object) => object.idOperation === "Created");
      const createdInvoice = createdObjects.find((object) =>
        (result.Transaction.objectTypes[object.objectId] ?? "").startsWith(expectedType),
      );

      return createdInvoice?.objectId;
    } catch (error) {
      console.warn("Could not resolve created Sui object", error);
      return undefined;
    }
  }

  function hasRealObjectId(invoice: Invoice) {
    return isRealSuiId(invoice.objectId);
  }

  function shouldUseDemoFallback(invoice: Invoice) {
    return !isProductionMode && !hasRealObjectId(invoice);
  }

  function financingPriceFor(invoice: Invoice, discountBps: number) {
    return roundAmount(invoice.amount * ((10_000 - discountBps) / 10_000));
  }

  function requestListInvoice(invoice: Invoice) {
    if (isProductionMode && !canListInvoice(invoice, walletRole, activeAddress)) {
      notify("Connect the issuer wallet to list this receivable.");
      return;
    }

    setListingInvoice(invoice);
  }

  async function listInvoice(invoice: Invoice, discountPercent: number) {
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent >= 100) {
      notify("Enter a discount from 0 up to less than 100.");
      return;
    }

    const discountBps = Math.round(discountPercent * 100);
    const isLiveInvoice = hasRealObjectId(invoice);
    const financingPrice = financingPriceFor(invoice, discountBps);
    if (financingPrice <= 0 || financingPrice > invoice.amount) {
      notify("Financing price must be greater than 0 and no more than face value.");
      return;
    }

    const digest = isLiveInvoice
      ? await trySubmitTransaction("List transaction", () =>
        buildListForFinancingTx({
          invoiceObjectId: invoice.objectId,
          financingPriceSui: financingPrice,
          discountBps,
        }),
      )
      : null;

    if (isLiveInvoice && !digest) {
      notify("List transaction failed; persisted state was not changed.");
      return;
    }

    updateInvoice({
      ...invoice,
      financingStatus: "LISTED",
      financingPrice,
      txDigest: digest?.digest ?? invoice.txDigest,
      events: [
        ...invoice.events,
        digest
          ? `List transaction submitted: ${shortAddress(digest.digest)}`
          : shouldUseDemoFallback(invoice)
            ? "Issuer listed payment rights for financing"
            : "List transaction skipped",
      ],
    });
    setListingInvoice(null);
    notify(`${invoice.id} listed at ${discountPercent}% discount`);
  }

  async function buyInvoice(invoice: Invoice) {
    if (isProductionMode && !canBuyInvoice(invoice, walletRole, activeAddress)) {
      notify("Connect a buyer wallet that is not the issuer.");
      return;
    }

    const buyerAddress = account?.address ?? wallet.address;
    const buyerLabel = isProductionMode ? shortAddress(buyerAddress) : wallet.label;
    const isLiveInvoice = hasRealObjectId(invoice);
    const digest = isLiveInvoice
      ? await trySubmitTransaction("Buy transaction", () =>
        buildBuyReceivableTx({
          invoiceObjectId: invoice.objectId,
          financingPriceSui: invoice.financingPrice,
        }),
      )
      : null;

    if (isLiveInvoice && !digest) {
      notify("Buy transaction failed; persisted state was not changed.");
      return;
    }

    updateInvoice({
      ...invoice,
      financingStatus: "FINANCED",
      paymentRecipient: buyerAddress,
      buyer: buyerAddress,
      txDigest: digest?.digest ?? invoice.txDigest,
      events: [
        ...invoice.events,
        digest
          ? `Buy transaction submitted: ${shortAddress(digest.digest)}`
          : shouldUseDemoFallback(invoice)
            ? `Payment rights moved to ${buyerLabel}`
            : "Buy transaction skipped",
      ],
    });
    notify(`Payment recipient changed to ${buyerLabel}`);
  }

  async function markInvoiceOverdue(invoice: Invoice) {
    const isLiveInvoice = hasRealObjectId(invoice);
    const digest = isLiveInvoice
      ? await trySubmitTransaction("Overdue transaction", () =>
        buildMarkOverdueTx({
          invoiceObjectId: invoice.objectId,
        }),
      )
      : null;

    if (isLiveInvoice && !digest) {
      notify("Overdue transaction failed; persisted state was not changed.");
      return;
    }

    updateInvoice({
      ...invoice,
      status: "OVERDUE",
      evidence: { ...invoice.evidence, unpaid: true, dueDateValid: false },
      txDigest: digest?.digest ?? invoice.txDigest,
      events: [
        ...invoice.events,
        digest
          ? `Overdue transaction submitted: ${shortAddress(digest.digest)}`
          : shouldUseDemoFallback(invoice)
            ? "Invoice marked overdue"
            : "Overdue transaction skipped",
      ],
    });
    notify(`${invoice.id} marked overdue`);
  }

  async function payInvoice(invoice: Invoice) {
    if (isProductionMode && !canPayInvoice(invoice, walletRole, activeAddress)) {
      notify("Connect the configured payer wallet to pay this invoice.");
      return;
    }

    const isLiveInvoice = hasRealObjectId(invoice);
    const digest = isLiveInvoice
      ? await trySubmitTransaction("Pay transaction", () =>
        buildPayInvoiceTx({
          invoiceObjectId: invoice.objectId,
          amountSui: invoice.amount,
        }),
      )
      : null;

    if (isLiveInvoice && !digest) {
      notify("Pay transaction failed; persisted state was not changed.");
      return;
    }

    updateInvoice({
      ...invoice,
      status: "PAID",
      evidence: { ...invoice.evidence, unpaid: false },
      txDigest: digest?.digest ?? invoice.txDigest,
      events: [
        ...invoice.events,
        digest
          ? `Pay transaction submitted: ${shortAddress(digest.digest)}`
          : shouldUseDemoFallback(invoice)
            ? `Paid ${formatToken(invoice.amount)} to ${shortAddress(invoice.paymentRecipient)}`
            : "Pay transaction skipped",
      ],
    });
    notify(`Funds routed to ${shortAddress(invoice.paymentRecipient)}`);
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (isProductionMode && !canSubmitTransactions) {
      notify("Production mode requires a connected wallet and configured Sui contract.");
      return;
    }

    const next = invoices.length + 1;
    const id = `INV-${String(next).padStart(4, "0")}`;
    const clientName = String(form.get("clientName"));
    const clientEmail = String(form.get("clientEmail"));
    const description = String(form.get("description"));
    const lineItems = parseLineItems(form.get("lineItems"));
    const lineItemsTotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const amount = Number(form.get("amount")) || lineItemsTotal;
    const dueDate = String(form.get("dueDate"));
    const payerWallet = String(form.get("payerWallet") ?? "").trim();
    const invoiceFile = form.get("invoiceFile");
    const selectedInvoiceFile = invoiceFile instanceof File && invoiceFile.size > 0 ? invoiceFile : null;
    const issuerAddress = account?.address ?? wallets.issuer.address;
    const payerAddress = payerWallet || (isProductionMode ? "" : wallets.payer.address);

    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Add at least one line item with a positive total before creating a receivable.");
      return;
    }

    const lineItemsMatch = lineItems.length > 0 && Math.abs(lineItemsTotal - amount) < 1e-9;

    if (isProductionMode && !isSuiAddress(payerAddress)) {
      notify("Enter a valid payer wallet address before creating a receivable.");
      return;
    }

    setIsCreating(true);

    let blobId = `mock_walrus_blob_${next}`;
    let blobObjectId: string | undefined;
    let invoicePdfBlobId: string | undefined;
    let evidenceEvent = "Evidence package prepared";

    const invoicePdf =
      selectedInvoiceFile ??
      createInvoicePdfBlob({
        invoiceNumber: id,
        clientName,
        clientEmail,
        description,
        amount,
        dueDate,
        issuer: issuerAddress,
        payer: payerAddress,
      });

    try {
      const upload = await uploadWalrusBlob(invoicePdf);
      invoicePdfBlobId = upload.blobId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invoice file upload failed";
      evidenceEvent = `Invoice file upload skipped: ${message}`;
      notify("Invoice file upload failed; trying evidence JSON next.");
    }

    const evidencePackage = await buildEvidencePackage({
      invoiceNumber: id,
      clientName,
      clientEmail,
      description,
      amountSui: amount,
      dueDate,
      payerWalletPresent: true,
      pdfUploaded: Boolean(invoicePdfBlobId),
      invoicePdfBlobId,
      invoicePdfFileName: selectedInvoiceFile?.name,
      lineItems,
    });

    try {
      const upload = await uploadEvidencePackage(evidencePackage);
      blobId = upload.blobId;
      blobObjectId = upload.blobObjectId;
      evidenceEvent = invoicePdfBlobId
        ? `${selectedInvoiceFile ? "Invoice file" : "Invoice PDF"} and evidence package uploaded to Walrus Testnet`
        : "Evidence package uploaded to Walrus Testnet";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Walrus upload failed";
      evidenceEvent = `Walrus upload skipped: ${message}`;
      notify("Evidence upload failed; receivable was still prepared.");
    }

    const dueDateMs = new Date(dueDate).getTime();
    const invoiceReceivableType = `${receivableContract.packageId}::${receivableContract.moduleName}::InvoiceReceivable`;
    const createResult = await trySubmitTransaction(
      "Create transaction",
      () =>
        buildCreateReceivableTx({
          payer: payerAddress,
          amountSui: amount,
          dueDateMs,
          blobId,
          metadataChecksum: evidencePackage.metadataChecksum,
        }),
      invoiceReceivableType,
    );

    if (isProductionMode && !createResult?.createdObjectId) {
      setIsCreating(false);
      notify("Create transaction failed; receivable was not saved.");
      return;
    }

    const invoice: Invoice = {
      id,
      objectId: createResult?.createdObjectId ?? `db:${id}`,
      clientName,
      clientEmail,
      description,
      amount,
      dueDate,
      issuer: issuerAddress,
      payer: payerAddress,
      paymentRecipient: issuerAddress,
      buyer: null,
      status: "PENDING",
      financingStatus: "NOT_LISTED",
      financingPrice: 0,
      blobId,
      blobObjectId,
      metadataChecksum: evidencePackage.metadataChecksum,
      txDigest: createResult?.digest ?? undefined,
      evidence: evidence({ complete: Boolean(invoicePdfBlobId), unpaid: true, lineItemsMatch }),
      events: [
        "Receivable object drafted",
        evidenceEvent,
        createResult?.digest ? `Create transaction submitted: ${shortAddress(createResult.digest)}` : "Receivable prepared for review",
      ],
    };

    setInvoices((current) => [invoice, ...current]);
    void syncReceivable(invoice);
    selectInvoice(invoice.id);
    setPage("dashboard");
    setIsCreating(false);
    notify(`${invoice.id} created`);
  }

  if (page === "landing") {
    return (
      <Landing
        onLaunch={() => navigate("dashboard")}
        onCreate={() => navigate("create")}
        onMarketplace={() => navigate("marketplace")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <div className="fixed inset-0 -z-10 grid-noise opacity-30" />
      <div className="fixed left-[-18rem] top-[-18rem] -z-10 h-[38rem] w-[38rem] rounded-full bg-mosssoft/20 blur-[100px]" />
      <div className="fixed bottom-[-20rem] right-[-12rem] -z-10 h-[36rem] w-[36rem] rounded-full bg-sun/10 blur-[100px]" />

      <div className="mx-auto flex min-h-screen w-full max-w-[1540px] gap-5 p-4 lg:p-5">
        <aside className="hidden w-[248px] shrink-0 self-start rounded-[1.1rem] bg-lead border border-line p-3 text-ink shadow-flat lg:block">
          <div className="rounded-[1rem] border border-line bg-paperalt/30 p-3">
            <button className="flex w-full items-center gap-3 text-left" onClick={() => navigate("landing")} type="button">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-moss text-base font-black text-lead shadow-flat">
                IN
              </div>
              <div>
                <p className="text-base font-bold tracking-tight text-ink font-poppins">InvoNFT</p>
                <p className="text-[9px] text-inkmuted font-mono uppercase tracking-wider">Receivables console</p>
              </div>
            </button>

            {!isProductionMode ? (
              <div className="mt-3 rounded-xl bg-paperalt/50 border border-line p-2.5">
                <p className="text-[9px] uppercase tracking-[0.16em] text-inkmuted font-poppins font-semibold">Active role</p>
                <div className="mt-2 grid gap-1">
                  {Object.entries(wallets).map(([key, item]) => {
                    const isActive = walletRole === key;
                    return (
                      <button
                        key={key}
                        className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-poppins font-semibold transition-all duration-150 ${isActive
                          ? "bg-moss text-lead shadow-flat font-bold"
                          : "text-inksecondary bg-transparent hover:bg-paperalt/50 hover:text-ink"
                          }`}
                        onClick={() => setWalletRole(key as WalletRole)}
                      >
                        <span>{item.label}</span>
                        {isActive && <Check size={12} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl bg-paperalt/50 border border-line p-2.5">
                <p className="text-[9px] uppercase tracking-[0.16em] text-inkmuted font-poppins font-semibold">Production actor</p>
                <p className="mt-1.5 truncate text-[11px] font-bold text-ink font-mono">
                  {activeAddress ? shortAddress(activeAddress) : "Connect wallet"}
                </p>
              </div>
            )}
          </div>

          <nav className="mt-3 grid gap-1">
            <NavItem active={page === "dashboard"} icon={<LayoutDashboard size={16} />} label="Command Center" onClick={() => navigate("dashboard")} />
            <NavItem active={page === "create"} icon={<FilePlus2 size={16} />} label="Create Receivable" onClick={() => navigate("create")} />
            <NavItem active={page === "marketplace"} icon={<Store size={16} />} label="Marketplace" onClick={() => navigate("marketplace")} />
            <NavItem active={page === "portfolio"} icon={<WalletCards size={16} />} label="Buyer Portfolio" onClick={() => navigate("portfolio")} />
          </nav>

        </aside>

        <main className="min-w-0 flex-1">
          <header className="glass-card sticky top-4 z-20 mb-5 flex flex-col gap-4 rounded-[1.25rem] p-4 shadow-flat md:flex-row md:items-center md:justify-between border border-line bg-lead/90 backdrop-blur-md">
            <div>
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-moss/80 font-mono">
                <Network size={12} /> {appMode} workspace
              </p>
              <h1 className="mt-1.5 text-balance text-2xl font-bold tracking-tight text-ink font-poppins">
                Programmable receivables.
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SuiWalletPanel />

              {!isProductionMode ? (
                <div className="rounded-2xl border border-line bg-paperalt/30 px-3.5 py-1.5 flex flex-col justify-center min-h-[52px]">
                  <span className="block text-[9px] font-bold text-inkmuted uppercase tracking-wider font-poppins font-semibold">Active Role</span>
                  <div className="mt-1 flex gap-1 bg-paperalt/50 rounded-lg p-0.5 border border-line">
                    {Object.entries(wallets).map(([key, item]) => {
                      const isActive = walletRole === key;
                      return (
                        <button
                          key={key}
                          className={`rounded-md px-2.5 py-0.5 text-[10px] font-poppins font-semibold transition-all duration-150 ${isActive
                            ? "bg-moss text-lead shadow-flat font-bold"
                            : "text-inksecondary hover:text-ink hover:bg-paperalt/40"
                            }`}
                          onClick={() => setWalletRole(key as WalletRole)}
                        >
                          {item.label.split(" ")[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-line bg-paperalt/30 px-3.5 py-2 flex flex-col justify-center min-h-[52px]">
                  <span className="block text-[9px] font-bold text-inkmuted uppercase tracking-wider font-poppins font-semibold">Connected actor</span>
                  <span className="mt-1 truncate text-[10px] font-bold text-ink font-mono">
                    {activeAddress ? shortAddress(activeAddress) : "Wallet required"}
                  </span>
                </div>
              )}

              <button
                className="rounded-2xl bg-moss px-5 py-3 text-xs font-poppins font-bold text-lead shadow-flat hover:bg-mossdeep transition-all duration-200 hover:-translate-y-0.5"
                onClick={() => navigate("create")}
              >
                New receivable
              </button>
            </div>
          </header>

          <MobileNav page={page} onChange={navigate} />

          {page === "dashboard" && (
            <Dashboard
              invoices={filteredInvoices}
              query={query}
              selectedInvoice={selectedInvoice}
              stats={stats}
              walletRole={walletRole}
              activeAddress={activeAddress}
              onBuy={buyInvoice}
              onList={requestListInvoice}
              onMarkOverdue={markInvoiceOverdue}
              onPay={payInvoice}
              onCreate={() => navigate("create")}
              onQuery={setQuery}
              onSelect={selectInvoice}
              onShowMarketplace={() => navigate("marketplace")}
            />
          )}
          {page === "create" && <CreateReceivable isCreating={isCreating} onCreate={createInvoice} />}
          {page === "marketplace" && (
            <Marketplace activeAddress={activeAddress} invoices={invoices} walletRole={walletRole} onBuy={buyInvoice} onSelect={selectInvoice} />
          )}
          {page === "portfolio" && <Portfolio activeAddress={activeAddress} invoices={invoices} walletLabel={wallet.label} walletAddress={wallet.address} />}
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white shadow-lifted">
          {toast}
        </div>
      )}

      {listingInvoice && (
        <ListReceivableModal
          invoice={listingInvoice}
          onClose={() => setListingInvoice(null)}
          onSubmit={(discountPercent) => listInvoice(listingInvoice, discountPercent)}
        />
      )}
    </div>
  );
}

function Landing({
  onLaunch,
  onCreate,
  onMarketplace,
}: {
  onLaunch: () => void;
  onCreate: () => void;
  onMarketplace: () => void;
}) {
  const differentiators = [
    {
      icon: <ReceiptText size={20} />,
      title: "Receivable object, not a static NFT",
      body: "Each invoice is a live Sui Move object carrying amount, due date, payment recipient, financing status, and settlement logic.",
    },
    {
      icon: <Banknote size={20} />,
      title: "Payment-right financing",
      body: "Issuers list unpaid invoices at a discount; buyers purchase the right to collect, and the payer settles to the current recipient.",
    },
    {
      icon: <DatabaseZap size={20} />,
      title: "Walrus evidence package",
      body: "Invoices are backed by retrievable evidence and a checksum instead of opaque metadata, so buyers can verify before they finance.",
    },
    {
      icon: <Gauge size={20} />,
      title: "Deterministic health score",
      body: "A transparent, rules-based score summarizes evidence completeness and invoice quality. No AI underwriting, no credit rating.",
    },
  ];

  const marketRows = [
    { problem: "Businesses wait 30/60/90 days to get paid", response: "Unpaid invoices become financeable Sui receivable objects" },
    { problem: "Receivables are paper-heavy and opaque", response: "Walrus stores evidence; Sui stores state and payment rights" },
    { problem: "Invoice financing requires trusting invoice quality", response: "Verification checklist and health score make buyer review easy" },
    { problem: "Settlement must be automatic and non-custodial", response: "Payer signs; the contract routes funds to payment_recipient" },
  ];

  const steps = [
    { icon: <FileCheck2 size={18} />, title: "Create", body: "Mint an invoice receivable with line items and Walrus-backed evidence." },
    { icon: <Store size={18} />, title: "List", body: "Offer the unpaid invoice for financing at a chosen discount." },
    { icon: <CircleDollarSign size={18} />, title: "Finance", body: "A buyer purchases payment rights; a platform fee routes on purchase." },
    { icon: <ShieldCheck size={18} />, title: "Settle", body: "The payer pays the full amount to the current payment recipient." },
  ];

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <div className="fixed inset-0 -z-10 grid-noise opacity-30" />
      <div className="fixed left-[-18rem] top-[-18rem] -z-10 h-[38rem] w-[38rem] rounded-full bg-mosssoft/20 blur-[100px]" />
      <div className="fixed bottom-[-20rem] right-[-12rem] -z-10 h-[36rem] w-[36rem] rounded-full bg-sun/10 blur-[100px]" />

      <div className="mx-auto w-full max-w-[1180px] px-4 py-5 lg:px-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-moss text-base font-black text-lead shadow-flat">IN</div>
            <div>
              <p className="text-base font-bold tracking-tight text-ink font-poppins">InvoNFT</p>
              <p className="text-[9px] text-inkmuted font-mono uppercase tracking-wider">Programmable receivables on Sui</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="hidden rounded-2xl border border-line bg-lead px-4 py-2.5 text-xs font-bold text-ink shadow-flat transition hover:bg-paperalt/50 sm:block"
              onClick={onMarketplace}
              type="button"
            >
              Marketplace
            </button>
            <SuiWalletPanel />
            <button
              className="rounded-2xl bg-moss px-5 py-2.5 text-xs font-poppins font-bold text-lead shadow-flat transition hover:bg-mossdeep hover:-translate-y-0.5"
              onClick={onLaunch}
              type="button"
            >
              Launch console
            </button>
          </div>
        </header>

        <section className="mt-16 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-moss/25 bg-mosssoft px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-moss font-mono">
              <Network size={12} /> Sui Testnet · DeFi & Payments
            </p>
            <h1 className="mt-5 text-balance text-4xl font-black leading-[1.08] tracking-tight text-ink font-poppins md:text-5xl">
              Turn unpaid invoices into programmable receivables.
            </h1>
            <p className="mt-5 max-w-xl text-balance text-sm leading-6 text-inksecondary">
              InvoNFT converts invoices into live Sui Move objects that can be paid, verified, listed,
              financed, and settled — using Walrus-backed evidence and non-custodial, Sui-native payment routing.
              We are not minting invoice images. We are building receivables infrastructure on Sui.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                className="inline-flex items-center gap-2 rounded-2xl bg-moss px-6 py-3.5 text-xs font-bold text-lead shadow-flat transition hover:bg-mossdeep hover:-translate-y-0.5"
                onClick={onLaunch}
                type="button"
              >
                Open console <ArrowRight size={15} />
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-2xl border border-line bg-lead px-6 py-3.5 text-xs font-bold text-ink shadow-flat transition hover:bg-paperalt/50"
                onClick={onCreate}
                type="button"
              >
                Create a receivable
              </button>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.5rem] border border-line bg-lead p-5 shadow-flat">
            {steps.map((step, index) => (
              <div className="flex items-start gap-3" key={step.title}>
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-moss/25 bg-mosssoft text-moss">{step.icon}</div>
                <div>
                  <p className="text-xs font-bold text-ink font-poppins">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-5 text-inksecondary">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 grid gap-4 sm:grid-cols-2">
          {differentiators.map((item) => (
            <div className="rounded-[1.25rem] border border-line bg-lead p-5 shadow-flat" key={item.title}>
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-moss/25 bg-mosssoft text-moss">{item.icon}</div>
              <h3 className="mt-4 text-sm font-bold text-ink font-poppins">{item.title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-inksecondary">{item.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-20">
          <h2 className="text-xl font-bold tracking-tight text-ink font-poppins">Why receivables, why now</h2>
          <div className="mt-5 grid gap-3">
            {marketRows.map((row) => (
              <div className="grid gap-3 rounded-2xl border border-line bg-lead p-4 shadow-flat sm:grid-cols-[1fr_auto_1fr] sm:items-center" key={row.problem}>
                <p className="text-xs leading-5 text-inksecondary">{row.problem}</p>
                <ArrowRight className="hidden text-moss sm:block" size={16} />
                <p className="text-xs font-semibold leading-5 text-ink">{row.response}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 flex flex-col items-start justify-between gap-5 rounded-[1.5rem] border border-moss/25 bg-mosssoft p-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink font-poppins">Ready to walk the flow?</h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-inksecondary">
              Connect a Sui Testnet wallet, create a receivable, list it for financing, and settle to the
              current payment recipient — every action is verifiable on Suiscan and Walrus.
            </p>
          </div>
          <button
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-moss px-6 py-3.5 text-xs font-bold text-lead shadow-flat transition hover:bg-mossdeep hover:-translate-y-0.5"
            onClick={onLaunch}
            type="button"
          >
            Launch console <ArrowRight size={15} />
          </button>
        </section>

        <footer className="mt-12 border-t border-line py-8 text-[11px] leading-5 text-inkmuted">
          Non-custodial Sui Testnet prototype. It does not provide regulated financial services,
          underwriting, credit ratings, securities offerings, investment advice, or fiat custody. Sui is the
          settlement authority; the off-chain index is only a cache.
        </footer>
      </div>
    </div>
  );
}

function Dashboard({
  activeAddress,
  invoices,
  query,
  selectedInvoice,
  stats,
  walletRole,
  onBuy,
  onCreate,
  onList,
  onMarkOverdue,
  onPay,
  onQuery,
  onSelect,
  onShowMarketplace,
}: {
  activeAddress: string;
  invoices: Invoice[];
  query: string;
  selectedInvoice: Invoice | null;
  stats: { pending: number; listed: number; financed: number; paid: number; volume: number };
  walletRole: WalletRole;
  onBuy: (invoice: Invoice) => void;
  onCreate: () => void;
  onList: (invoice: Invoice) => void;
  onMarkOverdue: (invoice: Invoice) => void;
  onPay: (invoice: Invoice) => void;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  onShowMarketplace: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="grid content-start gap-5">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Metric accent="mint" icon={<ReceiptText />} label="Receivables" value={String(invoices.length)} />
          <Metric accent="aqua" icon={<Store />} label="Listed" value={String(stats.listed)} />
          <Metric accent="sun" icon={<Banknote />} label="Financed" value={String(stats.financed)} />
          <Metric accent="coral" icon={<LineChart />} label="Volume" value={compactNumber(stats.volume)} unit={paymentCoin.symbol} />
        </div>

        <div className="overflow-hidden rounded-[1.25rem] border border-line bg-lead shadow-flat">
          <div className="relative overflow-hidden bg-paperalt p-5 text-ink md:p-6 border border-line rounded-[1.25rem]">
            <div className="absolute inset-0 opacity-10 grid-noise" />
            <div className="absolute right-[-8rem] top-[-10rem] h-80 w-80 rounded-full bg-mosssoft/40 blur-3xl" />
            <div className="absolute bottom-[-9rem] left-[-8rem] h-72 w-72 rounded-full bg-sun/10 blur-3xl" />
            <div className="relative z-10 grid items-start gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div>
                <div>
                  <p className="inline-flex rounded-full border border-moss/25 bg-mosssoft px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-moss font-mono">
                    Live payment-right state
                  </p>
                  <h2 className="mt-4 max-w-xl text-balance text-2xl md:text-3xl font-bold tracking-tight text-ink font-poppins leading-tight">
                    Smart payment routing to verified owners.
                  </h2>
                  <p className="mt-3 max-w-lg text-xs leading-5 text-inksecondary font-sans">
                    The settlement interface remains simple. The Sui smart contract handles instant trustless routing: payer funds route directly to the active payment recipient.
                  </p>
                </div>
                <button
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-moss px-5 py-3 text-xs font-poppins font-bold text-lead transition-all duration-150 hover:-translate-y-0.5 shadow-flat hover:bg-mossdeep"
                  onClick={onShowMarketplace}
                >
                  Review financeable invoices <ArrowRight size={14} />
                </button>
              </div>
              {selectedInvoice ? (
                <PaymentRoute invoice={selectedInvoice} />
              ) : (
                <EmptyRouteState onCreate={onCreate} />
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-line bg-lead p-4 shadow-flat md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-ink font-poppins">Receivable pipeline</h2>
              <p className="text-xs text-inksecondary font-sans">Search, inspect, and manage receivable state updates.</p>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-1.5">
              <Search size={14} className="text-inkmuted" />
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-inkmuted/80 text-ink md:w-60 font-sans"
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                placeholder="Search invoices by client or ID"
              />
            </label>
          </div>
          <div className="mt-5 grid gap-2">
            {invoices.length ? (
              invoices.map((invoice) => (
                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  selected={invoice.id === selectedInvoice?.id}
                  activeAddress={activeAddress}
                  walletRole={walletRole}
                  onBuy={onBuy}
                  onList={onList}
                  onPay={onPay}
                  onSelect={onSelect}
                />
              ))
            ) : (
              <EmptyState
                icon={<Search size={18} />}
                title="No receivables match this search"
                body="Clear the search or create a new receivable to continue the workflow."
              />
            )}
          </div>
        </div>
      </section>

      {selectedInvoice ? (
        <InvoiceInspector activeAddress={activeAddress} invoice={selectedInvoice} walletRole={walletRole} onBuy={onBuy} onList={onList} onMarkOverdue={onMarkOverdue} onPay={onPay} />
      ) : (
        <EmptyInspector />
      )}
    </div>
  );
}

function EmptyRouteState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-paperalt/30 p-5 shadow-flat">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-lead text-moss shadow-flat">
        <DatabaseZap size={20} />
      </div>
      <h3 className="mt-5 text-sm font-bold text-ink font-poppins">No receivable selected</h3>
      <p className="mt-2 text-xs leading-5 text-inksecondary">
        No indexed receivable rows yet. Create the first receivable and it will appear here after refresh.
      </p>
      <button
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-moss px-4 py-3 text-xs font-bold text-lead shadow-flat transition hover:-translate-y-0.5 hover:bg-mossdeep"
        onClick={onCreate}
      >
        Create receivable <ArrowRight size={14} />
      </button>
    </div>
  );
}

function EmptyInspector() {
  return (
    <aside className="grid content-start gap-5">
      <div className="rounded-[1.25rem] border border-line bg-lead p-5 shadow-flat">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-paperalt/40 text-moss">
          <ReceiptText size={20} />
        </div>
        <h3 className="mt-5 text-sm font-bold text-ink font-poppins">No database records</h3>
        <p className="mt-2 text-xs leading-5 text-inksecondary">
          Receivables are loaded from the configured index. Once a row exists, this panel will show Sui, Walrus, verification, and activity details.
        </p>
      </div>
    </aside>
  );
}

function PaymentRoute({ invoice }: { invoice: Invoice }) {
  const recipientIsBuyer = invoice.paymentRecipient === wallets.buyer.address;
  return (
    <div className="rounded-2xl border border-line bg-paperalt/30 p-4 shadow-flat">
      <div className="grid gap-2">
        <RouteNode label="Issuer Wallet" value={shortAddress(invoice.issuer)} tone="mint" />
        <div className="ml-5.5 h-6 w-0.5 bg-line" />
        <RouteNode label={recipientIsBuyer ? "Payment recipient: buyer" : "Payment recipient: issuer"} value={shortAddress(invoice.paymentRecipient)} tone={recipientIsBuyer ? "aqua" : "sun"} />
        <div className="ml-5.5 h-6 w-0.5 bg-line" />
        <RouteNode label="Payer completes settlement" value={`${formatToken(invoice.amount)} settlement`} tone="coral" />
      </div>
      <div className="mt-5 rounded-xl border border-moss/15 bg-mosssoft/40 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-moss font-mono uppercase tracking-wider">Recipient Invariant</span>
          <span className="rounded-full bg-mosssoft border border-moss/30 px-2 py-0.5 text-[9px] font-black text-moss font-mono">ENFORCED</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-inksecondary font-sans">
          The smart contract routes funds dynamically to the recipient address. Payer does not hardcode issuer.
        </p>
      </div>
    </div>
  );
}

function RouteNode({ label, value, tone }: { label: string; value: string; tone: "mint" | "aqua" | "sun" | "coral" }) {
  const style = {
    mint: "bg-mosssoft text-moss border-moss/25 shadow-flat",
    aqua: "bg-mosssoft/40 text-aqua border-aqua/25 shadow-flat",
    sun: "bg-sun/10 text-sun border-sun/25 shadow-flat",
    coral: "bg-coral/10 text-coral border-coral/25 shadow-flat",
  }[tone];

  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-11 w-11 place-items-center rounded-2xl border ${style}`}>
        <CircleDollarSign size={18} />
      </div>
      <div>
        <p className="text-xs font-bold text-ink font-sans">{label}</p>
        <p className="text-[10px] text-inkmuted font-mono mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function InvoiceInspector({
  activeAddress,
  invoice,
  walletRole,
  onBuy,
  onList,
  onMarkOverdue,
  onPay,
}: {
  activeAddress: string;
  invoice: Invoice;
  walletRole: WalletRole;
  onBuy: (invoice: Invoice) => void;
  onList: (invoice: Invoice) => void;
  onMarkOverdue: (invoice: Invoice) => void;
  onPay: (invoice: Invoice) => void;
}) {
  const [evidencePreview, setEvidencePreview] = useState<EvidencePackage | null>(null);
  const [evidenceError, setEvidenceError] = useState("");
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);
  const health = healthScore(invoice);
  const hasOnChainObject = isRealSuiId(invoice.objectId);
  const hasTransactionDigest = isRealTransactionDigest(invoice.txDigest);
  const hasWalrusBlob = isRealWalrusBlobId(invoice.blobId);
  const canMarkOverdue = invoice.status === "PENDING" && Boolean(invoice.dueDate) && new Date(invoice.dueDate).getTime() < Date.now();

  async function loadEvidencePreview() {
    if (!hasWalrusBlob) {
      return;
    }

    setIsLoadingEvidence(true);
    setEvidenceError("");

    try {
      const packageData = await downloadEvidencePackage(invoice.blobId);
      setEvidencePreview(packageData);
    } catch (error) {
      setEvidenceError(error instanceof Error ? error.message : "Evidence could not be loaded");
    } finally {
      setIsLoadingEvidence(false);
    }
  }

  return (
    <aside className="grid content-start gap-5">
      {/* Selected object & Health */}
      <div className="rounded-[1.25rem] border border-line bg-lead p-5 shadow-flat">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-inkmuted font-poppins font-semibold">Selected Receivable</p>
            <h2 className="mt-1.5 text-xl font-bold tracking-tight text-ink font-poppins">{invoice.id}</h2>
            <p className="mt-1 text-xs text-inksecondary">{invoice.clientName}</p>
          </div>
          <StatusPill status={invoice.status} />
        </div>

        {/* Health score subcard */}
        <div className="mt-5 rounded-xl bg-paperalt/40 border border-line p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-inkmuted font-poppins font-semibold">Audit Score</p>
              <p className="mt-1 text-4xl font-bold tracking-tight text-ink font-numbers">
                {health.score}
                <span className="text-xs font-mono text-inkmuted">/100</span>
              </p>
            </div>
            <Gauge className="text-moss" size={32} />
          </div>
          <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-paperalt border border-line">
            <div
              className="h-full bg-moss transition-all duration-350"
              style={{ width: `${health.score}%` }}
            />
          </div>
        </div>

        {/* Digital Document Section (Verdacert-style document preview) */}
        <div className="mt-5 p-4 rounded-xl border border-line bg-lead shadow-inner font-mono text-[11px] text-inksecondary relative overflow-hidden">
          <div className="absolute top-2 right-2 flex gap-1">
            <span className={`${hasWalrusBlob ? "bg-mosssoft text-moss border-moss/20" : "bg-paperalt text-inkmuted border-line"} border rounded px-1.5 py-0.5 text-[8px] font-bold tracking-wider uppercase font-mono`}>
              {hasWalrusBlob ? "Walrus Linked" : "Evidence Not Published"}
            </span>
          </div>

          <div className="border-b border-line pb-2 mb-3">
            <p className="text-ink font-bold text-xs uppercase tracking-wide font-serif">Receivable Agreement</p>
            <p className="text-inkmuted text-[9px] mt-0.5 font-mono truncate">Blob: {invoice.blobId}</p>
          </div>

          <div className="grid gap-2 text-[10px]">
            <div className="flex justify-between border-b border-linesoft pb-1">
              <span className="text-inkmuted font-mono">Object ID</span>
              <span className="text-ink text-right max-w-[140px] truncate">{shortAddress(invoice.objectId)}</span>
            </div>
            <div className="flex justify-between border-b border-linesoft pb-1">
              <span className="text-inkmuted font-mono">Amount</span>
              <span className="text-moss font-bold text-xs font-numbers">{formatToken(invoice.amount)}</span>
            </div>
            <div className="flex justify-between border-b border-linesoft pb-1">
              <span className="text-inkmuted font-mono">Due Date</span>
              <span className="text-ink font-mono">{invoice.dueDate}</span>
            </div>
            <div className="flex justify-between border-b border-linesoft pb-1">
              <span className="text-inkmuted font-mono">Issuer</span>
              <span className="text-ink max-w-[140px] truncate">{shortAddress(invoice.issuer)}</span>
            </div>
            <div className="flex justify-between border-b border-linesoft pb-1">
              <span className="text-inkmuted font-mono">Recipient</span>
              <span className="text-moss max-w-[140px] truncate font-bold font-mono">
                {shortAddress(invoice.paymentRecipient)}
              </span>
            </div>
          </div>

          {/* Cryptographic Stamps */}
          <div className="mt-4 pt-3 border-t border-line grid grid-cols-2 gap-2">
            <div className="bg-paperalt/30 border border-line p-2 rounded-lg text-center relative overflow-hidden flex flex-col items-center justify-center min-h-[52px]">
              <span className="text-[8px] uppercase tracking-wider text-inkmuted block">Issuer</span>
              <span className="text-[10px] font-bold text-moss font-mono mt-1 flex items-center gap-1">
                <Check size={10} /> SIGNED
              </span>
              <div className="absolute inset-0 border border-moss/10 rounded-lg opacity-40 transform scale-[0.9] pointer-events-none" />
            </div>

            <div className="bg-paperalt/30 border border-line p-2 rounded-lg text-center relative overflow-hidden flex flex-col items-center justify-center min-h-[52px]">
              <span className="text-[8px] uppercase tracking-wider text-inkmuted block">Buyer</span>
              {invoice.financingStatus === "FINANCED" ? (
                <span className="text-[10px] font-bold text-aqua font-mono mt-1 flex items-center gap-1">
                  <Check size={10} /> FINANCED
                </span>
              ) : (
                <span className="text-[9px] font-bold text-inkmuted/60 font-mono mt-1">
                  PENDING
                </span>
              )}
              {invoice.financingStatus === "FINANCED" && (
                <div className="absolute inset-0 border border-aqua/10 rounded-lg opacity-40 transform scale-[0.9] pointer-events-none" />
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <ActionButton activeAddress={activeAddress} invoice={invoice} walletRole={walletRole} onBuy={onBuy} onList={onList} onPay={onPay} />
          <VerificationLink
            disabled={!hasWalrusBlob}
            href={hasWalrusBlob ? evidenceUrl(invoice.blobId) : undefined}
            label="Inspect Evidence"
          />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            className="rounded-2xl border border-line bg-lead px-4 py-3 text-center text-xs font-bold text-ink shadow-flat transition-all duration-150 hover:bg-paperalt/45"
            onClick={() => downloadInvoicePdf(invoice)}
          >
            Download PDF
          </button>
          <button
            className="rounded-2xl border border-line bg-lead px-4 py-3 text-center text-xs font-bold text-ink shadow-flat transition-all duration-150 hover:bg-paperalt/45 disabled:text-inkmuted/50"
            disabled={!hasWalrusBlob || isLoadingEvidence}
            onClick={loadEvidencePreview}
          >
            {isLoadingEvidence ? "Loading..." : "View evidence"}
          </button>
        </div>

        {canMarkOverdue && (
          <button
            className="mt-2 w-full rounded-2xl border border-coral/25 bg-coral/10 px-4 py-3 text-center text-xs font-bold text-coral shadow-flat transition-all duration-150 hover:bg-coral/15"
            onClick={() => onMarkOverdue(invoice)}
          >
            Mark overdue
          </button>
        )}

        {(evidencePreview || evidenceError) && (
          <div className="mt-4 rounded-xl border border-line bg-paperalt/30 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink font-poppins">Walrus evidence preview</h3>
            {evidenceError ? (
              <div className="mt-2 grid gap-2">
                <p className="text-xs leading-5 text-coral">{evidenceError}</p>
                <p className="text-[11px] leading-5 text-inksecondary">
                  Create a new receivable with evidence publishing enabled to generate a fresh Walrus Testnet blob.
                </p>
              </div>
            ) : evidencePreview ? (
              <div className="mt-3 grid gap-2 text-[10px] text-inksecondary font-mono">
                <EvidencePreviewRow label="Invoice" value={evidencePreview.invoiceNumber} />
                <EvidencePreviewRow label="Client" value={evidencePreview.clientName} />
                <EvidencePreviewRow label="Checksum" value={evidencePreview.metadataChecksum} />
                <EvidencePreviewRow label="File" value={evidencePreview.invoicePdfFileName ?? "Generated PDF"} />
                <EvidencePreviewRow label="PDF blob" value={evidencePreview.invoicePdfBlobId ?? "Not uploaded"} />
                {evidencePreview.invoicePdfBlobId && (
                  <a
                    className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-moss"
                    href={evidenceUrl(evidencePreview.invoicePdfBlobId)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open invoice PDF blob <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-[1.25rem] border border-line bg-lead p-5 shadow-flat">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink font-poppins">Public verification</h3>
            <p className="mt-1 text-xs leading-5 text-inksecondary font-sans">
              {hasOnChainObject
                ? "This receivable includes live IDs that can be checked outside the app."
                : "This receivable has not been published on-chain yet."}
            </p>
          </div>
          <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider font-mono ${hasOnChainObject ? "border-moss/30 bg-mosssoft text-moss" : "border-line bg-paperalt/50 text-inkmuted"}`}>
            {hasOnChainObject ? "On-chain" : "Demo"}
          </span>
        </div>
        <div className="mt-4 grid gap-2">
          <VerificationRow
            disabled={!hasOnChainObject}
            helper={hasOnChainObject ? shortAddress(invoice.objectId) : "No published object yet"}
            href={hasOnChainObject ? suiObjectUrl(invoice.objectId) : undefined}
            label="Sui object"
          />
          <VerificationRow
            disabled={!hasTransactionDigest}
            helper={hasTransactionDigest && invoice.txDigest ? shortAddress(invoice.txDigest) : "No submitted transaction yet"}
            href={hasTransactionDigest && invoice.txDigest ? suiTransactionUrl(invoice.txDigest) : undefined}
            label="Latest transaction"
          />
          <VerificationRow
            disabled={!hasWalrusBlob}
            helper={hasWalrusBlob ? shortAddress(invoice.blobId) : "Evidence package not published"}
            href={hasWalrusBlob ? evidenceUrl(invoice.blobId) : undefined}
            label="Walrus evidence"
          />
        </div>
      </div>

      <div className="rounded-[1.25rem] border border-line bg-lead p-5 shadow-flat">
        <h3 className="text-sm font-bold text-ink font-poppins">Verification checks</h3>
        <div className="mt-4 grid gap-2">
          {health.checks.map((check) => (
            <div key={check.label} className="flex items-center justify-between gap-3 rounded-xl bg-paperalt/30 border border-line px-3 py-2">
              <span className="text-xs text-inksecondary font-sans">{check.label}</span>
              {check.passed ? <Check className="text-moss" size={14} /> : <X className="text-coral" size={14} />}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[1.25rem] border border-line bg-lead p-5 shadow-flat">
        <h3 className="text-sm font-bold text-ink font-poppins">Object activity log</h3>
        <div className="mt-4 grid gap-2">
          {invoice.events.map((event, index) => (
            <div key={`${event}-${index}`} className="flex gap-3 items-start">
              <div className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-paperalt/60 text-[10px] font-mono font-bold text-moss border border-line">
                {String(index + 1).padStart(2, "0")}
              </div>
              <p className="pt-0.5 text-[11px] leading-5 text-inksecondary font-sans">{event}</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function VerificationLink({
  disabled,
  href,
  label,
}: {
  disabled?: boolean;
  href?: string;
  label: string;
}) {
  if (disabled || !href) {
    return (
      <span className="rounded-2xl border border-line bg-paperalt/40 px-4 py-3 text-center text-xs font-bold text-inkmuted/70 shadow-flat">
        {label}
      </span>
    );
  }

  return (
    <a
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-lead px-4 py-3 text-center text-xs font-bold text-ink shadow-flat transition-all duration-150 hover:bg-paperalt/45"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {label} <ExternalLink size={13} />
    </a>
  );
}

function VerificationRow({
  disabled,
  helper,
  href,
  label,
}: {
  disabled?: boolean;
  helper: string;
  href?: string;
  label: string;
}) {
  const content = (
    <>
      <div>
        <p className="text-xs font-bold text-ink font-sans">{label}</p>
        <p className="mt-0.5 max-w-[220px] truncate text-[10px] text-inkmuted font-mono">{helper}</p>
      </div>
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${disabled ? "border-line bg-paperalt/50 text-inkmuted/50" : "border-moss/25 bg-mosssoft text-moss"}`}>
        <ExternalLink size={13} />
      </span>
    </>
  );

  if (disabled || !href) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paperalt/25 px-3 py-2.5 opacity-80">
        {content}
      </div>
    );
  }

  return (
    <a
      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paperalt/30 px-3 py-2.5 transition-all duration-150 hover:border-moss/40 hover:bg-mosssoft/20"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {content}
    </a>
  );
}

function EvidencePreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-linesoft pb-1">
      <span className="text-inkmuted">{label}</span>
      <span className="max-w-[190px] truncate text-right text-ink">{value}</span>
    </div>
  );
}

function EmptyState({
  body,
  icon,
  title,
}: {
  body: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-paperalt/10 p-8 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-line bg-lead text-moss shadow-flat">
        {icon}
      </div>
      <p className="mt-3 text-sm font-bold text-ink font-poppins">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-inksecondary font-sans">{body}</p>
    </div>
  );
}

function InvoiceRow({
  activeAddress,
  invoice,
  selected,
  walletRole,
  onBuy,
  onList,
  onPay,
  onSelect,
}: {
  activeAddress: string;
  invoice: Invoice;
  selected: boolean;
  walletRole: WalletRole;
  onBuy: (invoice: Invoice) => void;
  onList: (invoice: Invoice) => void;
  onPay: (invoice: Invoice) => void;
  onSelect: (id: string) => void;
}) {
  const health = healthScore(invoice);
  return (
    <article
      className={`grid gap-4 rounded-xl border p-4 transition-all duration-150 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${selected ? "border-moss bg-mosssoft/30 text-ink shadow-flat" : "border-line bg-lead hover:border-moss/40 hover:bg-lead"
        }`}
    >
      <button className="text-left" onClick={() => onSelect(invoice.id)}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-sm font-mono">{invoice.id}</p>
          <StatusPill status={invoice.status} compact />
          <FinancePill status={invoice.financingStatus} />
        </div>
        <p className={`mt-2 text-xs font-sans ${selected ? "text-inksecondary" : "text-inksecondary/75"}`}>
          {invoice.clientName} · {invoice.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <MiniChip selected={selected}>{formatToken(invoice.amount)}</MiniChip>
          <MiniChip selected={selected}>Audit {health.score}/100</MiniChip>
          <MiniChip selected={selected}>Recipient {shortAddress(invoice.paymentRecipient)}</MiniChip>
        </div>
      </button>
      <ActionButton activeAddress={activeAddress} invoice={invoice} walletRole={walletRole} onBuy={onBuy} onList={onList} onPay={onPay} />
    </article>
  );
}

function ActionButton({
  activeAddress,
  invoice,
  walletRole,
  onBuy,
  onList,
  onPay,
}: {
  activeAddress: string;
  invoice: Invoice;
  walletRole: WalletRole;
  onBuy: (invoice: Invoice) => void;
  onList: (invoice: Invoice) => void;
  onPay: (invoice: Invoice) => void;
}) {
  if (invoice.status !== "PENDING") {
    return (
      <button disabled className="rounded-xl bg-paperalt/40 border border-line px-4 py-3 text-xs font-bold text-inkmuted/50">
        Settled
      </button>
    );
  }

  if (canListInvoice(invoice, walletRole, activeAddress)) {
    return (
      <button
        className="rounded-xl bg-moss px-4 py-3 text-xs font-bold text-lead shadow-flat hover:bg-mossdeep transition hover:-translate-y-0.5 duration-150"
        onClick={() => onList(invoice)}
      >
        List rights
      </button>
    );
  }

  if (canBuyInvoice(invoice, walletRole, activeAddress)) {
    return (
      <button
        className="rounded-xl bg-moss px-4 py-3 text-xs font-bold text-lead shadow-flat hover:bg-mossdeep transition hover:-translate-y-0.5 duration-150"
        onClick={() => onBuy(invoice)}
      >
        Buy rights
      </button>
    );
  }

  if (canPayInvoice(invoice, walletRole, activeAddress)) {
    return (
      <button
        className="rounded-xl bg-aqua px-4 py-3 text-xs font-bold text-lead shadow-flat hover:bg-moss transition hover:-translate-y-0.5 duration-150"
        onClick={() => onPay(invoice)}
      >
        Pay invoice
      </button>
    );
  }

  return (
    <button disabled className="rounded-xl bg-paperalt/40 border border-line px-4 py-3 text-xs font-bold text-inkmuted/50">
      No action
    </button>
  );
}

function CreateReceivable({
  isCreating,
  onCreate,
}: {
  isCreating: boolean;
  onCreate: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  const [lineItems, setLineItems] = useState<EvidenceLineItem[]>([
    { description: "Mobile app design sprint", quantity: 1, unitPrice: 750 },
  ]);

  const lineItemsTotal = lineItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0,
  );

  function updateLineItem(index: number, patch: Partial<EvidenceLineItem>) {
    setLineItems((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)));
  }

  function addLineItem() {
    setLineItems((current) => [...current, { description: "", quantity: 1, unitPrice: 0 }]);
  }

  function removeLineItem(index: number) {
    setLineItems((current) => (current.length > 1 ? current.filter((_, position) => position !== index) : current));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <form className="rounded-[1.25rem] border border-line bg-[#FFFDF7] p-5 shadow-flat md:p-7" onSubmit={onCreate}>
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-inkmuted font-poppins font-semibold">Mint workflow</p>
            <h2 className="mt-1.5 text-xl font-bold tracking-tight text-ink font-poppins">Create receivable object</h2>
          </div>
          <FileCheck2 className="text-moss" size={32} />
        </div>

        <div className="mb-5 flex gap-3 rounded-2xl border border-sun/25 bg-sun/10 p-4 text-xs leading-5 text-inksecondary">
          <ShieldCheck className="mt-0.5 shrink-0 text-moss" size={17} />
          <p>
            This is a Testnet prototype. Use sample or permissioned invoice data only; production financing, credit decisions, KYB/KYC, and private document handling need a full compliance review.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Client name" name="clientName" defaultValue="Helio Supply" />
          <Field label="Client email" name="clientEmail" type="email" defaultValue="ap@helio.test" />
          <Field label="Due date" name="dueDate" type="date" defaultValue="2026-07-30" />
          <Field
            label="Payer wallet"
            name="payerWallet"
            placeholder="0x..."
            defaultValue={isProductionMode ? "" : wallets.payer.address}
          />
          <label className="grid gap-2 md:col-span-2">
            <span className="text-xs font-bold text-ink font-sans uppercase tracking-wider">Description</span>
            <textarea
              className="min-h-24 rounded-xl border border-line bg-paper text-ink px-4 py-3 text-xs outline-none transition placeholder:text-inkmuted/60 focus:border-moss"
              name="description"
              defaultValue="Mobile app design sprint"
              required
            />
          </label>

          <div className="grid gap-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink font-sans uppercase tracking-wider">Line items</span>
              <button
                className="rounded-lg border border-line bg-lead px-3 py-1.5 text-[11px] font-bold text-ink shadow-flat transition hover:bg-paperalt/50"
                onClick={addLineItem}
                type="button"
              >
                + Add line
              </button>
            </div>
            <div className="grid gap-2">
              {lineItems.map((item, index) => (
                <div className="grid grid-cols-[minmax(0,1fr)_64px_88px_auto] items-center gap-2" key={index}>
                  <input
                    className="min-w-0 rounded-xl border border-line bg-lead px-3 py-2.5 text-xs text-ink outline-none transition focus:border-moss"
                    onChange={(event) => updateLineItem(index, { description: event.target.value })}
                    placeholder="Line description"
                    value={item.description}
                  />
                  <input
                    className="min-w-0 rounded-xl border border-line bg-lead px-3 py-2.5 text-xs text-ink outline-none transition focus:border-moss font-numbers"
                    min="0"
                    onChange={(event) => updateLineItem(index, { quantity: Number(event.target.value) })}
                    step="1"
                    title="Quantity"
                    type="number"
                    value={item.quantity}
                  />
                  <input
                    className="min-w-0 rounded-xl border border-line bg-lead px-3 py-2.5 text-xs text-ink outline-none transition focus:border-moss font-numbers"
                    min="0"
                    onChange={(event) => updateLineItem(index, { unitPrice: Number(event.target.value) })}
                    step="0.01"
                    title={`Unit price in ${paymentCoin.symbol}`}
                    type="number"
                    value={item.unitPrice}
                  />
                  <button
                    className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-lead text-inksecondary shadow-flat transition hover:bg-paperalt/50 hover:text-coral disabled:opacity-40"
                    disabled={lineItems.length === 1}
                    onClick={() => removeLineItem(index)}
                    title="Remove line"
                    type="button"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-line bg-paperalt/40 px-4 py-3">
              <span className="text-[11px] uppercase tracking-wider text-inkmuted font-poppins font-semibold">Invoice total</span>
              <span className="text-sm font-bold text-ink font-numbers">{formatToken(lineItemsTotal)}</span>
            </div>
            <input name="amount" type="hidden" value={lineItemsTotal} />
            <input name="lineItems" type="hidden" value={JSON.stringify(lineItems)} />
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-moss/20 bg-mosssoft/35 p-4 md:col-span-2">
            <DatabaseZap className="mt-1 shrink-0 text-moss" size={18} />
            <span>
              <span className="block text-xs font-bold text-ink font-sans uppercase tracking-wider">Walrus evidence required</span>
              <span className="mt-1 block text-xs leading-5 text-inksecondary">
                Every receivable uploads its evidence package to Walrus Testnet so buyers can review a retrievable record.
              </span>
            </span>
          </div>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-xs font-bold text-ink font-sans uppercase tracking-wider">Invoice file</span>
            <input
              accept="application/pdf,image/png,image/jpeg"
              className="rounded-xl border border-line bg-paper px-4 py-3 text-xs text-ink file:mr-4 file:rounded-lg file:border-0 file:bg-moss file:px-3 file:py-2 file:text-xs file:font-bold file:text-lead"
              name="invoiceFile"
              type="file"
            />
            <span className="text-[11px] leading-5 text-inksecondary">
              Optional. This file, or a generated invoice PDF, is uploaded to Walrus and linked from the evidence package.
            </span>
          </label>
        </div>

        <button
          className="mt-6 rounded-xl bg-moss px-6 py-4 text-xs font-bold text-lead shadow-flat hover:bg-mossdeep transition hover:-translate-y-0.5 duration-150 disabled:bg-paperalt/50 disabled:text-inkmuted/40 disabled:border-line border"
          disabled={isCreating}
        >
          {isCreating ? "Preparing evidence..." : "Prepare receivable"}
        </button>
      </form>

      <div className="grid content-start gap-5">
        <InfoPanel
          icon={<DatabaseZap />}
          title="Evidence first"
          body="Capture payer details, line items, due date, and supporting records before the receivable is offered for financing."
        />
        <InfoPanel
          icon={<ShieldCheck />}
          title="Automatic settlement"
          body="If payment rights are sold, the final invoice payment follows the current rights holder without changing the payer experience."
        />
        <InfoPanel
          icon={<Gauge />}
          title="Buyer confidence"
          body="The health score and verification checks help buyers compare receivables before they purchase payment rights."
        />
      </div>
    </div>
  );
}

function ListReceivableModal({
  invoice,
  onClose,
  onSubmit,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSubmit: (discountPercent: number) => void;
}) {
  const [discount, setDiscount] = useState("10");
  const discountPercent = Number(discount);
  const isValidDiscount = Number.isFinite(discountPercent) && discountPercent >= 0 && discountPercent < 100;
  const buyerPrice = isValidDiscount ? roundAmount(invoice.amount * ((100 - discountPercent) / 100)) : 0;
  const isValidPrice = buyerPrice > 0 && buyerPrice <= invoice.amount;
  const fee = feeBreakdown(buyerPrice);
  const presetDiscounts = [0, 5, 10, 15];

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidDiscount || !isValidPrice) {
      return;
    }

    onSubmit(discountPercent);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 px-4 py-6 backdrop-blur-sm">
      <form
        className="w-full max-w-lg rounded-[1.5rem] border border-line bg-[#FFFDF7] p-5 shadow-lifted md:p-6"
        onSubmit={submitListing}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-moss font-poppins font-semibold">List payment rights</p>
            <h2 className="mt-1.5 text-xl font-bold tracking-tight text-ink font-poppins">{invoice.id}</h2>
            <p className="mt-1 text-xs leading-5 text-inksecondary">
              Choose the buyer discount before signing the Sui listing transaction.
            </p>
          </div>
          <button
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-lead text-inksecondary shadow-flat transition hover:bg-paperalt/50 hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl border border-line bg-paperalt/35 p-4">
          <div className="grid grid-cols-2 gap-3">
            <SmallStat label="Face value" value={formatToken(invoice.amount)} />
            <SmallStat label="Buyer pays" value={isValidPrice ? formatToken(buyerPrice) : "--"} />
          </div>
          <label className="grid gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-ink font-poppins font-semibold">Buyer discount</span>
            <div className="flex items-center rounded-xl border border-line bg-lead px-4 py-3 focus-within:border-moss focus-within:ring-1 focus-within:ring-moss/30">
              <input
                className="min-w-0 flex-1 bg-transparent text-lg font-bold text-ink outline-none font-numbers"
                inputMode="decimal"
                min="0"
                max="99.99"
                onChange={(event) => setDiscount(event.target.value)}
                step="0.01"
                type="number"
                value={discount}
              />
              <span className="text-xs font-bold text-inkmuted font-mono">%</span>
            </div>
          </label>
          <div className="flex flex-wrap gap-2">
            {presetDiscounts.map((preset) => (
              <button
                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
                  discount === String(preset)
                    ? "border-moss/25 bg-mosssoft text-moss"
                    : "border-line bg-lead text-inksecondary hover:bg-paperalt/45 hover:text-ink"
                }`}
                key={preset}
                onClick={() => setDiscount(String(preset))}
                type="button"
              >
                {preset}% discount
              </button>
            ))}
          </div>
          {isValidPrice && (
            <div className="grid gap-1.5 rounded-xl border border-line bg-lead px-3 py-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-inksecondary">Platform fee ({fee.percent}%)</span>
                <span className="font-bold text-ink font-numbers">{formatToken(fee.fee)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-inksecondary">Issuer receives</span>
                <span className="font-bold text-ink font-numbers">{formatToken(fee.issuerNet)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-1.5 text-[10px]">
                <span className="text-inkmuted font-poppins">Fee routes to</span>
                <span className="truncate font-mono text-inksecondary" title={fee.recipient}>
                  {shortAddress(fee.recipient)}
                </span>
              </div>
            </div>
          )}
          {!isValidDiscount || !isValidPrice ? (
            <p className="text-[11px] leading-5 text-coral">
              Enter a discount from 0 up to less than 100. Buyer price must be greater than 0 and no more than face value.
            </p>
          ) : (
            <p className="text-[11px] leading-5 text-inksecondary">
              Buyer receives the right to collect {formatToken(invoice.amount)} later by paying {formatToken(buyerPrice)} now.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="rounded-xl border border-line bg-lead px-5 py-3 text-xs font-bold text-ink shadow-flat transition hover:bg-paperalt/50"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-xl border border-moss bg-moss px-5 py-3 text-xs font-bold text-lead shadow-flat transition hover:bg-mossdeep disabled:border-line disabled:bg-paperalt/50 disabled:text-inkmuted/50"
            disabled={!isValidDiscount || !isValidPrice}
            type="submit"
          >
            Continue to wallet
          </button>
        </div>
      </form>
    </div>
  );
}

function Marketplace({
  activeAddress,
  invoices,
  walletRole,
  onBuy,
  onSelect,
}: {
  activeAddress: string;
  invoices: Invoice[];
  walletRole: WalletRole;
  onBuy: (invoice: Invoice) => void;
  onSelect: (id: string) => void;
}) {
  const listings = invoices.filter((invoice) => invoice.status === "PENDING" && invoice.financingStatus === "LISTED");
  return (
    <section className="rounded-[1.25rem] border border-line bg-[#FFFDF7] p-5 shadow-flat md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-inkmuted font-poppins font-semibold">Financeable supply</p>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight text-ink font-poppins">Marketplace</h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-inksecondary">
            Listed invoices show the buyer discount, health score, and future payment recipient behavior before purchase.
          </p>
        </div>
        <div className="rounded-xl bg-paperalt/60 border border-line px-4 py-3 text-xs font-bold text-ink font-mono">
          {listings.length} listed invoices
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {listings.length ? (
          listings.map((invoice) => (
            <div key={invoice.id} className="rounded-xl border border-line bg-paperalt/20 p-5 hover:border-moss/30 transition-all duration-150">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-ink font-mono text-sm">{invoice.id}</p>
                  <p className="mt-1 text-xs text-inksecondary">{invoice.clientName}</p>
                </div>
                <FinancePill status={invoice.financingStatus} />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <SmallStat label="Face value" value={formatToken(invoice.amount)} />
                <SmallStat label="Buy price" value={formatToken(invoice.financingPrice)} />
                <SmallStat label="Discount" value={`${Math.round((1 - invoice.financingPrice / invoice.amount) * 100)}%`} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-lead px-3 py-2 text-[10px]">
                <span className="text-inkmuted font-poppins">
                  Platform fee {feeBreakdown(invoice.financingPrice).percent}% ·{" "}
                  {formatToken(feeBreakdown(invoice.financingPrice).fee)}
                </span>
                <span className="truncate font-mono text-inksecondary" title={feeBreakdown(invoice.financingPrice).recipient}>
                  → {shortAddress(feeBreakdown(invoice.financingPrice).recipient)}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  className="rounded-xl border border-line bg-lead hover:bg-paperalt/45 text-ink px-4 py-3 text-xs font-bold transition-all duration-150 shadow-flat"
                  onClick={() => onSelect(invoice.id)}
                >
                  Inspect
                </button>
                <button
                  disabled={!canBuyInvoice(invoice, walletRole, activeAddress)}
                  className="rounded-xl bg-moss px-4 py-3 text-xs font-bold text-lead shadow-flat hover:bg-mossdeep transition hover:-translate-y-0.5 duration-150 disabled:bg-paperalt/50 disabled:text-inkmuted/40 disabled:border-line border"
                  onClick={() => onBuy(invoice)}
                >
                  Buy payment rights
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="lg:col-span-2">
            <EmptyState
              icon={<Store size={18} />}
              title="No invoices listed yet"
              body={isProductionMode ? "A connected issuer wallet must list a live receivable before it appears here." : "Switch to Issuer, select a pending invoice, and use List rights to create a local marketplace listing."}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function Portfolio({
  activeAddress,
  invoices,
  walletAddress,
  walletLabel,
}: {
  activeAddress: string;
  invoices: Invoice[];
  walletAddress: string;
  walletLabel: string;
}) {
  const portfolioAddress = isProductionMode ? activeAddress : walletAddress;
  const owned = portfolioAddress ? invoices.filter((invoice) => sameAddress(invoice.buyer ?? "", portfolioAddress)) : [];
  const expectedSettlement = owned.filter((invoice) => invoice.status === "PENDING").reduce((sum, invoice) => sum + invoice.amount, 0);
  return (
    <section className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric accent="mint" icon={<WalletCards />} label="Owned rights" value={String(owned.length)} />
        <Metric accent="aqua" icon={<Landmark />} label="Expected settlement" value={formatToken(expectedSettlement)} />
        <Metric accent="sun" icon={<Clock3 />} label={isProductionMode ? "Connected wallet" : "Current role"} value={isProductionMode ? (activeAddress ? shortAddress(activeAddress) : "Connect wallet") : walletLabel} />
      </div>
      <div className="rounded-[1.25rem] border border-line bg-[#FFFDF7] p-5 shadow-flat md:p-7">
        <h2 className="text-lg font-bold tracking-tight text-ink font-poppins">Buyer positions</h2>
        <div className="mt-5 grid gap-2">
          {owned.length ? (
            owned.map((invoice) => (
              <div key={invoice.id} className="rounded-xl border border-line bg-paperalt/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-ink font-mono text-sm">{invoice.id}</p>
                    <p className="mt-1 text-xs text-inksecondary">{invoice.clientName}</p>
                  </div>
                  <div className="flex gap-2">
                    <StatusPill status={invoice.status} />
                    <MiniChip>{formatToken(invoice.amount)}</MiniChip>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={<WalletCards size={18} />}
              title="No buyer positions yet"
              body="Switch to Buyer and purchase a listed receivable to see expected settlement positions here."
            />
          )}
        </div>
      </div>
    </section>
  );
}

function NavItem({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-poppins font-semibold transition-all duration-200 ${active ? "bg-mosssoft text-moss shadow-flat font-black" : "text-inksecondary hover:bg-paperalt/50 hover:text-ink"
        }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function SuiWalletPanel() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const wallet = useCurrentWallet();
  const network = useCurrentNetwork();
  const connection = useWalletConnection();

  async function disconnectWallet() {
    try {
      await dAppKit.disconnectWallet();
    } catch (error) {
      console.warn("Could not disconnect wallet", error);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-paperalt/30 px-4 py-2 flex flex-col justify-center min-h-[52px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold text-inkmuted uppercase tracking-wider font-poppins font-semibold">Sui Network</span>
        <span className={`h-1.5 w-1.5 rounded-full ${connection.isConnected ? "bg-moss animate-pulse" : "bg-inkmuted/30"}`} />
      </div>
      <div className="flex flex-col gap-2 mt-1 sm:flex-row sm:items-center">
        {account ? (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 rounded-xl bg-moss px-3 py-2 text-lead shadow-flat">
              <p className="truncate text-[11px] font-black font-poppins">{wallet?.name ?? "Connected"}</p>
              <p className="truncate text-[10px] font-mono">{shortAddress(account.address)} · {network}</p>
            </div>
            <button
              className="rounded-xl border border-line bg-lead px-3 py-2 text-[10px] font-bold text-inksecondary shadow-flat transition hover:bg-paperalt/50 hover:text-ink"
              onClick={disconnectWallet}
              type="button"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <>
            <ConnectButton />
            <p className="max-w-44 text-[10px] leading-4 text-inkmuted/60 font-mono">Wallet offline</p>
          </>
        )}
      </div>
    </div>
  );
}

function MobileNav({ page, onChange }: { page: Page; onChange: (page: Page) => void }) {
  const items: Array<{ page: Page; label: string; icon: React.ReactNode }> = [
    { page: "dashboard", label: "Center", icon: <LayoutDashboard size={16} /> },
    { page: "create", label: "Create", icon: <FilePlus2 size={16} /> },
    { page: "marketplace", label: "Market", icon: <Store size={16} /> },
    { page: "portfolio", label: "Portfolio", icon: <WalletCards size={16} /> },
  ];

  return (
    <nav className="glass-card sticky top-[10.8rem] z-10 mb-5 flex gap-2 overflow-x-auto rounded-[1.25rem] border border-line p-2 shadow-flat lg:hidden bg-lead/90 backdrop-blur-md">
      {items.map((item) => (
        <button
          key={item.page}
          className={`flex min-w-max items-center gap-2 rounded-2xl px-3 py-2 text-sm font-poppins font-semibold transition-all duration-200 ${page === item.page ? "bg-mosssoft text-moss shadow-flat font-black" : "text-inksecondary hover:bg-paperalt/50 hover:text-ink"
            }`}
          onClick={() => onChange(item.page)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function Metric({
  accent,
  icon,
  label,
  value,
  unit,
}: {
  accent: "mint" | "aqua" | "sun" | "coral";
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
}) {
  const style = {
    mint: "bg-mosssoft text-moss border-moss/25",
    aqua: "bg-mosssoft/40 text-aqua border-aqua/25",
    sun: "bg-sun/10 text-sun border-sun/25",
    coral: "bg-coral/10 text-coral border-coral/25",
  }[accent];
  return (
    <div className="flex min-h-[92px] items-center gap-3 rounded-[1.1rem] border border-line bg-lead p-3.5 shadow-flat transition-all duration-300 hover:border-moss/40">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border [&>svg]:h-5 [&>svg]:w-5 ${style}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-inkmuted font-poppins font-semibold">{label}</p>
        <p className="mt-1 flex items-baseline gap-1 text-ink">
          <span className="min-w-0 truncate text-2xl font-bold tracking-tight font-numbers">{value}</span>
          {unit && <span className="shrink-0 text-sm font-bold text-inkmuted font-numbers">{unit}</span>}
        </p>
      </div>
    </div>
  );
}

function Field({
  defaultValue,
  label,
  name,
  placeholder,
  type = "text",
}: {
  defaultValue: string;
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-bold text-ink font-poppins font-semibold uppercase tracking-wider">{label}</span>
      <input
        className="rounded-xl border border-line bg-lead text-ink px-4 py-3 text-sm outline-none transition focus:border-moss focus:ring-1 focus:ring-moss/30 placeholder:text-inkmuted/80"
        name={name}
        placeholder={placeholder}
        type={type}
        defaultValue={defaultValue}
        required
      />
    </label>
  );
}

function InfoPanel({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-[2rem] border border-line bg-lead p-5 shadow-flat">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-moss/25 bg-mosssoft text-moss">{icon}</div>
      <h3 className="mt-5 text-base font-bold text-ink font-poppins">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-inksecondary">{body}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paperalt/40 border border-line p-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-inkmuted font-poppins font-semibold">{label}</p>
      <p className="mt-1 truncate font-bold text-ink text-sm font-numbers">{value}</p>
    </div>
  );
}

function StatusPill({ status, compact = false }: { status: InvoiceStatus; compact?: boolean }) {
  const style = {
    PENDING: "bg-sun/10 text-sun border-sun/25 font-numbers font-semibold",
    PAID: "bg-mosssoft text-moss border-moss/25 font-numbers font-semibold",
    OVERDUE: "bg-coral/10 text-coral border-coral/20 font-numbers font-semibold",
  }[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] border ${style}`}>{compact ? status.slice(0, 4) : status}</span>;
}

function FinancePill({ status }: { status: FinancingStatus }) {
  const style = {
    NOT_LISTED: "bg-paperalt/60 text-inkmuted border-line font-poppins font-semibold",
    LISTED: "bg-mosssoft/40 text-aqua border-aqua/25 font-poppins font-semibold",
    FINANCED: "bg-mosssoft text-moss border-moss/25 font-poppins font-semibold",
    CANCELLED: "bg-coral/10 text-coral border-coral/20 font-poppins font-semibold",
  }[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] border ${style}`}>{status.replace("_", " ")}</span>;
}

function MiniChip({ children, selected = false }: { children: React.ReactNode; selected?: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition ${selected ? "bg-mosssoft text-moss border-moss/20 font-numbers" : "bg-paperalt/50 text-inksecondary border-line font-numbers"
      }`}>
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-b-0 last:pb-0">
      <span className="text-xs text-inkmuted font-poppins">{label}</span>
      <span className="max-w-[190px] truncate text-right text-xs font-bold text-ink font-numbers">{value}</span>
    </div>
  );
}

export default App;
