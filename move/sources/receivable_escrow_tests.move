#[test_only]
module invonft::receivable_escrow_tests {
    use invonft::receivable;
    use invonft::receivable_escrow;
    use sui::clock;
    use sui::coin;
    use sui::sui::SUI;
    use sui::tx_context;

    #[test]
    fun paid_invoice_releases_deposit_to_depositor() {
        let mut issuer_ctx = tx_context::new_from_hint(@0x0, 1, 0, 0, 0);
        let mut payer_ctx = tx_context::new_from_hint(@0x0, 2, 0, 0, 0);
        let mut invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut issuer_ctx);
        let escrow = receivable_escrow::escrow_for_testing<SUI>(
            &invoice,
            @0x0,
            25,
            100,
            0,
            &mut issuer_ctx,
        );
        let payment = coin::mint_for_testing<SUI>(100, &mut payer_ctx);

        receivable::pay_invoice(&mut invoice, payment, &mut payer_ctx);
        receivable_escrow::release_deposit(escrow, &invoice, &mut issuer_ctx);

        receivable::destroy_for_testing(invoice);
    }

    #[test]
    fun default_claim_follows_financed_payment_recipient() {
        let mut issuer_ctx = tx_context::new_from_hint(@0x0, 10, 0, 0, 0);
        let mut buyer_ctx = tx_context::new_from_hint(@0x0, 11, 0, 0, 0);
        let mut invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x3, 100, &mut issuer_ctx);
        let config = receivable::platform_config_for_testing(@0x0, @0x9, 0, &mut issuer_ctx);
        let escrow = receivable_escrow::escrow_for_testing<SUI>(
            &invoice,
            @0x3,
            40,
            100,
            0,
            &mut issuer_ctx,
        );
        let financing_payment = coin::mint_for_testing<SUI>(90, &mut buyer_ctx);
        let mut test_clock = clock::create_for_testing(&mut issuer_ctx);

        receivable::set_acknowledged_for_testing(&mut invoice, 1);
        receivable::list_for_financing(&mut invoice, 90, 1000, &mut issuer_ctx);
        receivable::buy_receivable(&mut invoice, &config, financing_payment, &mut buyer_ctx);
        clock::set_for_testing(&mut test_clock, 1101);

        receivable_escrow::claim_deposit(escrow, &invoice, &test_clock, &mut buyer_ctx);

        clock::destroy_for_testing(test_clock);
        receivable::destroy_config_for_testing(config);
        receivable::destroy_for_testing(invoice);
    }

    #[test]
    #[expected_failure(abort_code = receivable_escrow::E_INVOICE_UNPAID)]
    fun unpaid_invoice_cannot_release_deposit() {
        let mut ctx = tx_context::dummy();
        let invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x2, 100, &mut ctx);
        let escrow = receivable_escrow::escrow_for_testing<SUI>(&invoice, @0x0, 25, 100, 0, &mut ctx);

        receivable_escrow::release_deposit(escrow, &invoice, &mut ctx);

        receivable::destroy_for_testing(invoice);
    }

    #[test]
    #[expected_failure(abort_code = receivable_escrow::E_NOT_DEPOSITOR)]
    fun only_depositor_can_release() {
        let mut owner_ctx = tx_context::new_from_hint(@0x0, 20, 0, 0, 0);
        let mut payer_ctx = tx_context::new_from_hint(@0x0, 21, 0, 0, 0);
        let mut stranger_ctx = tx_context::new_from_hint(@0x0, 22, 0, 0, 0);
        let mut invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut owner_ctx);
        let escrow = receivable_escrow::escrow_for_testing<SUI>(&invoice, @0x1, 25, 100, 0, &mut owner_ctx);
        let payment = coin::mint_for_testing<SUI>(100, &mut payer_ctx);

        receivable::pay_invoice(&mut invoice, payment, &mut payer_ctx);
        receivable_escrow::release_deposit(escrow, &invoice, &mut stranger_ctx);

        receivable::destroy_for_testing(invoice);
    }

    #[test]
    #[expected_failure(abort_code = receivable_escrow::E_WRONG_INVOICE)]
    fun deposit_cannot_be_released_against_another_invoice() {
        let mut ctx = tx_context::dummy();
        let invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);
        let other_invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);
        let escrow = receivable_escrow::escrow_for_testing<SUI>(&invoice, @0x0, 25, 100, 0, &mut ctx);

        receivable_escrow::release_deposit(escrow, &other_invoice, &mut ctx);

        receivable::destroy_for_testing(invoice);
        receivable::destroy_for_testing(other_invoice);
    }

    #[test]
    #[expected_failure(abort_code = receivable_escrow::E_CLAIM_TOO_EARLY)]
    fun deposit_cannot_be_claimed_before_grace_period() {
        let mut ctx = tx_context::dummy();
        let invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x2, 100, &mut ctx);
        let escrow = receivable_escrow::escrow_for_testing<SUI>(&invoice, @0x0, 25, 100, 0, &mut ctx);
        let mut test_clock = clock::create_for_testing(&mut ctx);
        clock::set_for_testing(&mut test_clock, 1100);

        receivable_escrow::claim_deposit(escrow, &invoice, &test_clock, &mut ctx);

        clock::destroy_for_testing(test_clock);
        receivable::destroy_for_testing(invoice);
    }

    #[test]
    #[expected_failure(abort_code = receivable_escrow::E_NOT_BENEFICIARY)]
    fun only_payment_recipient_can_claim_defaulted_deposit() {
        let mut issuer_ctx = tx_context::new_from_hint(@0x0, 30, 0, 0, 0);
        let mut stranger_ctx = tx_context::new_from_hint(@0x0, 31, 0, 0, 0);
        let invoice = receivable::invoice_for_testing<SUI>(@0x1, @0x3, 100, &mut issuer_ctx);
        let escrow = receivable_escrow::escrow_for_testing<SUI>(&invoice, @0x3, 25, 100, 0, &mut issuer_ctx);
        let mut test_clock = clock::create_for_testing(&mut issuer_ctx);
        clock::set_for_testing(&mut test_clock, 1101);

        receivable_escrow::claim_deposit(escrow, &invoice, &test_clock, &mut stranger_ctx);

        clock::destroy_for_testing(test_clock);
        receivable::destroy_for_testing(invoice);
    }

    #[test]
    #[expected_failure(abort_code = receivable_escrow::E_INVOICE_PAID)]
    fun paid_invoice_deposit_cannot_be_claimed() {
        let mut ctx = tx_context::dummy();
        let mut invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);
        let escrow = receivable_escrow::escrow_for_testing<SUI>(&invoice, @0x0, 25, 100, 0, &mut ctx);
        let payment = coin::mint_for_testing<SUI>(100, &mut ctx);
        let mut test_clock = clock::create_for_testing(&mut ctx);
        clock::set_for_testing(&mut test_clock, 1101);

        receivable::pay_invoice(&mut invoice, payment, &mut ctx);
        receivable_escrow::claim_deposit(escrow, &invoice, &test_clock, &mut ctx);

        clock::destroy_for_testing(test_clock);
        receivable::destroy_for_testing(invoice);
    }
}
