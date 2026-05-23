/// cestra::send
/// Core payment contract. Executes USDsui/USDC transfers with:
///   - 0.80% flat fee deduction (FEE_RATE = 80 / 10_000)
///   - Atomic debit (amount + fee) from sender
///   - Corridor routing metadata
///   - Idempotent delivery confirmation and refund (only one terminal state)
///   - Compliance gating via cestra::compliance
///   - 48-hour timelock on critical parameter changes
///   - Emergency pause via compliance module
///
/// Audit fixes applied (2026-05-18):
///   HIGH-1: Fee coin held in secondary escrow; refunded on failure, forwarded on success.
///   HIGH-2: Admin setters for fee_treasury and liquidity_wallet.
///   MED-3:  tx_id storage key derived as blake2b256(sender ++ tx_id) to prevent DoS squatting.
///   MED-4:  Hardcoded MAX_FEE_RATE ceiling (500 bps) enforced in propose_fee_rate_change.
module cestra::send {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use sui::hash;
    use sui::bcs;
    use cestra::compliance::{Self, ComplianceRegistry, AdminCap};
    use cestra::ratelock::{Self, LockReceipt};

    // ── Error codes ──────────────────────────────────────────────────────────
    const E_ZERO_AMOUNT: u64          = 100;
    const E_INSUFFICIENT_BALANCE: u64 = 101;
    const E_ALREADY_TERMINAL: u64     = 102;
    const E_TX_NOT_FOUND: u64         = 104;
    const E_TIMELOCK_ACTIVE: u64      = 105;
    const E_NO_PENDING_CHANGE: u64    = 107;
    /// MED-4: proposed fee rate exceeds the hardcoded ceiling
    const E_FEE_TOO_HIGH: u64         = 108;
    /// Locker address in LockReceipt does not match tx sender
    const E_LOCK_OWNER_MISMATCH: u64  = 109;

    // ── Constants ────────────────────────────────────────────────────────────
    /// 0.80% fee — 80 basis points
    const FEE_RATE: u64        = 80;
    const FEE_DENOMINATOR: u64 = 10_000;

    /// MED-4: absolute ceiling — admin can never propose more than 5% (500 bps)
    const MAX_FEE_RATE: u64 = 500;

    /// Timelock for critical param changes: 48 hours in milliseconds
    const TIMELOCK_MS: u64 = 48 * 60 * 60 * 1_000;

    // ── Transaction status codes ─────────────────────────────────────────────
    const STATUS_PENDING: u8   = 0;
    const STATUS_CONFIRMED: u8 = 1;
    const STATUS_REFUNDED: u8  = 2;

    // ── Objects ──────────────────────────────────────────────────────────────

    /// Shared config object holding protocol fee rate and the treasury address.
    public struct SendConfig has key {
        id: UID,
        fee_rate: u64,
        fee_treasury: address,    // where protocol fees go
        liquidity_wallet: address, // escrow destination; must be multisig
        /// Pending fee rate change (timelock pattern)
        pending_fee_rate: u64,
        pending_fee_rate_valid_at_ms: u64,
    }

    /// HIGH-1 fix: escrow now holds BOTH the send amount (balances) and the fee
    /// (fee_balances) under the same derived key. This ensures:
    ///   - On confirm_delivery: fee is forwarded to treasury, send amount to liquidity wallet.
    ///   - On issue_refund:     both fee and send amount are returned to sender.
    public struct SendEscrow<phantom T> has key {
        id: UID,
        balances:     Table<vector<u8>, Balance<T>>, // derived_key → send amount
        fee_balances: Table<vector<u8>, Balance<T>>, // derived_key → fee amount
    }

    /// On-chain record of a single send transaction.
    /// Stored inside `TxRegistry` keyed by a derived_key (not raw tx_id).
    public struct TxRecord has store, drop {
        sender: address,
        recipient_hash: vector<u8>, // hashed off-chain recipient identifier
        amount: u64,
        fee: u64,
        corridor: u8,
        timestamp_ms: u64,
        status: u8,
        delivered_at_ms: u64,
        refunded_at_ms: u64,
    }

