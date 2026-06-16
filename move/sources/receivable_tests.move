#[test_only]
module invonft::receivable_tests {
    use std::string;
    use sui::coin;
    use sui::sui::SUI;
    use sui::tx_context;
    use invonft::receivable;

    const STATUS_PAID: u8 = 1;
    const FINANCING_LISTED: u8 = 1;
    const FINANCING_FINANCED: u8 = 2;
    const FINANCING_CANCELLED: u8 = 3;

    #[test]
    fun financing_routes_payment_to_buyer() {
        let mut ctx = tx_context::dummy();
        let mut invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);
        let config = receivable::platform_config_for_testing(@0x0, @0x9, 100, &mut ctx);
        let financing_payment = coin::mint_for_testing<SUI>(90, &mut ctx);

        receivable::list_for_financing(&mut invoice, 90, 1000, &mut ctx);
        receivable::buy_receivable(&mut invoice, &config, financing_payment, &mut ctx);

        assert!(receivable::financing_status(&invoice) == FINANCING_FINANCED, 0);
        assert!(receivable::payment_recipient(&invoice) == @0x0, 1);

        let invoice_payment = coin::mint_for_testing<SUI>(100, &mut ctx);
        receivable::pay_invoice(&mut invoice, invoice_payment, &mut ctx);

        assert!(receivable::status(&invoice) == STATUS_PAID, 2);
        receivable::destroy_config_for_testing(config);
        receivable::destroy_for_testing(invoice);
    }

    #[test]
    fun cancel_listing_marks_invoice_cancelled() {
        let mut ctx = tx_context::dummy();
        let mut invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);

        receivable::list_for_financing(&mut invoice, 90, 1000, &mut ctx);
        assert!(receivable::financing_status(&invoice) == FINANCING_LISTED, 0);

        receivable::cancel_listing(&mut invoice, &mut ctx);
        assert!(receivable::financing_status(&invoice) == FINANCING_CANCELLED, 1);

        receivable::destroy_for_testing(invoice);
    }

    #[test]
    fun issuer_can_attach_evidence_before_listing() {
        let mut ctx = tx_context::dummy();
        let mut invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);

        receivable::attach_evidence(
            &mut invoice,
            string::utf8(b"real_blob_id"),
            string::utf8(b"sha256:updated"),
            &mut ctx,
        );

        receivable::destroy_for_testing(invoice);
    }

    #[test]
    fun platform_fee_can_be_updated_by_owner() {
        let mut ctx = tx_context::dummy();
        let mut config = receivable::platform_config_for_testing(@0x0, @0x9, 100, &mut ctx);

        receivable::update_platform_fee(&mut config, @0x8, 250, &mut ctx);

        assert!(receivable::platform_fee_recipient(&config) == @0x8, 0);
        assert!(receivable::platform_fee_bps(&config) == 250, 1);
        receivable::destroy_config_for_testing(config);
    }

    #[test]
    fun financing_price_can_equal_invoice_amount() {
        let mut ctx = tx_context::dummy();
        let mut invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);

        receivable::list_for_financing(&mut invoice, 100, 0, &mut ctx);
        assert!(receivable::financing_status(&invoice) == FINANCING_LISTED, 0);
        receivable::destroy_for_testing(invoice);
    }

    #[test]
    #[expected_failure(abort_code = 5)]
    fun financing_price_must_be_greater_than_zero() {
        let mut ctx = tx_context::dummy();
        let mut invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x0, 100, &mut ctx);

        receivable::list_for_financing(&mut invoice, 0, 10000, &mut ctx);
        receivable::destroy_for_testing(invoice);
    }

    #[test]
    #[expected_failure(abort_code = 9)]
    fun only_configured_payer_can_pay() {
        let mut ctx = tx_context::dummy();
        let mut invoice = receivable::invoice_for_testing<SUI>(@0x0, @0x2, 100, &mut ctx);
        let invoice_payment = coin::mint_for_testing<SUI>(100, &mut ctx);

        receivable::pay_invoice(&mut invoice, invoice_payment, &mut ctx);
        receivable::destroy_for_testing(invoice);
    }
}
