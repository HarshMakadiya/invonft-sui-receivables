import {
  useCurrentAccount,
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
  FileCheck2,
  FilePlus2,
  Gauge,
  Landmark,
  LayoutDashboard,
  LineChart,
  LockKeyhole,
  Network,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { starterInvoices, evidence, wallets } from "./data/mockReceivables";
import { buildEvidencePackage } from "./lib/evidencePackage";
import { formatCompactSui, formatSui, shortAddress } from "./lib/format";
import { healthScore } from "./lib/healthScore";
import { getReceivableContractReadiness } from "./lib/receivableContract";
import { evidenceUrl, uploadEvidencePackage, walrusConfig } from "./lib/walrus";
import type { DemoWallet, FinancingStatus, Invoice, InvoiceStatus, Page, WalletRole } from "./types/receivable";

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [walletRole, setWalletRole] = useState<WalletRole>("issuer");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("INV-0001");
  const [invoices, setInvoices] = useState<Invoice[]>(starterInvoices);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? invoices[0];
  const wallet = wallets[walletRole];
  const contractReadiness = getReceivableContractReadiness();

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

  function updateInvoice(id: string, update: (invoice: Invoice) => Invoice) {
    setInvoices((current) => current.map((invoice) => (invoice.id === id ? update(invoice) : invoice)));
  }

  function listInvoice(invoice: Invoice) {
    updateInvoice(invoice.id, (item) => ({
      ...item,
      financingStatus: "LISTED",
      financingPrice: Math.floor(item.amount * 0.9),
      events: [...item.events, "Issuer listed payment rights for financing"],
    }));
    notify(`${invoice.id} listed at 10% discount`);
  }

  function buyInvoice(invoice: Invoice) {
    updateInvoice(invoice.id, (item) => ({
      ...item,
      financingStatus: "FINANCED",
      paymentRecipient: wallet.address,
      buyer: wallet.address,
      events: [...item.events, `Payment rights moved to ${wallet.label}`],
    }));
    notify(`Payment recipient changed to ${wallet.label}`);
  }

  function payInvoice(invoice: Invoice) {
    updateInvoice(invoice.id, (item) => ({
      ...item,
      status: "PAID",
      evidence: { ...item.evidence, unpaid: false },
      events: [...item.events, `Paid ${formatSui(item.amount)} to ${shortAddress(item.paymentRecipient)}`],
    }));
    notify(`Funds routed to ${shortAddress(invoice.paymentRecipient)}`);
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = invoices.length + 1;
    const id = `INV-${String(next).padStart(4, "0")}`;
    const clientName = String(form.get("clientName"));
    const clientEmail = String(form.get("clientEmail"));
    const description = String(form.get("description"));
    const amount = Number(form.get("amount"));
    const dueDate = String(form.get("dueDate"));
    const shouldUploadEvidence = form.get("uploadEvidence") === "on";

    setIsCreating(true);

    const evidencePackage = await buildEvidencePackage({
      invoiceNumber: id,
      clientName,
      clientEmail,
      description,
      amountSui: amount,
      dueDate,
      payerWalletPresent: true,
      pdfUploaded: false,
    });

    let blobId = `mock_walrus_blob_${next}`;
    let blobObjectId: string | undefined;
    let evidenceEvent = "Evidence package prepared locally";

    if (shouldUploadEvidence) {
      try {
        const upload = await uploadEvidencePackage(evidencePackage);
        blobId = upload.blobId;
        blobObjectId = upload.blobObjectId;
        evidenceEvent = "Evidence package uploaded to Walrus Testnet";
      } catch (error) {
        const message = error instanceof Error ? error.message : "Walrus upload failed";
        evidenceEvent = `Walrus upload skipped: ${message}`;
        notify("Walrus upload failed; created local demo invoice.");
      }
    }

    const invoice: Invoice = {
      id,
      objectId: `0xmock...${next}`,
      clientName,
      clientEmail,
      description,
      amount,
      dueDate,
      issuer: wallets.issuer.address,
      payer: wallets.payer.address,
      paymentRecipient: wallets.issuer.address,
      buyer: null,
      status: "PENDING",
      financingStatus: "NOT_LISTED",
      financingPrice: 0,
      blobId,
      blobObjectId,
      metadataChecksum: evidencePackage.metadataChecksum,
      evidence: evidence({ complete: true, unpaid: true }),
      events: ["Receivable object drafted", evidenceEvent],
    };

    setInvoices((current) => [invoice, ...current]);
    setSelectedInvoiceId(invoice.id);
    setPage("dashboard");
    setIsCreating(false);
    notify(`${invoice.id} created`);
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="fixed inset-0 -z-10 grid-noise opacity-60" />
      <div className="fixed left-[-18rem] top-[-18rem] -z-10 h-[38rem] w-[38rem] rounded-full bg-mint/25 blur-3xl" />
      <div className="fixed bottom-[-20rem] right-[-12rem] -z-10 h-[36rem] w-[36rem] rounded-full bg-aqua/25 blur-3xl" />

      <div className="mx-auto flex min-h-screen w-full max-w-[1540px] gap-5 p-4 lg:p-5">
        <aside className="hidden w-[286px] shrink-0 rounded-[2rem] bg-ink p-4 text-white shadow-lifted lg:block">
          <div className="rounded-[1.55rem] border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mint text-lg font-black text-ink shadow-glow">
                IN
              </div>
              <div>
                <p className="text-lg font-black">InvoNFT</p>
                <p className="text-xs text-white/55">Receivables console</p>
              </div>
            </div>
            <div className="mt-5 rounded-2xl bg-white/[0.06] p-3">
              <p className="text-xs uppercase tracking-[0.22em] text-white/45">Active role</p>
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-ink px-3 py-2 text-sm text-white outline-none"
                value={walletRole}
                onChange={(event) => setWalletRole(event.target.value as WalletRole)}
              >
                {Object.entries(wallets).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <nav className="mt-5 grid gap-2">
            <NavItem active={page === "dashboard"} icon={<LayoutDashboard size={18} />} label="Command Center" onClick={() => setPage("dashboard")} />
            <NavItem active={page === "create"} icon={<FilePlus2 size={18} />} label="Create Receivable" onClick={() => setPage("create")} />
            <NavItem active={page === "marketplace"} icon={<Store size={18} />} label="Marketplace" onClick={() => setPage("marketplace")} />
            <NavItem active={page === "portfolio"} icon={<WalletCards size={18} />} label="Buyer Portfolio" onClick={() => setPage("portfolio")} />
          </nav>

          <div className="mt-5 rounded-[1.6rem] border border-mint/30 bg-mint/10 p-4">
            <div className="flex items-center gap-2 text-mint">
              <Sparkles size={16} />
              <p className="text-sm font-bold">Deployment note</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-white/70">
              Cloudflare Pages for fast demo hosting. Walrus Sites can be added for a Sui-native static deployment.
            </p>
          </div>
          <div className="mt-3 rounded-[1.6rem] border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center gap-2 text-white">
              <ShieldCheck size={16} />
              <p className="text-sm font-bold">Contract config</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-white/65">
              {contractReadiness.ready
                ? "Ready for transaction builders."
                : `Waiting for ${contractReadiness.missing.length} env value${contractReadiness.missing.length === 1 ? "" : "s"}.`}
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="glass sticky top-4 z-20 mb-5 flex flex-col gap-4 rounded-[1.65rem] border border-white p-4 shadow-lifted md:flex-row md:items-center md:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-moss/55">
                <Network size={14} /> Sui testnet workspace
              </p>
              <h1 className="mt-2 text-balance text-2xl font-black tracking-[-0.04em] md:text-4xl">
                Programmable receivables, controlled from one console.
              </h1>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SuiWalletPanel />
              <label className="rounded-2xl border border-line bg-white px-4 py-3">
                <span className="block text-xs font-bold text-ink/45">Demo role</span>
                <select
                  className="mt-1 min-w-32 bg-transparent font-black outline-none"
                  value={walletRole}
                  onChange={(event) => setWalletRole(event.target.value as WalletRole)}
                >
                  {Object.entries(wallets).map(([key, item]) => (
                    <option key={key} value={key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="rounded-2xl bg-ink px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-moss"
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
              onBuy={buyInvoice}
              onList={listInvoice}
              onPay={payInvoice}
              onQuery={setQuery}
              onSelect={setSelectedInvoiceId}
              onShowMarketplace={() => setPage("marketplace")}
            />
          )}
          {page === "create" && <CreateReceivable isCreating={isCreating} onCreate={createInvoice} />}
          {page === "marketplace" && (
            <Marketplace invoices={invoices} walletRole={walletRole} onBuy={buyInvoice} onSelect={setSelectedInvoiceId} />
          )}
          {page === "portfolio" && <Portfolio invoices={invoices} wallet={wallet} />}
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
  invoices,
  query,
  selectedInvoice,
  stats,
  walletRole,
  onBuy,
  onList,
  onPay,
  onQuery,
  onSelect,
  onShowMarketplace,
}: {
  invoices: Invoice[];
  query: string;
  selectedInvoice: Invoice;
  stats: { pending: number; listed: number; financed: number; paid: number; volume: number };
  walletRole: WalletRole;
  onBuy: (invoice: Invoice) => void;
  onList: (invoice: Invoice) => void;
  onPay: (invoice: Invoice) => void;
  onQuery: (value: string) => void;
  onSelect: (id: string) => void;
  onShowMarketplace: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-4">
          <Metric accent="mint" icon={<ReceiptText />} label="Receivables" value={String(invoices.length)} />
          <Metric accent="aqua" icon={<Store />} label="Listed" value={String(stats.listed)} />
          <Metric accent="sun" icon={<Banknote />} label="Financed" value={String(stats.financed)} />
          <Metric accent="coral" icon={<LineChart />} label="Volume" value={formatCompactSui(stats.volume)} />
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-line bg-white shadow-lifted">
          <div className="relative min-h-[360px] overflow-hidden bg-ink p-5 text-white md:p-7">
            <div className="absolute inset-0 opacity-40 grid-noise" />
            <div className="absolute right-[-8rem] top-[-10rem] h-80 w-80 rounded-full bg-mint/30 blur-3xl" />
            <div className="absolute bottom-[-9rem] left-[-8rem] h-72 w-72 rounded-full bg-aqua/25 blur-3xl" />
            <div className="relative z-10 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
              <div>
                <p className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-mint">
                  Live payment-right state
                </p>
                <h2 className="mt-5 max-w-xl text-balance text-4xl font-black tracking-[-0.06em] md:text-5xl">
                  Route the final payment to whoever owns the rights.
                </h2>
                <p className="mt-5 max-w-lg text-base leading-7 text-white/68">
                  The invoice is still simple for the payer. The Sui object decides whether funds go to the issuer or the buyer.
                </p>
                <button
                  className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-mint px-5 py-3 text-sm font-black text-ink transition hover:-translate-y-0.5"
                  onClick={onShowMarketplace}
                >
                  Review financeable invoices <ArrowRight size={16} />
                </button>
              </div>
              <PaymentRoute invoice={selectedInvoice} />
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-line bg-white p-4 shadow-lifted md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.03em]">Receivable pipeline</h2>
              <p className="text-sm text-ink/55">Search, inspect, and trigger the core demo actions.</p>
            </div>
            <label className="flex items-center gap-2 rounded-2xl border border-line bg-paper px-3 py-2">
              <Search size={16} className="text-ink/45" />
              <input
                className="w-full bg-transparent text-sm outline-none placeholder:text-ink/35 md:w-60"
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                placeholder="Search invoices"
              />
            </label>
          </div>
          <div className="mt-5 grid gap-3">
            {invoices.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                selected={invoice.id === selectedInvoice.id}
                walletRole={walletRole}
                onBuy={onBuy}
                onList={onList}
                onPay={onPay}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </section>

      <InvoiceInspector invoice={selectedInvoice} walletRole={walletRole} onBuy={onBuy} onList={onList} onPay={onPay} />
    </div>
  );
}

function PaymentRoute({ invoice }: { invoice: Invoice }) {
  const recipientIsBuyer = invoice.paymentRecipient === wallets.buyer.address;
  return (
    <div className="rounded-[1.8rem] border border-white/15 bg-white/[0.08] p-4 backdrop-blur">
      <div className="grid gap-3">
        <RouteNode label="Issuer" value={shortAddress(invoice.issuer)} tone="mint" />
        <div className="ml-5 h-8 w-px bg-white/20" />
        <RouteNode label={recipientIsBuyer ? "Payment recipient: buyer" : "Payment recipient: issuer"} value={shortAddress(invoice.paymentRecipient)} tone={recipientIsBuyer ? "aqua" : "sun"} />
        <div className="ml-5 h-8 w-px bg-white/20" />
        <RouteNode label="Payer signs pay_invoice()" value={`${formatSui(invoice.amount)} settlement`} tone="coral" />
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-white/55">Invariant</span>
          <span className="rounded-full bg-mint px-3 py-1 text-xs font-black text-ink">PASS</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-white/75">
          pay_invoice() routes to payment_recipient, never blindly to issuer.
        </p>
      </div>
    </div>
  );
}

function RouteNode({ label, value, tone }: { label: string; value: string; tone: "mint" | "aqua" | "sun" | "coral" }) {
  const color = {
    mint: "bg-mint text-ink",
    aqua: "bg-aqua text-ink",
    sun: "bg-sun text-ink",
    coral: "bg-coral text-white",
  }[tone];

  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-11 w-11 place-items-center rounded-2xl ${color}`}>
        <CircleDollarSign size={20} />
      </div>
      <div>
        <p className="text-sm font-black">{label}</p>
        <p className="text-xs text-white/55">{value}</p>
      </div>
    </div>
  );
}

function InvoiceInspector({
  invoice,
  walletRole,
  onBuy,
  onList,
  onPay,
}: {
  invoice: Invoice;
  walletRole: WalletRole;
  onBuy: (invoice: Invoice) => void;
  onList: (invoice: Invoice) => void;
  onPay: (invoice: Invoice) => void;
}) {
  const health = healthScore(invoice);
  return (
    <aside className="grid content-start gap-5">
      <div className="rounded-[2rem] border border-line bg-white p-5 shadow-lifted">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-ink/40">Selected object</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">{invoice.id}</h2>
            <p className="mt-1 text-sm text-ink/55">{invoice.clientName}</p>
          </div>
          <StatusPill status={invoice.status} />
        </div>

        <div className="mt-5 rounded-3xl bg-paper p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-ink/40">Health score</p>
              <p className="mt-1 text-5xl font-black tracking-[-0.07em]">{health.score}</p>
            </div>
            <Gauge className="text-moss" size={42} />
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-gradient-to-r from-mint to-aqua" style={{ width: `${health.score}%` }} />
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <Fact label="Amount" value={formatSui(invoice.amount)} />
          <Fact label="Due date" value={invoice.dueDate} />
          <Fact label="Payment recipient" value={shortAddress(invoice.paymentRecipient)} />
          <Fact label="Walrus blob" value={invoice.blobId} />
          <Fact label="Checksum" value={invoice.metadataChecksum ?? "Not generated"} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <ActionButton invoice={invoice} walletRole={walletRole} onBuy={onBuy} onList={onList} onPay={onPay} />
          <a
            className="rounded-2xl border border-line px-4 py-3 text-center text-sm font-black transition hover:border-ink"
            href={evidenceUrl(invoice.blobId)}
            rel="noreferrer"
            target="_blank"
          >
            Evidence
          </a>
        </div>
      </div>

      <div className="rounded-[2rem] border border-line bg-white p-5 shadow-lifted">
        <h3 className="text-lg font-black">Verification checks</h3>
        <div className="mt-4 grid gap-2">
          {health.checks.map((check) => (
            <div key={check.label} className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-3 py-2">
              <span className="text-sm text-ink/65">{check.label}</span>
              {check.passed ? <Check className="text-emerald-600" size={16} /> : <X className="text-coral" size={16} />}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] border border-line bg-white p-5 shadow-lifted">
        <h3 className="text-lg font-black">Object activity</h3>
        <div className="mt-4 grid gap-3">
          {invoice.events.map((event, index) => (
            <div key={`${event}-${index}`} className="flex gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-xs font-black text-white">
                {index + 1}
              </div>
              <p className="pt-1 text-sm leading-6 text-ink/62">{event}</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function InvoiceRow({
  invoice,
  selected,
  walletRole,
  onBuy,
  onList,
  onPay,
  onSelect,
}: {
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
      className={`grid gap-4 rounded-[1.5rem] border p-4 transition md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${
        selected ? "border-ink bg-ink text-white" : "border-line bg-paper hover:border-moss"
      }`}
    >
      <button className="text-left" onClick={() => onSelect(invoice.id)}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-black">{invoice.id}</p>
          <StatusPill status={invoice.status} compact />
          <FinancePill status={invoice.financingStatus} />
        </div>
        <p className={`mt-2 text-sm ${selected ? "text-white/62" : "text-ink/55"}`}>
          {invoice.clientName} · {invoice.description}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <MiniChip selected={selected}>{formatSui(invoice.amount)}</MiniChip>
          <MiniChip selected={selected}>Health {health.score}/100</MiniChip>
          <MiniChip selected={selected}>Recipient {shortAddress(invoice.paymentRecipient)}</MiniChip>
        </div>
      </button>
      <ActionButton invoice={invoice} walletRole={walletRole} onBuy={onBuy} onList={onList} onPay={onPay} />
    </article>
  );
}

function ActionButton({
  invoice,
  walletRole,
  onBuy,
  onList,
  onPay,
}: {
  invoice: Invoice;
  walletRole: WalletRole;
  onBuy: (invoice: Invoice) => void;
  onList: (invoice: Invoice) => void;
  onPay: (invoice: Invoice) => void;
}) {
  if (invoice.status !== "PENDING") {
    return (
      <button disabled className="rounded-2xl bg-line px-4 py-3 text-sm font-black text-ink/45">
        Settled
      </button>
    );
  }

  if (walletRole === "issuer" && invoice.financingStatus === "NOT_LISTED") {
    return (
      <button className="rounded-2xl bg-ink px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5" onClick={() => onList(invoice)}>
        List rights
      </button>
    );
  }

  if (walletRole === "buyer" && invoice.financingStatus === "LISTED") {
    return (
      <button className="rounded-2xl bg-mint px-4 py-3 text-sm font-black text-ink transition hover:-translate-y-0.5" onClick={() => onBuy(invoice)}>
        Buy rights
      </button>
    );
  }

  if (walletRole === "payer") {
    return (
      <button className="rounded-2xl bg-aqua px-4 py-3 text-sm font-black text-ink transition hover:-translate-y-0.5" onClick={() => onPay(invoice)}>
        Pay invoice
      </button>
    );
  }

  return (
    <button disabled className="rounded-2xl bg-line px-4 py-3 text-sm font-black text-ink/45">
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
      <form className="rounded-[2rem] border border-line bg-white p-5 shadow-lifted md:p-7" onSubmit={onCreate}>
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-ink/40">Mint workflow</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">Create receivable object</h2>
          </div>
          <FileCheck2 className="text-moss" size={38} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Client name" name="clientName" defaultValue="Helio Supply" />
          <Field label="Client email" name="clientEmail" type="email" defaultValue="ap@helio.test" />
          <Field label="Amount in SUI" name="amount" type="number" defaultValue="750" />
          <Field label="Due date" name="dueDate" type="date" defaultValue="2026-07-30" />
          <label className="grid gap-2 md:col-span-2">
            <span className="text-sm font-black">Description</span>
            <textarea
              className="min-h-32 rounded-2xl border border-line bg-paper px-4 py-3 outline-none transition focus:border-ink"
              name="description"
              defaultValue="Mobile app design sprint"
              required
            />
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-paper p-4 md:col-span-2">
            <input className="mt-1 h-4 w-4 accent-ink" name="uploadEvidence" type="checkbox" />
            <span>
              <span className="block text-sm font-black">Upload evidence JSON to Walrus Testnet</span>
              <span className="mt-1 block text-sm leading-6 text-ink/55">
                Uses the public Testnet publisher. Leave off for a purely local demo invoice.
              </span>
            </span>
          </label>
        </div>

        <button
          className="mt-6 rounded-2xl bg-ink px-6 py-4 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-moss disabled:bg-ink/35"
          disabled={isCreating}
        >
          {isCreating ? "Preparing evidence..." : "Prepare receivable"}
        </button>
      </form>

      <div className="grid content-start gap-5">
        <InfoPanel
          icon={<DatabaseZap />}
          title="Walrus evidence package"
          body={`Evidence JSON can now upload to ${walrusConfig.publisherUrl}. The object stores the returned blob ID for later retrieval.`}
        />
        <InfoPanel icon={<ShieldCheck />} title="Required invariant" body="Once financed, payment_recipient changes to buyer. pay_invoice must always settle to payment_recipient." />
        <InfoPanel icon={<LockKeyhole />} title="No secrets in frontend" body="Cloudflare and Walrus Sites both work for static frontend hosting, but privileged keys never belong in the client bundle." />
      </div>
    </div>
  );
}

function Marketplace({
  invoices,
  walletRole,
  onBuy,
  onSelect,
}: {
  invoices: Invoice[];
  walletRole: WalletRole;
  onBuy: (invoice: Invoice) => void;
  onSelect: (id: string) => void;
}) {
  const listings = invoices.filter((invoice) => invoice.status === "PENDING" && invoice.financingStatus === "LISTED");
  return (
    <section className="rounded-[2rem] border border-line bg-white p-5 shadow-lifted md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-ink/40">Financeable supply</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">Marketplace</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/55">
            Listed invoices show the buyer discount, health score, and future payment recipient behavior before purchase.
          </p>
        </div>
        <div className="rounded-2xl bg-paper px-4 py-3 text-sm font-black">{listings.length} listed invoices</div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {listings.map((invoice) => (
          <div key={invoice.id} className="rounded-[1.7rem] border border-line bg-paper p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-black">{invoice.id}</p>
                <p className="mt-1 text-sm text-ink/55">{invoice.clientName}</p>
              </div>
              <FinancePill status={invoice.financingStatus} />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <SmallStat label="Face value" value={formatSui(invoice.amount)} />
              <SmallStat label="Buy price" value={formatSui(invoice.financingPrice)} />
              <SmallStat label="Discount" value={`${Math.round((1 - invoice.financingPrice / invoice.amount) * 100)}%`} />
            </div>
            <div className="mt-5 flex gap-2">
              <button className="rounded-2xl border border-line bg-white px-4 py-3 text-sm font-black" onClick={() => onSelect(invoice.id)}>
                Inspect
              </button>
              <button
                disabled={walletRole !== "buyer"}
                className="rounded-2xl bg-mint px-4 py-3 text-sm font-black text-ink disabled:bg-line disabled:text-ink/45"
                onClick={() => onBuy(invoice)}
              >
                Buy payment rights
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Portfolio({ invoices, wallet }: { invoices: Invoice[]; wallet: DemoWallet }) {
  const owned = invoices.filter((invoice) => invoice.buyer === wallet.address);
  const expectedSettlement = owned.filter((invoice) => invoice.status === "PENDING").reduce((sum, invoice) => sum + invoice.amount, 0);
  return (
    <section className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric accent="mint" icon={<WalletCards />} label="Owned rights" value={String(owned.length)} />
        <Metric accent="aqua" icon={<Landmark />} label="Expected settlement" value={formatSui(expectedSettlement)} />
        <Metric accent="sun" icon={<Clock3 />} label="Current role" value={wallet.label} />
      </div>
      <div className="rounded-[2rem] border border-line bg-white p-5 shadow-lifted md:p-7">
        <h2 className="text-3xl font-black tracking-[-0.05em]">Buyer positions</h2>
        <div className="mt-5 grid gap-3">
          {owned.length ? (
            owned.map((invoice) => (
              <div key={invoice.id} className="rounded-[1.5rem] border border-line bg-paper p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black">{invoice.id}</p>
                    <p className="mt-1 text-sm text-ink/55">{invoice.clientName}</p>
                  </div>
                  <div className="flex gap-2">
                    <StatusPill status={invoice.status} />
                    <MiniChip>{formatSui(invoice.amount)}</MiniChip>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-line bg-paper p-8 text-center text-ink/55">
              No receivables owned by this wallet yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function NavItem({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
        active ? "bg-white text-ink" : "text-white/65 hover:bg-white/10 hover:text-white"
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
  const wallet = useCurrentWallet();
  const network = useCurrentNetwork();
  const connection = useWalletConnection();

  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-ink/45">Sui wallet</span>
        <span className={`h-2 w-2 rounded-full ${connection.isConnected ? "bg-emerald-500" : "bg-ink/20"}`} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <ConnectButton />
        {account ? (
          <div className="min-w-0 text-xs leading-5 text-ink/55">
            <p className="truncate font-black text-ink">{wallet?.name ?? "Connected"}</p>
            <p className="truncate">{shortAddress(account.address)} · {network}</p>
          </div>
        ) : (
          <p className="max-w-44 text-xs leading-5 text-ink/50">Connect for real Sui transactions.</p>
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
    <nav className="glass sticky top-[10.8rem] z-10 mb-5 flex gap-2 overflow-x-auto rounded-[1.25rem] border border-white p-2 shadow-lifted lg:hidden">
      {items.map((item) => (
        <button
          key={item.page}
          className={`flex min-w-max items-center gap-2 rounded-2xl px-3 py-2 text-sm font-black ${
            page === item.page ? "bg-ink text-white" : "bg-white text-ink/62"
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
  const color = {
    mint: "bg-mint",
    aqua: "bg-aqua",
    sun: "bg-sun",
    coral: "bg-coral text-white",
  }[accent];
  return (
    <div className="rounded-[1.6rem] border border-line bg-white p-4 shadow-lifted">
      <div className={`grid h-11 w-11 place-items-center rounded-2xl ${color}`}>{icon}</div>
      <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-ink/40">{label}</p>
      <p className="mt-1 truncate text-2xl font-black tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function Field({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue: string; type?: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black">{label}</span>
      <input className="rounded-2xl border border-line bg-paper px-4 py-3 outline-none transition focus:border-ink" name={name} type={type} defaultValue={defaultValue} required />
    </label>
  );
}

function InfoPanel({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-[2rem] border border-line bg-white p-5 shadow-lifted">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mint text-ink">{icon}</div>
      <h3 className="mt-5 text-lg font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink/58">{body}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-3">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-ink/35">{label}</p>
      <p className="mt-1 truncate font-black">{value}</p>
    </div>
  );
}

function StatusPill({ status, compact = false }: { status: InvoiceStatus; compact?: boolean }) {
  const classes = {
    PENDING: "bg-sun text-ink",
    PAID: "bg-mint text-ink",
    OVERDUE: "bg-coral text-white",
  }[status];
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${classes}`}>{compact ? status.slice(0, 4) : status}</span>;
}

function FinancePill({ status }: { status: FinancingStatus }) {
  const classes = {
    NOT_LISTED: "bg-white text-ink/55",
    LISTED: "bg-aqua text-ink",
    FINANCED: "bg-mint text-ink",
    CANCELLED: "bg-coral text-white",
  }[status];
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${classes}`}>{status.replace("_", " ")}</span>;
}

function MiniChip({ children, selected = false }: { children: React.ReactNode; selected?: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${selected ? "bg-white/10 text-white/75" : "bg-white text-ink/58"}`}>
      {children}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-ink/48">{label}</span>
      <span className="max-w-[190px] truncate text-right text-sm font-black">{value}</span>
    </div>
  );
}

export default App;
