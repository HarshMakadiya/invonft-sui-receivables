module invonft::receivable {
    use std::string::{Self, String};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    #[test_only]
    use sui::sui::SUI;

    const STATUS_PENDING: u8 = 0;
    const STATUS_PAID: u8 = 1;
    const STATUS_OVERDUE: u8 = 2;
    #[allow(unused_const)]
    const STATUS_DISPUTED: u8 = 3;

    const DEFAULT_PLATFORM_FEE_BPS: u64 = 100;
    const MAX_PLATFORM_FEE_BPS: u64 = 1000;

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
    const E_NOT_PAYER: u64 = 9;
    const E_NOT_CONFIG_OWNER: u64 = 10;
    const E_BAD_FEE_BPS: u64 = 11;
    const E_NOT_ACKNOWLEDGED: u64 = 12;
    const E_ALREADY_ACKNOWLEDGED: u64 = 13;

    public struct InvoiceCounter has key {
        id: UID,
        next_invoice_number: u64,
    }

    public struct PlatformConfig has key {
        id: UID,
        owner: address,
        fee_recipient: address,
        fee_bps: u64,
    }

    /// A programmable invoice receivable settled in the stablecoin type `T`
    /// (the deployed app uses USDC). Every monetary field is denominated in the
    /// smallest base unit of `T` (USDC has 6 decimals, so 1 USDC = 1_000_000).
    /// The `*_mist` field names are retained for index/back-compat and now mean
    /// "base units of the configured payment coin".
    public struct InvoiceReceivable<phantom T> has key, store {
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
        acknowledged_at_ms: u64,
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

    public struct InvoiceAcknowledged has copy, drop {
        invoice_id: ID,
        invoice_number: u64,
        payer: address,
        acknowledged_at_ms: u64,
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
        platform_fee_mist: u64,
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
        let publisher = tx_context::sender(ctx);
        transfer::share_object(InvoiceCounter {
            id: object::new(ctx),
            next_invoice_number: 1,
        });
        transfer::share_object(PlatformConfig {
            id: object::new(ctx),
            owner: publisher,
            fee_recipient: publisher,
            fee_bps: DEFAULT_PLATFORM_FEE_BPS,
        });
    }

    public entry fun create_invoice_receivable<T>(
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

        let invoice = InvoiceReceivable<T> {
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
            acknowledged_at_ms: 0,
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

    /// The payer cryptographically acknowledges the debt is real. Required
    /// before the receivable can be listed for financing, which is the core
    /// fraud-resistance gate against fake invoices and double-financing.
    public entry fun acknowledge_invoice<T>(
        invoice: &mut InvoiceReceivable<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == invoice.payer, E_NOT_PAYER);
        assert!(invoice.status == STATUS_PENDING, E_NOT_PENDING);
        assert!(invoice.acknowledged_at_ms == 0, E_ALREADY_ACKNOWLEDGED);

        invoice.acknowledged_at_ms = clock::timestamp_ms(clock);

        event::emit(InvoiceAcknowledged {
            invoice_id: object::id(invoice),
            invoice_number: invoice.invoice_number,
            payer: invoice.payer,
            acknowledged_at_ms: invoice.acknowledged_at_ms,
        });
    }

    public entry fun list_for_financing<T>(
        invoice: &mut InvoiceReceivable<T>,
        financing_price_mist: u64,
        financing_discount_bps: u64,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == invoice.issuer, E_NOT_ISSUER);
        assert!(invoice.status == STATUS_PENDING, E_NOT_PENDING);
        assert!(invoice.acknowledged_at_ms > 0, E_NOT_ACKNOWLEDGED);
        assert!(invoice.financing_status != FINANCING_FINANCED, E_ALREADY_FINANCED);
        assert!(financing_price_mist > 0 && financing_price_mist <= invoice.amount_mist, E_BAD_FINANCING_PRICE);

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

    public entry fun buy_receivable<T>(
        invoice: &mut InvoiceReceivable<T>,
        config: &PlatformConfig,
        mut payment: Coin<T>,
        ctx: &mut TxContext,
    ) {
        assert!(invoice.status == STATUS_PENDING, E_NOT_PENDING);
        assert!(invoice.financing_status == FINANCING_LISTED, E_NOT_LISTED);
        assert!(coin::value(&payment) == invoice.financing_price_mist, E_INCORRECT_PAYMENT_AMOUNT);

        let buyer = tx_context::sender(ctx);
        invoice.financing_status = FINANCING_FINANCED;
        invoice.payment_recipient = buyer;
        invoice.financed_at_ms = 0;

        let platform_fee_mist = invoice.financing_price_mist * config.fee_bps / 10000;
        if (platform_fee_mist > 0) {
            let fee = coin::split(&mut payment, platform_fee_mist, ctx);
            transfer::public_transfer(fee, config.fee_recipient);
        };
        transfer::public_transfer(payment, invoice.issuer);

        event::emit(ReceivableFinanced {
            invoice_id: object::id(invoice),
            invoice_number: invoice.invoice_number,
            issuer: invoice.issuer,
            buyer,
            financing_price_mist: invoice.financing_price_mist,
            platform_fee_mist,
        });
    }

    public entry fun update_platform_fee(
        config: &mut PlatformConfig,
        fee_recipient: address,
        fee_bps: u64,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == config.owner, E_NOT_CONFIG_OWNER);
        assert!(fee_bps <= MAX_PLATFORM_FEE_BPS, E_BAD_FEE_BPS);

        config.fee_recipient = fee_recipient;
        config.fee_bps = fee_bps;
    }

    public entry fun pay_invoice<T>(
        invoice: &mut InvoiceReceivable<T>,
        payment: Coin<T>,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == invoice.payer, E_NOT_PAYER);
        assert!(invoice.status == STATUS_PENDING || invoice.status == STATUS_OVERDUE, E_ALREADY_PAID);
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

    public entry fun cancel_listing<T>(invoice: &mut InvoiceReceivable<T>, ctx: &mut TxContext) {
        assert!(tx_context::sender(ctx) == invoice.issuer, E_NOT_ISSUER);
        assert!(invoice.status == STATUS_PENDING, E_NOT_PENDING);
        assert!(invoice.financing_status == FINANCING_LISTED, E_NOT_LISTED);

        invoice.financing_status = FINANCING_CANCELLED;
        invoice.financing_price_mist = 0;
        invoice.financing_discount_bps = 0;
    }

    public entry fun attach_evidence<T>(
        invoice: &mut InvoiceReceivable<T>,
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

    public entry fun mark_overdue<T>(invoice: &mut InvoiceReceivable<T>, clock: &Clock) {
        assert!(invoice.status == STATUS_PENDING, E_NOT_PENDING);
        assert!(clock::timestamp_ms(clock) > invoice.due_date_ms, E_DUE_DATE_NOT_PASSED);

        invoice.status = STATUS_OVERDUE;
        event::emit(InvoiceOverdue {
            invoice_id: object::id(invoice),
            invoice_number: invoice.invoice_number,
        });
    }

    public fun invoice_number<T>(invoice: &InvoiceReceivable<T>): u64 {
        invoice.invoice_number
    }

    public fun id<T>(invoice: &InvoiceReceivable<T>): ID {
        object::id(invoice)
    }

    public fun payer<T>(invoice: &InvoiceReceivable<T>): address {
        invoice.payer
    }

    public fun due_date_ms<T>(invoice: &InvoiceReceivable<T>): u64 {
        invoice.due_date_ms
    }

    public fun is_paid<T>(invoice: &InvoiceReceivable<T>): bool {
        invoice.status == STATUS_PAID
    }

    public fun status<T>(invoice: &InvoiceReceivable<T>): u8 {
        invoice.status
    }

    public fun financing_status<T>(invoice: &InvoiceReceivable<T>): u8 {
        invoice.financing_status
    }

    public fun payment_recipient<T>(invoice: &InvoiceReceivable<T>): address {
        invoice.payment_recipient
    }

    public fun amount_mist<T>(invoice: &InvoiceReceivable<T>): u64 {
        invoice.amount_mist
    }

    public fun acknowledged_at_ms<T>(invoice: &InvoiceReceivable<T>): u64 {
        invoice.acknowledged_at_ms
    }

    public fun is_acknowledged<T>(invoice: &InvoiceReceivable<T>): bool {
        invoice.acknowledged_at_ms > 0
    }

    public fun platform_fee_bps(config: &PlatformConfig): u64 {
        config.fee_bps
    }

    public fun platform_fee_recipient(config: &PlatformConfig): address {
        config.fee_recipient
    }

    #[test_only]
    public(package) fun invoice_for_testing<T>(
        issuer: address,
        payer: address,
        amount_mist: u64,
        ctx: &mut TxContext,
    ): InvoiceReceivable<T> {
        InvoiceReceivable<T> {
            id: object::new(ctx),
            issuer,
            payer,
            payment_recipient: issuer,
            amount_mist,
            due_date_ms: 1000,
            status: STATUS_PENDING,
            financing_status: FINANCING_NOT_LISTED,
            financing_price_mist: 0,
            financing_discount_bps: 0,
            created_at_ms: 0,
            paid_at_ms: 0,
            financed_at_ms: 0,
            acknowledged_at_ms: 0,
            blob_id: string::utf8(b"blob"),
            metadata_checksum: string::utf8(b"sha256:test"),
            invoice_number: 1,
        }
    }

    #[test_only]
    public(package) fun set_acknowledged_for_testing<T>(invoice: &mut InvoiceReceivable<T>, ms: u64) {
        invoice.acknowledged_at_ms = ms;
    }

    #[test_only]
    public(package) fun destroy_for_testing<T>(invoice: InvoiceReceivable<T>) {
        let InvoiceReceivable {
            id,
            issuer: _,
            payer: _,
            payment_recipient: _,
            amount_mist: _,
            due_date_ms: _,
            status: _,
            financing_status: _,
            financing_price_mist: _,
            financing_discount_bps: _,
            created_at_ms: _,
            paid_at_ms: _,
            financed_at_ms: _,
            acknowledged_at_ms: _,
            blob_id: _,
            metadata_checksum: _,
            invoice_number: _,
        } = invoice;
        object::delete(id);
    }

    #[test_only]
    public(package) fun platform_config_for_testing(
        owner: address,
        fee_recipient: address,
        fee_bps: u64,
        ctx: &mut TxContext,
    ): PlatformConfig {
        PlatformConfig {
            id: object::new(ctx),
            owner,
            fee_recipient,
            fee_bps,
        }
    }

    #[test_only]
    public(package) fun destroy_config_for_testing(config: PlatformConfig) {
        let PlatformConfig {
            id,
            owner: _,
            fee_recipient: _,
            fee_bps: _,
        } = config;
        object::delete(id);
    }

    #[test]
    fun financing_routes_payment_to_buyer() {
        let mut ctx = tx_context::dummy();
        let mut invoice = invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);
        let config = platform_config_for_testing(@0x0, @0x9, 100, &mut ctx);
        let financing_payment = coin::mint_for_testing<SUI>(90, &mut ctx);

        set_acknowledged_for_testing(&mut invoice, 1);
        list_for_financing(&mut invoice, 90, 1000, &mut ctx);
        buy_receivable(&mut invoice, &config, financing_payment, &mut ctx);

        assert!(financing_status(&invoice) == FINANCING_FINANCED, 0);
        assert!(payment_recipient(&invoice) == @0x0, 1);

        let invoice_payment = coin::mint_for_testing<SUI>(100, &mut ctx);
        pay_invoice(&mut invoice, invoice_payment, &mut ctx);

        assert!(status(&invoice) == STATUS_PAID, 2);
        destroy_config_for_testing(config);
        destroy_for_testing(invoice);
    }

    #[test]
    fun platform_fee_can_be_updated_by_owner() {
        let mut ctx = tx_context::dummy();
        let mut config = platform_config_for_testing(@0x0, @0x9, 100, &mut ctx);

        update_platform_fee(&mut config, @0x8, 250, &mut ctx);

        assert!(platform_fee_recipient(&config) == @0x8, 0);
        assert!(platform_fee_bps(&config) == 250, 1);
        destroy_config_for_testing(config);
    }

    #[test]
    #[expected_failure(abort_code = E_NOT_PAYER)]
    fun only_configured_payer_can_pay() {
        let mut ctx = tx_context::dummy();
        let mut invoice = invoice_for_testing<SUI>(@0x0, @0x2, 100, &mut ctx);
        let invoice_payment = coin::mint_for_testing<SUI>(100, &mut ctx);

        pay_invoice(&mut invoice, invoice_payment, &mut ctx);
        destroy_for_testing(invoice);
    }

    #[test]
    #[expected_failure(abort_code = E_ALREADY_PAID)]
    fun paid_invoice_cannot_be_paid_twice() {
        let mut ctx = tx_context::dummy();
        let mut invoice = invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);
        let first_payment = coin::mint_for_testing<SUI>(100, &mut ctx);
        let second_payment = coin::mint_for_testing<SUI>(100, &mut ctx);

        pay_invoice(&mut invoice, first_payment, &mut ctx);
        pay_invoice(&mut invoice, second_payment, &mut ctx);
        destroy_for_testing(invoice);
    }

    #[test]
    fun payer_can_acknowledge_then_issuer_can_list() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        clock::set_for_testing(&mut clock, 500);
        let mut invoice = invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);

        assert!(!is_acknowledged(&invoice), 0);
        acknowledge_invoice(&mut invoice, &clock, &mut ctx);
        assert!(is_acknowledged(&invoice), 1);
        assert!(acknowledged_at_ms(&invoice) == 500, 2);

        list_for_financing(&mut invoice, 90, 1000, &mut ctx);
        assert!(financing_status(&invoice) == FINANCING_LISTED, 3);

        clock::destroy_for_testing(clock);
        destroy_for_testing(invoice);
    }

    #[test]
    #[expected_failure(abort_code = E_NOT_ACKNOWLEDGED)]
    fun unacknowledged_invoice_cannot_be_listed() {
        let mut ctx = tx_context::dummy();
        let mut invoice = invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);

        list_for_financing(&mut invoice, 90, 1000, &mut ctx);
        destroy_for_testing(invoice);
    }

    #[test]
    #[expected_failure(abort_code = E_NOT_PAYER)]
    fun only_payer_can_acknowledge() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        let mut invoice = invoice_for_testing<SUI>(@0x0, @0x2, 100, &mut ctx);

        acknowledge_invoice(&mut invoice, &clock, &mut ctx);

        clock::destroy_for_testing(clock);
        destroy_for_testing(invoice);
    }

    #[test]
    #[expected_failure(abort_code = E_ALREADY_ACKNOWLEDGED)]
    fun invoice_cannot_be_acknowledged_twice() {
        let mut ctx = tx_context::dummy();
        let mut clock = clock::create_for_testing(&mut ctx);
        clock::set_for_testing(&mut clock, 500);
        let mut invoice = invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);

        acknowledge_invoice(&mut invoice, &clock, &mut ctx);
        acknowledge_invoice(&mut invoice, &clock, &mut ctx);

        clock::destroy_for_testing(clock);
        destroy_for_testing(invoice);
    }
}