    /// Shared registry of all transaction records.
    public struct TxRegistry has key {
        id: UID,
        records: Table<vector<u8>, TxRecord>,
        total_volume: u64,
        total_fees: u64,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    public struct SendInitiated has copy, drop {
        tx_id: vector<u8>,       // original off-chain key (for backend correlation)
        derived_key: vector<u8>, // on-chain storage key
        sender: address,
        amount: u64,
        fee: u64,
        recipient_hash: vector<u8>,
        corridor: u8,
        timestamp_ms: u64,
    }

    public struct DeliveryConfirmed has copy, drop {
        tx_id: vector<u8>,
        delivered_amount: u64,
        local_currency_code: u8,
        delivered_at_ms: u64,
    }

    public struct RefundIssued has copy, drop {
        tx_id: vector<u8>,
        /// HIGH-1: reflects the true on-chain refund (amount + fee)
        refund_amount: u64,
        reason_code: u8,
        refunded_at_ms: u64,
    }

    public struct FeeRateChangeProposed has copy, drop {
        new_rate: u64,
        valid_at_ms: u64,
    }

    public struct FeeRateExecuted has copy, drop {
        old_rate: u64,
        new_rate: u64,
        timestamp_ms: u64,
    }

    /// HIGH-2: treasury / wallet rotation events
    public struct TreasuryUpdated has copy, drop {
        old_treasury: address,
        new_treasury: address,
        timestamp_ms: u64,
    }

    public struct LiquidityWalletUpdated has copy, drop {
        old_wallet: address,
        new_wallet: address,
        timestamp_ms: u64,
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    fun init(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        transfer::share_object(SendConfig {
            id: object::new(ctx),
            fee_rate: FEE_RATE,
            fee_treasury: sender,
            liquidity_wallet: sender,
            pending_fee_rate: 0,
            pending_fee_rate_valid_at_ms: 0,
        });
        transfer::share_object(TxRegistry {
            id: object::new(ctx),
            records: table::new(ctx),
            total_volume: 0,
            total_fees: 0,
        });
    }

    public fun create_escrow<T>(
        _cap: &AdminCap,
        ctx: &mut TxContext,
    ) {
        transfer::share_object(SendEscrow<T> {
            id: object::new(ctx),
            balances:     table::new(ctx),
            fee_balances: table::new(ctx),
        });
    }

    // ── Core send ────────────────────────────────────────────────────────────

    /// Primary entry: transfer USDsui/USDC from sender to Cestra liquidity wallet.
    /// `coin_in`        — the coin object the sender is spending (full amount + fee)
    /// `amount`         — the net send amount (what recipient should receive)
    /// `recipient_hash` — keccak256 / blake2b hash of off-chain recipient identifier
    /// `corridor`       — 1=NG, 2=KE, 3=GH, 4=MX, 5=PH … (ISO corridor code index)
    /// `tx_id`          — unique idempotency key generated off-chain
    ///
    /// MED-3: The on-chain storage key is derived as blake2b256(sender ++ tx_id).
    /// This scopes idempotency per-sender, so an attacker cannot front-run by
    /// submitting a different send with the same raw tx_id.
    #[allow(lint(self_transfer))]
    public fun send<T>(
        config: &SendConfig,
        escrow: &mut SendEscrow<T>,
        registry: &mut TxRegistry,
        compliance: &mut ComplianceRegistry,
        coin_in: Coin<T>,
        amount: u64,
        recipient_hash: vector<u8>,
        corridor: u8,
        tx_id: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);

        // ── Compliance gates ─────────────────────────────────────────────────
        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, sender);
        compliance::assert_within_monthly_limit(compliance, sender, amount, clock);

        // ── Invariant checks ─────────────────────────────────────────────────
        assert!(amount > 0, E_ZERO_AMOUNT);

        // MED-3: Derive a sender-scoped storage key to prevent tx_id squatting
        let derived_key = derive_key(sender, tx_id);
        assert!(!table::contains(&registry.records, derived_key), E_ALREADY_TERMINAL);

        // ── Fee calculation (integer arithmetic, no overflow) ─────────────────
        let fee = compute_fee(amount, config.fee_rate);
        let total_debit = amount + fee;
        assert!(coin::value(&coin_in) >= total_debit, E_INSUFFICIENT_BALANCE);

