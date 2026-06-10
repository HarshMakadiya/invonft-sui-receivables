module invonft::receivable {
    use std::string::String;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    const STATUS_PENDING: u8 = 0;
    const STATUS_PAID: u8 = 1;
    const STATUS_OVERDUE: u8 = 2;
    const STATUS_DISPUTED: u8 = 3;

    const FINANCING_NOT_LISTED: u8 = 0;
    const FINANCING_LISTED: u8 = 1;
    const FINANCING_FINANCED: u8 = 2;
    const FINANCING_CANCELLED: u8 = 3;

    const E_NOT_ISSUER: u64 = 0;
    const E_NOT_PENDING: u64 = 1;
    const E_ALREADY_PAID: u64 = 2;
    const E_NOT_LISTED: u64 = 3;
    const E_ALREADY_FINANCED: u64 = 4;
    const E_BAD_FINANCING_PRICE: u64 = 5;
    const E_INCORRECT_PAYMENT_AMOUNT: u64 = 6;
    const E_DUE_DATE_NOT_PASSED: u64 = 7;
    const E_EVIDENCE_LOCKED: u64 = 8;

    public struct InvoiceCounter has key {
        id: UID,
        next_invoice_number: u64,
    }

    public struct InvoiceReceivable has key, store {
        id: UID,
        issuer: address,
        payer: address,
        payment_recipient: address,
        amount_mist: u64,
        due_date_ms: u64,
        status: u8,
        financing_status: u8,
        financing_price_mist: u64,
        financing_discount_bps: u64,
        created_at_ms: u64,
        paid_at_ms: u64,
        financed_at_ms: u64,
        blob_id: String,
        metadata_checksum: String,
        invoice_number: u64,
    }

    public struct InvoiceCreated has copy, drop {
        invoice_id: ID,
        invoice_number: u64,
        issuer: address,
        payer: address,
        amount_mist: u64,
    }

    public struct ReceivableListed has copy, drop {
        invoice_id: ID,
        invoice_number: u64,
        issuer: address,
        financing_price_mist: u64,
        financing_discount_bps: u64,
    }

    public struct ReceivableFinanced has copy, drop {
        invoice_id: ID,
        invoice_number: u64,
        issuer: address,
        buyer: address,
        financing_price_mist: u64,
    }

    public struct InvoicePaid has copy, drop {
        invoice_id: ID,
        invoice_number: u64,
        payer: address,
        payment_recipient: address,
        amount_mist: u64,
    }

    public struct InvoiceOverdue has copy, drop {
        invoice_id: ID,
        invoice_number: u64,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(InvoiceCounter {
            id: object::new(ctx),
            next_invoice_number: 1,
        });
    }

    public entry fun create_invoice_receivable(
        counter: &mut InvoiceCounter,
        payer: address,
        amount_mist: u64,
        due_date_ms: u64,
        blob_id: String,
        metadata_checksum: String,
        ctx: &mut TxContext,
    ) {
        let issuer = tx_context::sender(ctx);
        let invoice_number = counter.next_invoice_number;
        counter.next_invoice_number = invoice_number + 1;

        let invoice = InvoiceReceivable {
            id: object::new(ctx),
            issuer,
            payer,
            payment_recipient: issuer,
            amount_mist,
            due_date_ms,
            status: STATUS_PENDING,
            financing_status: FINANCING_NOT_LISTED,
            financing_price_mist: 0,
            financing_discount_bps: 0,
            created_at_ms: 0,
            paid_at_ms: 0,
            financed_at_ms: 0,
            blob_id,
            metadata_checksum,
            invoice_number,
        };

        let invoice_id = object::id(&invoice);
        event::emit(InvoiceCreated {
            invoice_id,
            invoice_number,
            issuer,
            payer,
            amount_mist,
        });
        transfer::share_object(invoice);
    }

    public entry fun list_for_financing(
        invoice: &mut InvoiceReceivable,
        financing_price_mist: u64,
        financing_discount_bps: u64,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == invoice.issuer, E_NOT_ISSUER);
        assert!(invoice.status == STATUS_PENDING, E_NOT_PENDING);
        assert!(invoice.financing_status != FINANCING_FINANCED, E_ALREADY_FINANCED);
        assert!(financing_price_mist > 0 && financing_price_mist < invoice.amount_mist, E_BAD_FINANCING_PRICE);

        invoice.financing_status = FINANCING_LISTED;
        invoice.financing_price_mist = financing_price_mist;
        invoice.financing_discount_bps = financing_discount_bps;

        event::emit(ReceivableListed {
            invoice_id: object::id(invoice),
            invoice_number: invoice.invoice_number,
            issuer: invoice.issuer,
            financing_price_mist,
            financing_discount_bps,
        });
    }

    public entry fun buy_receivable(
        invoice: &mut InvoiceReceivable,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        assert!(invoice.status == STATUS_PENDING, E_NOT_PENDING);
        assert!(invoice.financing_status == FINANCING_LISTED, E_NOT_LISTED);
        assert!(coin::value(&payment) == invoice.financing_price_mist, E_INCORRECT_PAYMENT_AMOUNT);

        let buyer = tx_context::sender(ctx);
        invoice.financing_status = FINANCING_FINANCED;
        invoice.payment_recipient = buyer;
        invoice.financed_at_ms = 0;

        transfer::public_transfer(payment, invoice.issuer);

        event::emit(ReceivableFinanced {
            invoice_id: object::id(invoice),
            invoice_number: invoice.invoice_number,
            issuer: invoice.issuer,
            buyer,
            financing_price_mist: invoice.financing_price_mist,
        });
    }

    public entry fun pay_invoice(
        invoice: &mut InvoiceReceivable,
        payment: Coin<SUI>,
        _ctx: &mut TxContext,
    ) {
        assert!(invoice.status == STATUS_PENDING, E_ALREADY_PAID);
        assert!(coin::value(&payment) == invoice.amount_mist, E_INCORRECT_PAYMENT_AMOUNT);

        let payment_recipient = invoice.payment_recipient;
        invoice.status = STATUS_PAID;
        invoice.paid_at_ms = 0;

        transfer::public_transfer(payment, payment_recipient);

        event::emit(InvoicePaid {
            invoice_id: object::id(invoice),
            invoice_number: invoice.invoice_number,
            payer: invoice.payer,
            payment_recipient,
            amount_mist: invoice.amount_mist,
        });
    }

    public entry fun cancel_listing(invoice: &mut InvoiceReceivable, ctx: &mut TxContext) {
        assert!(tx_context::sender(ctx) == invoice.issuer, E_NOT_ISSUER);
        assert!(invoice.status == STATUS_PENDING, E_NOT_PENDING);
        assert!(invoice.financing_status == FINANCING_LISTED, E_NOT_LISTED);

        invoice.financing_status = FINANCING_CANCELLED;
        invoice.financing_price_mist = 0;
        invoice.financing_discount_bps = 0;
    }

    public entry fun attach_evidence(
        invoice: &mut InvoiceReceivable,
        blob_id: String,
        metadata_checksum: String,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == invoice.issuer, E_NOT_ISSUER);
        assert!(invoice.status == STATUS_PENDING, E_NOT_PENDING);
        assert!(invoice.financing_status == FINANCING_NOT_LISTED, E_EVIDENCE_LOCKED);

        invoice.blob_id = blob_id;
        invoice.metadata_checksum = metadata_checksum;
    }

    public entry fun mark_overdue(invoice: &mut InvoiceReceivable, clock: &Clock) {
        assert!(invoice.status == STATUS_PENDING, E_NOT_PENDING);
        assert!(clock::timestamp_ms(clock) > invoice.due_date_ms, E_DUE_DATE_NOT_PASSED);

        invoice.status = STATUS_OVERDUE;
        event::emit(InvoiceOverdue {
            invoice_id: object::id(invoice),
            invoice_number: invoice.invoice_number,
        });
    }

    public fun invoice_number(invoice: &InvoiceReceivable): u64 {
        invoice.invoice_number
    }

    public fun status(invoice: &InvoiceReceivable): u8 {
        invoice.status
    }

    public fun financing_status(invoice: &InvoiceReceivable): u8 {
        invoice.financing_status
    }

    public fun payment_recipient(invoice: &InvoiceReceivable): address {
        invoice.payment_recipient
    }

    public fun amount_mist(invoice: &InvoiceReceivable): u64 {
        invoice.amount_mist
    }
}
