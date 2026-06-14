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
import { formatCompactSui, formatSui, shortAddress } from "./lib/format";
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
import type { EvidencePackage } from "./types/evidence";
import type { FinancingStatus, Invoice, InvoiceStatus, Page, WalletRole } from "./types/receivable";

function readInvoiceIdFromLocation() {
  const match = window.location.pathname.match(/^\/invoice\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : "";
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
  const [page, setPage] = useState<Page>("dashboard");
  const [walletRole, setWalletRole] = useState<WalletRole>("issuer");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(readInvoiceIdFromLocation());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [isCreating, setIsCreating] = useState(false);

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
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: buildTransaction(),
      });

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
      const createdInvoice = createdObjects.find((object) => result.Transaction.objectTypes[object.objectId] === expectedType);

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

  function financingPriceFor(invoice: Invoice) {
    return Math.round(invoice.amount * 0.9 * 1_000_000_000) / 1_000_000_000;
  }

  async function listInvoice(invoice: Invoice) {
    if (isProductionMode && !canListInvoice(invoice, walletRole, activeAddress)) {
      notify("Connect the issuer wallet to list this receivable.");
      return;
    }

    const isLiveInvoice = hasRealObjectId(invoice);
    const financingPrice = financingPriceFor(invoice);
    const digest = isLiveInvoice
      ? await trySubmitTransaction("List transaction", () =>
        buildListForFinancingTx({
          invoiceObjectId: invoice.objectId,
          financingPriceSui: financingPrice,
          discountBps: 1000,
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
    notify(`${invoice.id} listed at 10% discount`);
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
            ? `Paid ${formatSui(invoice.amount)} to ${shortAddress(invoice.paymentRecipient)}`
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
    const amount = Number(form.get("amount"));
    const dueDate = String(form.get("dueDate"));
    const payerWallet = String(form.get("payerWallet") ?? "").trim();
    const shouldUploadEvidence = form.get("uploadEvidence") === "on";
    const invoiceFile = form.get("invoiceFile");
    const selectedInvoiceFile = invoiceFile instanceof File && invoiceFile.size > 0 ? invoiceFile : null;
    const issuerAddress = account?.address ?? wallets.issuer.address;
    const payerAddress = payerWallet || (isProductionMode ? "" : wallets.payer.address);

    if (isProductionMode && !isSuiAddress(payerAddress)) {
      notify("Enter a valid payer wallet address before creating a receivable.");
      return;
    }

    setIsCreating(true);

    let blobId = `mock_walrus_blob_${next}`;
    let blobObjectId: string | undefined;
    let invoicePdfBlobId: string | undefined;
    let evidenceEvent = "Evidence package prepared";

    if (shouldUploadEvidence) {
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
    });

    if (shouldUploadEvidence) {
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
      evidence: evidence({ complete: Boolean(invoicePdfBlobId), unpaid: true }),
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

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <div className="fixed inset-0 -z-10 grid-noise opacity-30" />
      <div className="fixed left-[-18rem] top-[-18rem] -z-10 h-[38rem] w-[38rem] rounded-full bg-mosssoft/20 blur-[100px]" />
      <div className="fixed bottom-[-20rem] right-[-12rem] -z-10 h-[36rem] w-[36rem] rounded-full bg-sun/10 blur-[100px]" />

      <div className="mx-auto flex min-h-screen w-full max-w-[1540px] gap-5 p-4 lg:p-5">
        <aside className="hidden w-[248px] shrink-0 self-start rounded-[1.1rem] bg-lead border border-line p-3 text-ink shadow-flat lg:block">
          <div className="rounded-[1rem] border border-line bg-paperalt/30 p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-moss text-base font-black text-lead shadow-flat">
                IN
              </div>
              <div>
                <p className="text-base font-bold tracking-tight text-ink font-poppins">InvoNFT</p>
                <p className="text-[9px] text-inkmuted font-mono uppercase tracking-wider">Receivables console</p>
              </div>
            </div>

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
            <NavItem active={page === "dashboard"} icon={<LayoutDashboard size={16} />} label="Command Center" onClick={() => setPage("dashboard")} />
            <NavItem active={page === "create"} icon={<FilePlus2 size={16} />} label="Create Receivable" onClick={() => setPage("create")} />
            <NavItem active={page === "marketplace"} icon={<Store size={16} />} label="Marketplace" onClick={() => setPage("marketplace")} />
            <NavItem active={page === "portfolio"} icon={<WalletCards size={16} />} label="Buyer Portfolio" onClick={() => setPage("portfolio")} />
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
                onClick={() => setPage("create")}
              >
                New receivable
              </button>
            </div>
          </header>

          <MobileNav page={page} onChange={setPage} />

          {page === "dashboard" && (
            <Dashboard
              invoices={filteredInvoices}
              query={query}
              selectedInvoice={selectedInvoice}
              stats={stats}
              walletRole={walletRole}
              activeAddress={activeAddress}
              onBuy={buyInvoice}
              onList={listInvoice}
              onMarkOverdue={markInvoiceOverdue}
              onPay={payInvoice}
              onCreate={() => setPage("create")}
              onQuery={setQuery}
              onSelect={selectInvoice}
              onShowMarketplace={() => setPage("marketplace")}
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
          <Metric accent="coral" icon={<LineChart />} label="Volume" value={formatCompactSui(stats.volume)} />
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
        <RouteNode label="Payer completes settlement" value={`${formatSui(invoice.amount)} settlement`} tone="coral" />
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
            <span className="bg-mosssoft text-moss border border-moss/20 rounded px-1.5 py-0.5 text-[8px] font-bold tracking-wider uppercase font-mono">
              Walrus Certified
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
              <span className="text-moss font-bold text-xs font-numbers">{formatSui(invoice.amount)}</span>
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
              <p className="mt-2 text-xs leading-5 text-coral">{evidenceError}</p>
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
          <MiniChip selected={selected}>{formatSui(invoice.amount)}</MiniChip>
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
          <Field label="Amount in SUI" name="amount" type="number" defaultValue="750" />
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
              className="min-h-32 rounded-xl border border-line bg-paper text-ink px-4 py-3 text-xs outline-none transition placeholder:text-inkmuted/60 focus:border-moss"
              name="description"
              defaultValue="Mobile app design sprint"
              required
            />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-line bg-paperalt/30 p-4 md:col-span-2">
            <input className="mt-1.5 h-4 w-4 accent-moss rounded border-line" name="uploadEvidence" type="checkbox" />
            <span>
              <span className="block text-xs font-bold text-ink font-sans uppercase tracking-wider">Publish evidence package</span>
              <span className="mt-1 block text-xs leading-5 text-inksecondary">
                Creates a retrievable evidence record for buyer review. Leave off to prepare the receivable without upload.
              </span>
            </span>
          </label>
          <label className="grid gap-2 md:col-span-2">
            <span className="text-xs font-bold text-ink font-sans uppercase tracking-wider">Invoice file</span>
            <input
              accept="application/pdf,image/png,image/jpeg"
              className="rounded-xl border border-line bg-paper px-4 py-3 text-xs text-ink file:mr-4 file:rounded-lg file:border-0 file:bg-moss file:px-3 file:py-2 file:text-xs file:font-bold file:text-lead"
              name="invoiceFile"
              type="file"
            />
            <span className="text-[11px] leading-5 text-inksecondary">
              Optional. If evidence publishing is enabled, this file is uploaded to Walrus and linked from the receivable evidence package.
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
                <SmallStat label="Face value" value={formatSui(invoice.amount)} />
                <SmallStat label="Buy price" value={formatSui(invoice.financingPrice)} />
                <SmallStat label="Discount" value={`${Math.round((1 - invoice.financingPrice / invoice.amount) * 100)}%`} />
              </div>
              <div className="mt-5 flex gap-2">
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
        <Metric accent="aqua" icon={<Landmark />} label="Expected settlement" value={formatSui(expectedSettlement)} />
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
                    <MiniChip>{formatSui(invoice.amount)}</MiniChip>
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

function Metric({ accent, icon, label, value }: { accent: "mint" | "aqua" | "sun" | "coral"; icon: React.ReactNode; label: string; value: string }) {
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
        <p className="whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.12em] text-inkmuted font-poppins font-semibold">{label}</p>
        <p className="mt-1 whitespace-nowrap text-2xl font-bold tracking-tight text-ink font-numbers">{value}</p>
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