        // ── Atomic debit: take exact amount from coin, return change ──────────
        let mut payment = coin_in;
        let fee_coin  = coin::split(&mut payment, fee, ctx);
        let send_coin = coin::split(&mut payment, amount, ctx);

        // Return change to sender if any remainder
        let remainder = coin::value(&payment);
        if (remainder > 0) {
            transfer::public_transfer(payment, sender);
        } else {
            coin::destroy_zero(payment);
        };

        // HIGH-1: Both send amount and fee go into escrow under the same derived key.
        // Fee is only forwarded to treasury upon confirmed delivery; refunded on failure.
        table::add(&mut escrow.balances,     derived_key, coin::into_balance(send_coin));
        table::add(&mut escrow.fee_balances, derived_key, coin::into_balance(fee_coin));

        // ── Record transaction ────────────────────────────────────────────────
        let now_ms = clock::timestamp_ms(clock);
        let record = TxRecord {
            sender,
            recipient_hash,
            amount,
            fee,
            corridor,
            timestamp_ms: now_ms,
            status: STATUS_PENDING,
            delivered_at_ms: 0,
            refunded_at_ms: 0,
        };
        table::add(&mut registry.records, derived_key, record);
        registry.total_volume = registry.total_volume + amount;
        registry.total_fees   = registry.total_fees + fee;

        // ── Track compliance volume ───────────────────────────────────────────
        compliance::record_volume(compliance, sender, amount, clock);

        event::emit(SendInitiated {
            tx_id,
            derived_key,
            sender,
            amount,
            fee,
            recipient_hash,
            corridor,
            timestamp_ms: now_ms,
        });
    }

    // ── Rate-locked send (HIGH-2 hot potato integration) ──────────────────────

    /// Atomically execute a rate-locked payment in a single PTB.
    ///
    /// Call order within the PTB:
    ///   1. ratelock::execute_locked_payment(registry, derived_key, clock, ctx)
    ///      → returns LockReceipt (hot potato)
    ///   2. send::send_with_lock<T>(..., lock_receipt, ...)
    ///      → consumes LockReceipt, executes fund transfer
    ///
    /// If step 2 is omitted, the PTB aborts because the un-dropped LockReceipt
    /// violates Move's linear type system. Fund transfer is therefore mandatory.
    ///
    /// `tx_id`        — unique idempotency key generated off-chain (scoped to sender)
    /// `recipient_hash` — hashed off-chain recipient identifier
    /// `lock_receipt` — hot potato from ratelock::execute_locked_payment
    #[allow(lint(self_transfer))]
    public fun send_with_lock<T>(
        config: &SendConfig,
        escrow: &mut SendEscrow<T>,
        registry: &mut TxRegistry,
        compliance: &mut ComplianceRegistry,
        coin_in: Coin<T>,
        tx_id: vector<u8>,
        recipient_hash: vector<u8>,
        lock_receipt: LockReceipt,     // hot potato — consumed here
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);

        // Destructure and consume the hot potato
        let (locker, amount, corridor, _locked_rate, _lock_derived_key) =
            ratelock::consume_lock_receipt(lock_receipt);

        // Enforce: only the original locker can trigger the send
        assert!(locker == sender, E_LOCK_OWNER_MISMATCH);

