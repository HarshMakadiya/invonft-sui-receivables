module invonft::receivable_escrow {
    use invonft::receivable::{Self, InvoiceReceivable};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::object::{Self, ID, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    const STATUS_LOCKED: u8 = 0;
    const STATUS_RELEASED: u8 = 1;
    const STATUS_CLAIMED: u8 = 2;

    const E_ZERO_DEPOSIT: u64 = 0;
    const E_INVOICE_PAID: u64 = 1;
    const E_WRONG_INVOICE: u64 = 2;
    const E_NOT_DEPOSITOR: u64 = 3;
    const E_INVOICE_UNPAID: u64 = 4;
    const E_NOT_LOCKED: u64 = 5;
    const E_CLAIM_TOO_EARLY: u64 = 6;
    const E_NOT_BENEFICIARY: u64 = 7;

    /// A fungible security deposit that follows the invoice's live payment
    /// recipient. The deployed application uses USDC as `CoinT`.
    public struct DepositEscrow<phantom CoinT> has key, store {
        id: UID,
        invoice_id: ID,
        depositor: address,
        amount: Balance<CoinT>,
        grace_period_ms: u64,
        created_at_ms: u64,
        status: u8,
    }

    public struct DepositLocked has copy, drop {
        escrow_id: ID,
        invoice_id: ID,
        depositor: address,
        amount: u64,
        grace_period_ms: u64,
        created_at_ms: u64,
    }

    public struct DepositReleased has copy, drop {
        escrow_id: ID,
        invoice_id: ID,
        depositor: address,
        amount: u64,
    }

    public struct DepositClaimed has copy, drop {
        escrow_id: ID,
        invoice_id: ID,
        beneficiary: address,
        amount: u64,
    }

    public entry fun lock_deposit<T>(
        invoice: &InvoiceReceivable<T>,
        deposit: Coin<T>,
        grace_period_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let amount = coin::value(&deposit);
        assert!(amount > 0, E_ZERO_DEPOSIT);
        assert!(!receivable::is_paid(invoice), E_INVOICE_PAID);

        let depositor = tx_context::sender(ctx);
        let escrow = DepositEscrow<T> {
            id: object::new(ctx),
            invoice_id: receivable::id(invoice),
            depositor,
            amount: coin::into_balance(deposit),
            grace_period_ms,
            created_at_ms: clock::timestamp_ms(clock),
            status: STATUS_LOCKED,
        };
        let escrow_id = object::id(&escrow);

        event::emit(DepositLocked {
            escrow_id,
            invoice_id: receivable::id(invoice),
            depositor,
            amount,
            grace_period_ms,
            created_at_ms: clock::timestamp_ms(clock),
        });
        transfer::share_object(escrow);
    }

    public entry fun release_deposit<T>(
        mut escrow: DepositEscrow<T>,
        invoice: &InvoiceReceivable<T>,
        ctx: &mut TxContext,
    ) {
        assert!(escrow.invoice_id == receivable::id(invoice), E_WRONG_INVOICE);
        assert!(escrow.status == STATUS_LOCKED, E_NOT_LOCKED);
        assert!(tx_context::sender(ctx) == escrow.depositor, E_NOT_DEPOSITOR);
        assert!(receivable::is_paid(invoice), E_INVOICE_UNPAID);
        escrow.status = STATUS_RELEASED;

        let DepositEscrow {
            id,
            invoice_id,
            depositor,
            amount,
            grace_period_ms: _,
            created_at_ms: _,
            status: _,
        } = escrow;
        let escrow_id = object::uid_to_inner(&id);
        let value = balance::value(&amount);
        object::delete(id);

        transfer::public_transfer(coin::from_balance(amount, ctx), depositor);
        event::emit(DepositReleased {
            escrow_id,
            invoice_id,
            depositor,
            amount: value,
        });
    }

    public entry fun claim_deposit<T>(
        mut escrow: DepositEscrow<T>,
        invoice: &InvoiceReceivable<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(escrow.invoice_id == receivable::id(invoice), E_WRONG_INVOICE);
        assert!(escrow.status == STATUS_LOCKED, E_NOT_LOCKED);
        assert!(!receivable::is_paid(invoice), E_INVOICE_PAID);
        assert!(clock::timestamp_ms(clock) > receivable::due_date_ms(invoice) + escrow.grace_period_ms, E_CLAIM_TOO_EARLY);

        let beneficiary = receivable::payment_recipient(invoice);
        assert!(tx_context::sender(ctx) == beneficiary, E_NOT_BENEFICIARY);
        escrow.status = STATUS_CLAIMED;

        let DepositEscrow {
            id,
            invoice_id,
            depositor: _,
            amount,
            grace_period_ms: _,
            created_at_ms: _,
            status: _,
        } = escrow;
        let escrow_id = object::uid_to_inner(&id);
        let value = balance::value(&amount);
        object::delete(id);

        transfer::public_transfer(coin::from_balance(amount, ctx), beneficiary);
        event::emit(DepositClaimed {
            escrow_id,
            invoice_id,
            beneficiary,
            amount: value,
        });
    }

    public fun invoice_id<CoinT>(escrow: &DepositEscrow<CoinT>): ID {
        escrow.invoice_id
    }

    public fun depositor<CoinT>(escrow: &DepositEscrow<CoinT>): address {
        escrow.depositor
    }

    public fun amount<CoinT>(escrow: &DepositEscrow<CoinT>): u64 {
        balance::value(&escrow.amount)
    }

    public fun grace_period_ms<CoinT>(escrow: &DepositEscrow<CoinT>): u64 {
        escrow.grace_period_ms
    }

    public fun status<CoinT>(escrow: &DepositEscrow<CoinT>): u8 {
        escrow.status
    }

    #[test_only]
    public(package) fun escrow_for_testing<T>(
        invoice: &InvoiceReceivable<T>,
        depositor: address,
        amount: u64,
        grace_period_ms: u64,
        created_at_ms: u64,
        ctx: &mut TxContext,
    ): DepositEscrow<T> {
        DepositEscrow {
            id: object::new(ctx),
            invoice_id: receivable::id(invoice),
            depositor,
            amount: balance::create_for_testing(amount),
            grace_period_ms,
            created_at_ms,
            status: STATUS_LOCKED,
        }
    }

    #[test_only]
    public(package) fun destroy_for_testing<CoinT>(escrow: DepositEscrow<CoinT>) {
        let DepositEscrow {
            id,
            invoice_id: _,
            depositor: _,
            amount,
            grace_period_ms: _,
            created_at_ms: _,
            status: _,
        } = escrow;
        balance::destroy_for_testing(amount);
        object::delete(id);
    }
}