        // ── Compliance gates ─────────────────────────────────────────────────
        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, sender);
        compliance::assert_within_monthly_limit(compliance, sender, amount, clock);

        assert!(amount > 0, E_ZERO_AMOUNT);

        let derived_key = derive_key(sender, tx_id);
        assert!(!table::contains(&registry.records, derived_key), E_ALREADY_TERMINAL);

        let fee = compute_fee(amount, config.fee_rate);
        let total_debit = amount + fee;
        assert!(coin::value(&coin_in) >= total_debit, E_INSUFFICIENT_BALANCE);

        let mut payment = coin_in;
        let fee_coin  = coin::split(&mut payment, fee, ctx);
        let send_coin = coin::split(&mut payment, amount, ctx);

        let remainder = coin::value(&payment);
        if (remainder > 0) {
            transfer::public_transfer(payment, sender);
        } else {
            coin::destroy_zero(payment);
        };

        table::add(&mut escrow.balances,     derived_key, coin::into_balance(send_coin));
        table::add(&mut escrow.fee_balances, derived_key, coin::into_balance(fee_coin));

        let now_ms = clock::timestamp_ms(clock);
        table::add(&mut registry.records, derived_key, TxRecord {
            sender,
            recipient_hash,
            amount,
            fee,
            corridor,
            timestamp_ms: now_ms,
            status: STATUS_PENDING,
            delivered_at_ms: 0,
            refunded_at_ms: 0,
        });
        registry.total_volume = registry.total_volume + amount;
        registry.total_fees   = registry.total_fees + fee;

        compliance::record_volume(compliance, sender, amount, clock);

        event::emit(SendInitiated {
            tx_id,
            derived_key,
            sender,
            amount,
            fee,
            recipient_hash,
            corridor,
            timestamp_ms: now_ms,
        });
    }

    // ── Admin: confirm delivery ───────────────────────────────────────────────
    /// Called by Cestra backend upon off-ramp webhook confirmation.
    /// `local_currency_code` — ISO 4217 numeric code (e.g. 566=NGN, 404=KES)
    /// `derived_key` — the storage key emitted in the SendInitiated event
    public fun confirm_delivery<T>(
        _cap: &AdminCap,
        escrow: &mut SendEscrow<T>,
        config: &SendConfig,
        registry: &mut TxRegistry,
        derived_key: vector<u8>,
        local_currency_code: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.records, derived_key), E_TX_NOT_FOUND);
        let record = table::borrow_mut(&mut registry.records, derived_key);
        // Invariant: only one terminal state
        assert!(record.status == STATUS_PENDING, E_ALREADY_TERMINAL);
        let now_ms = clock::timestamp_ms(clock);
        record.status = STATUS_CONFIRMED;
        record.delivered_at_ms = now_ms;

        // HIGH-1: Send amount → liquidity wallet; fee → treasury
        let send_bal = table::remove(&mut escrow.balances, derived_key);
        transfer::public_transfer(coin::from_balance(send_bal, ctx), config.liquidity_wallet);

        let fee_bal = table::remove(&mut escrow.fee_balances, derived_key);
        transfer::public_transfer(coin::from_balance(fee_bal, ctx), config.fee_treasury);

        event::emit(DeliveryConfirmed {
            tx_id: derived_key,
            delivered_amount: record.amount,
            local_currency_code,
            delivered_at_ms: now_ms,
        });
    }

    // ── Admin: refund ─────────────────────────────────────────────────────────
    /// Called only when off-ramp returns failure. Returns BOTH the send amount
    /// and the fee to the original sender.
    /// reason_code: 1=off-ramp failure, 2=timeout, 3=compliance block, 4=other
    public fun issue_refund<T>(
        _cap: &AdminCap,
        escrow: &mut SendEscrow<T>,
        registry: &mut TxRegistry,
        derived_key: vector<u8>,
        reason_code: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.records, derived_key), E_TX_NOT_FOUND);
        let record = table::borrow_mut(&mut registry.records, derived_key);
        assert!(record.status == STATUS_PENDING, E_ALREADY_TERMINAL);
        let now_ms = clock::timestamp_ms(clock);
        record.status = STATUS_REFUNDED;
        record.refunded_at_ms = now_ms;

        // HIGH-1: Return send amount from primary escrow
        let refund_bal = table::remove(&mut escrow.balances, derived_key);
        // HIGH-1: Also return fee from fee escrow — sender is made whole
        let fee_bal    = table::remove(&mut escrow.fee_balances, derived_key);

        let sender = record.sender;
        let refund_amount = record.amount + record.fee; // now matches actual on-chain return

        transfer::public_transfer(coin::from_balance(refund_bal, ctx), sender);
        transfer::public_transfer(coin::from_balance(fee_bal, ctx),    sender);

        event::emit(RefundIssued {
            tx_id: derived_key,
            refund_amount, // accurate: amount + fee both returned on-chain
            reason_code,
            refunded_at_ms: now_ms,
        });
    }

    // ── Admin: treasury & wallet rotation (HIGH-2) ────────────────────────────

    /// Rotate the protocol fee treasury to a new address (e.g. new multisig).
    public fun update_treasury(
        _cap: &AdminCap,
        config: &mut SendConfig,
        new_treasury: address,
        clock: &Clock,
    ) {
        let old_treasury = config.fee_treasury;
        config.fee_treasury = new_treasury;
        event::emit(TreasuryUpdated {
            old_treasury,
            new_treasury,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Rotate the liquidity wallet to a new address (e.g. new multisig).
    public fun update_liquidity_wallet(
        _cap: &AdminCap,
        config: &mut SendConfig,
        new_wallet: address,
        clock: &Clock,
    ) {
        let old_wallet = config.liquidity_wallet;
        config.liquidity_wallet = new_wallet;
        event::emit(LiquidityWalletUpdated {
            old_wallet,
            new_wallet,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ── Admin: 48-hour timelock fee rate change ───────────────────────────────

    /// MED-4: new_rate is bounded by MAX_FEE_RATE (500 bps = 5%).
    public fun propose_fee_rate_change(
        _cap: &AdminCap,
        config: &mut SendConfig,
        new_rate: u64,
        clock: &Clock,
    ) {
        // MED-4: hard ceiling — even a compromised key cannot exceed 5%
        assert!(new_rate <= MAX_FEE_RATE, E_FEE_TOO_HIGH);
        let valid_at = clock::timestamp_ms(clock) + TIMELOCK_MS;
        config.pending_fee_rate = new_rate;
        config.pending_fee_rate_valid_at_ms = valid_at;
        event::emit(FeeRateChangeProposed { new_rate, valid_at_ms: valid_at });
    }

    public fun execute_fee_rate_change(
        _cap: &AdminCap,
        config: &mut SendConfig,
        clock: &Clock,
    ) {
        assert!(config.pending_fee_rate_valid_at_ms > 0, E_NO_PENDING_CHANGE);
        assert!(
            clock::timestamp_ms(clock) >= config.pending_fee_rate_valid_at_ms,
            E_TIMELOCK_ACTIVE
        );
        let old = config.fee_rate;
        config.fee_rate = config.pending_fee_rate;
        config.pending_fee_rate = 0;
        config.pending_fee_rate_valid_at_ms = 0;
        event::emit(FeeRateExecuted {
            old_rate: old,
            new_rate: config.fee_rate,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ── Pure helpers ──────────────────────────────────────────────────────────

    public fun compute_fee(amount: u64, rate: u64): u64 {
        (((amount as u128) * (rate as u128)) / (FEE_DENOMINATOR as u128)) as u64
    }

    /// MED-3: Derive a sender-scoped storage key.
    /// key = blake2b256(bcs(sender) ++ tx_id)
    /// An attacker cannot reproduce this key without knowing the sender address
    /// in advance, making tx_id squatting impossible.
    fun derive_key(sender: address, tx_id: vector<u8>): vector<u8> {
        let mut preimage = bcs::to_bytes(&sender);
        let id_bytes = tx_id;
        vector::append(&mut preimage, id_bytes);
        hash::blake2b256(&preimage)
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    /// Lookup by derived_key (emitted in SendInitiated event).
    public fun get_tx_status(registry: &TxRegistry, derived_key: vector<u8>): u8 {
        assert!(table::contains(&registry.records, derived_key), E_TX_NOT_FOUND);
        table::borrow(&registry.records, derived_key).status
    }

    /// Convenience: recompute the derived key off-chain equivalent.
    public fun compute_derived_key(sender: address, tx_id: vector<u8>): vector<u8> {
        derive_key(sender, tx_id)
    }

    public fun total_volume(registry: &TxRegistry): u64 { registry.total_volume }
    public fun total_fees(registry: &TxRegistry): u64   { registry.total_fees }
    public fun current_fee_rate(config: &SendConfig): u64 { config.fee_rate }
    public fun fee_treasury(config: &SendConfig): address { config.fee_treasury }
    public fun liquidity_wallet(config: &SendConfig): address { config.liquidity_wallet }
    public fun max_fee_rate(): u64 { MAX_FEE_RATE }
}
