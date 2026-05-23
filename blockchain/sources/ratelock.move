/// cestra::ratelock
/// FX Forward Rate Contract.
///
/// Allows businesses to lock an exchange rate for a specific corridor and
/// amount for up to 24 hours, protecting against FX volatility.
///
/// Mechanism:
///   1. Business calls `request_lock` — pays 0.15% lock fee upfront.
///      Rate is read directly from the on-chain RateOracle (admin-fed).
///   2. Business calls `execute_locked_payment` within the lock window,
///      which returns a LockReceipt (hot potato).
///   3. The LockReceipt MUST be consumed by `cestra::send::send_with_lock`
///      in the same PTB, atomically coupling rate execution to fund transfer.
///   4. If expired, admin marks it via `expire_lock`.
///
/// Audit fixes applied (2026-05-18):
///   CRIT-1: User-supplied rate eliminated; contract reads directly from RateOracle.
///   HIGH-2: `execute_locked_payment` returns a LockReceipt (hot potato).
///           `send::send_with_lock` must consume it — funds transfer is atomic.
///   MED-3:  Storage key derived as blake2b256(sender ++ lock_id) — no squatting.
///   MED-4:  MAX_LOCK_FEE_RATE (500 bps) ceiling on proposals; update_treasury added.
module cestra::ratelock {
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

    // ── Errors ───────────────────────────────────────────────────────────────
    const E_LOCK_EXPIRED: u64           = 500;
    const E_LOCK_ALREADY_USED: u64      = 501;
    const E_NOT_LOCK_OWNER: u64         = 502;
    const E_LOCK_NOT_FOUND: u64         = 503;
    const E_ZERO_AMOUNT: u64            = 504;
    const E_INSUFFICIENT_FUNDS: u64     = 505;
    const E_TIMELOCK_ACTIVE: u64        = 506;
    const E_INVALID_DURATION: u64       = 508;
    const E_NO_PENDING_CHANGE: u64      = 509;
    /// MED-4: proposed fee exceeds hardcoded ceiling
    const E_FEE_TOO_HIGH: u64           = 510;
    /// CRIT-1: oracle price is older than ORACLE_MAX_STALENESS_MS
    const E_RATE_STALE: u64             = 511;
    /// CRIT-1: corridor has no oracle entry yet
    const E_CORRIDOR_NOT_FOUND: u64     = 512;

    // ── Constants ────────────────────────────────────────────────────────────
    /// Lock fee: 0.15% = 15 basis points
    const LOCK_FEE_RATE: u64           = 15;
    const FEE_DENOMINATOR: u64          = 10_000;
    /// MED-4: absolute fee ceiling (5% = 500 bps)
    const MAX_LOCK_FEE_RATE: u64        = 500;
    /// Default lock duration: 24 hours in ms
    const DEFAULT_LOCK_DURATION_MS: u64 = 24 * 60 * 60 * 1_000;
    /// Minimum lock duration: 1 hour
    const MIN_LOCK_DURATION_MS: u64     = 60 * 60 * 1_000;
    /// Timelock for admin parameter changes: 48h
    const ADMIN_TIMELOCK_MS: u64        = 48 * 60 * 60 * 1_000;
    /// CRIT-1: reject oracle prices older than 5 minutes
    const ORACLE_MAX_STALENESS_MS: u64  = 5 * 60 * 1_000;

    // ── Status ───────────────────────────────────────────────────────────────
    const LOCK_STATUS_ACTIVE: u8   = 0;
    const LOCK_STATUS_EXECUTED: u8 = 1;
    const LOCK_STATUS_EXPIRED: u8  = 2;

    // ── Objects ──────────────────────────────────────────────────────────────

    /// Shared rate lock config and fee treasury.
    public struct RateLockConfig has key {
        id: UID,
        lock_fee_rate: u64,
        treasury: address,
        /// Pending fee rate change (48h timelock)
        pending_fee_rate: u64,
        pending_fee_rate_valid_at_ms: u64,
    }

    /// CRIT-1: Shared oracle feed. The admin-controlled backend posts current
    /// exchange rates per corridor here. request_lock reads from this object
    /// rather than trusting any caller-supplied price.
    public struct RateOracle has key {
        id: UID,
        /// corridor code → OracleEntry
        rates: Table<u8, OracleEntry>,
    }

    /// A single corridor price entry inside RateOracle.
    public struct OracleEntry has store, drop {
        /// local_currency_units per 1 USDC, scaled × 1_000_000
        rate: u64,
        updated_at_ms: u64,
    }

    /// Capability for the off-chain oracle feeder service to post rates.
    /// Separate from AdminCap so the oracle key rotation doesn't touch admin keys.
    public struct OracleFeederCap has key { id: UID }

    /// A single rate lock record stored in RateLockRegistry.
    public struct RateLock has store, drop {
        locker: address,
        corridor: u8,
        /// Net send amount (excluding lock fee)
        amount: u64,
        lock_fee: u64,
        /// Rate snapshotted from RateOracle at lock creation time
        locked_rate: u64,
        created_at_ms: u64,
        expires_at_ms: u64,
        duration_ms: u64,
        status: u8,
        executed_at_ms: u64,
    }

    /// Shared registry of all rate locks.
    public struct RateLockRegistry has key {
        id: UID,
        locks: Table<vector<u8>, RateLock>,
        total_locks: u64,
        total_fees_collected: u64,
    }

    /// HIGH-2: Hot potato receipt — no abilities means Move VM enforces it is
    /// consumed in the same PTB. The only consumer is `send::send_with_lock`.
    /// This cryptographically couples rate execution to fund transfer.
    public struct LockReceipt {
        locker: address,
        amount: u64,
        corridor: u8,
        locked_rate: u64,
        /// derived_key for backend indexing
        derived_key: vector<u8>,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    public struct RateLockCreated has copy, drop {
        lock_id: vector<u8>,
        derived_key: vector<u8>,
        locker: address,
        corridor: u8,
        amount: u64,
        lock_fee: u64,
        locked_rate: u64,
        expires_at_ms: u64,
        timestamp_ms: u64,
    }

    public struct RateLockExecuted has copy, drop {
        derived_key: vector<u8>,
        locker: address,
        amount: u64,
        locked_rate: u64,
        executed_at_ms: u64,
    }

    public struct RateLockExpired has copy, drop {
        derived_key: vector<u8>,
        locker: address,
        expired_at_ms: u64,
    }

    public struct OracleRatePosted has copy, drop {
        corridor: u8,
        rate: u64,
        timestamp_ms: u64,
    }

    public struct LockFeeRateProposed has copy, drop {
        new_rate: u64, valid_at_ms: u64,
    }
    public struct LockFeeRateExecuted has copy, drop {
        old_rate: u64, new_rate: u64, timestamp_ms: u64,
    }
    public struct TreasuryUpdated has copy, drop {
        old_treasury: address, new_treasury: address, timestamp_ms: u64,
    }
    public struct OracleFeederCapGranted has copy, drop {
        feeder: address, timestamp_ms: u64,
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    fun init(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        transfer::share_object(RateLockConfig {
            id: object::new(ctx),
            lock_fee_rate: LOCK_FEE_RATE,
            treasury: sender,
            pending_fee_rate: 0,
            pending_fee_rate_valid_at_ms: 0,
        });
        transfer::share_object(RateLockRegistry {
            id: object::new(ctx),
            locks: table::new(ctx),
            total_locks: 0,
            total_fees_collected: 0,
        });
        // RateOracle shared at deploy time; feeder posts rates before first lock
        transfer::share_object(RateOracle {
            id: object::new(ctx),
            rates: table::new(ctx),
        });
    }

    // ── Admin: oracle feeder management ──────────────────────────────────────

    /// Grant an OracleFeederCap to the backend service account.
    public fun grant_oracle_feeder_cap(
        _admin: &AdminCap,
        feeder: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        transfer::transfer(OracleFeederCap { id: object::new(ctx) }, feeder);
        event::emit(OracleFeederCapGranted {
            feeder,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Revoke an OracleFeederCap by destroying it.
    public fun revoke_oracle_feeder_cap(_admin: &AdminCap, cap: OracleFeederCap) {
        let OracleFeederCap { id } = cap;
        object::delete(id);
    }

    // ── Oracle: post rate ─────────────────────────────────────────────────────

    /// CRIT-1: Backend oracle feeder posts the current FX rate for a corridor.
    /// Called immediately before a user's `request_lock` (ideally in same PTB).
    /// `corridor` — corridor code (1=NG, 2=KE, 3=GH, 4=MX, 5=PH …)
    /// `rate`     — local_currency_units per 1 USDC, scaled × 1_000_000
    public fun post_oracle_rate(
        _cap: &OracleFeederCap,
        oracle: &mut RateOracle,
        corridor: u8,
        rate: u64,
        clock: &Clock,
    ) {
        let now_ms = clock::timestamp_ms(clock);
        let entry = OracleEntry { rate, updated_at_ms: now_ms };
        if (table::contains(&oracle.rates, corridor)) {
            *table::borrow_mut(&mut oracle.rates, corridor) = entry;
        } else {
            table::add(&mut oracle.rates, corridor, entry);
        };
        event::emit(OracleRatePosted { corridor, rate, timestamp_ms: now_ms });
    }

    // ── Request rate lock ─────────────────────────────────────────────────────

    /// Business requests a rate lock.
    ///
    /// CRIT-1: `locked_rate` parameter is removed. The contract reads the rate
    /// directly from `oracle` and asserts it is no older than ORACLE_MAX_STALENESS_MS.
    /// MED-3: On-chain storage key = blake2b256(locker ++ lock_id), scoped per sender.
    ///
    /// `lock_id`    — unique idempotency key generated off-chain
    /// `corridor`   — corridor code (1=NG, 2=KE, etc.)
    /// `amount`     — amount to lock (net send amount, in USDC micro-units)
    /// `duration_ms`— desired lock duration (MIN … DEFAULT_LOCK_DURATION_MS)
    /// `coin_in`    — coin paying the lock fee upfront (non-refundable)
    #[allow(lint(self_transfer))]
    public fun request_lock<T>(
        config: &RateLockConfig,
        registry: &mut RateLockRegistry,
        oracle: &RateOracle,           // CRIT-1: on-chain price source
        compliance: &ComplianceRegistry,
        lock_id: vector<u8>,
        corridor: u8,
        amount: u64,
        duration_ms: u64,
        coin_in: Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let locker = tx_context::sender(ctx);
        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, locker);
        compliance::assert_kyc_tier(compliance, locker, compliance::tier_2());

        assert!(amount > 0, E_ZERO_AMOUNT);
        assert!(
            duration_ms >= MIN_LOCK_DURATION_MS &&
            duration_ms <= DEFAULT_LOCK_DURATION_MS,
            E_INVALID_DURATION
        );

        // CRIT-1: Read rate directly from on-chain oracle — user cannot inject price
        assert!(table::contains(&oracle.rates, corridor), E_CORRIDOR_NOT_FOUND);
        let oracle_entry = table::borrow(&oracle.rates, corridor);
        let now_ms = clock::timestamp_ms(clock);
        assert!(
            now_ms - oracle_entry.updated_at_ms <= ORACLE_MAX_STALENESS_MS,
            E_RATE_STALE
        );
        let locked_rate = oracle_entry.rate;

        // MED-3: Derive sender-scoped storage key
        let derived_key = derive_key(locker, lock_id);
        assert!(!table::contains(&registry.locks, derived_key), E_LOCK_ALREADY_USED);

        // Collect lock fee
        let lock_fee = compute_lock_fee(amount, config.lock_fee_rate);
        assert!(coin::value(&coin_in) >= lock_fee, E_INSUFFICIENT_FUNDS);

        let mut payment = coin_in;
        let fee_coin = coin::split(&mut payment, lock_fee, ctx);
        let remainder = coin::value(&payment);
        if (remainder > 0) {
            transfer::public_transfer(payment, locker);
        } else {
            coin::destroy_zero(payment);
        };
        transfer::public_transfer(fee_coin, config.treasury);

        let expires_at = now_ms + duration_ms;

        table::add(&mut registry.locks, derived_key, RateLock {
            locker,
            corridor,
            amount,
            lock_fee,
            locked_rate,
            created_at_ms: now_ms,
            expires_at_ms: expires_at,
            duration_ms,
            status: LOCK_STATUS_ACTIVE,
            executed_at_ms: 0,
        });
        registry.total_locks = registry.total_locks + 1;
        registry.total_fees_collected = registry.total_fees_collected + lock_fee;

        event::emit(RateLockCreated {
            lock_id,
            derived_key,
            locker,
            corridor,
            amount,
            lock_fee,
            locked_rate,
            expires_at_ms: expires_at,
            timestamp_ms: now_ms,
        });
    }

    // ── Execute payment with locked rate ──────────────────────────────────────

    /// HIGH-2: Returns a `LockReceipt` (hot potato — no drop ability).
    /// The caller MUST pass this receipt into `cestra::send::send_with_lock`
    /// within the same PTB, making fund transfer cryptographically mandatory.
    /// If the PTB does not include `send_with_lock`, the transaction aborts
    /// at the Move VM level because the un-dropped receipt violates linearity.
    ///
    /// `derived_key` — the on-chain key emitted in the RateLockCreated event
    public fun execute_locked_payment(
        registry: &mut RateLockRegistry,
        derived_key: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): LockReceipt {
        assert!(table::contains(&registry.locks, derived_key), E_LOCK_NOT_FOUND);
        let lock = table::borrow_mut(&mut registry.locks, derived_key);

        let caller = tx_context::sender(ctx);
        assert!(lock.locker == caller, E_NOT_LOCK_OWNER);
        assert!(lock.status == LOCK_STATUS_ACTIVE, E_LOCK_ALREADY_USED);

        let now_ms = clock::timestamp_ms(clock);
        assert!(now_ms <= lock.expires_at_ms, E_LOCK_EXPIRED);

        lock.status = LOCK_STATUS_EXECUTED;
        lock.executed_at_ms = now_ms;

        event::emit(RateLockExecuted {
            derived_key,
            locker: lock.locker,
            amount: lock.amount,
            locked_rate: lock.locked_rate,
            executed_at_ms: now_ms,
        });

        // Return hot potato — forces consume in send::send_with_lock
        LockReceipt {
            locker: lock.locker,
            amount: lock.amount,
            corridor: lock.corridor,
            locked_rate: lock.locked_rate,
            derived_key,
        }
    }

    /// Consume and destructure a LockReceipt, returning its fields.
    /// public(package) — only callable by modules within the cestra package.
    /// External PTBs cannot call this directly, so they cannot unpack the receipt
    /// without going through cestra::send::send_with_lock. This seals the bypass.
    public(package) fun consume_lock_receipt(
        receipt: LockReceipt,
    ): (address, u64, u8, u64, vector<u8>) {
        let LockReceipt { locker, amount, corridor, locked_rate, derived_key } = receipt;
        (locker, amount, corridor, locked_rate, derived_key)
    }

    // ── Admin: mark expired ───────────────────────────────────────────────────

    /// Admin marks a lock as expired during cleanup sweeps.
    public fun expire_lock(
        _cap: &AdminCap,
        registry: &mut RateLockRegistry,
        derived_key: vector<u8>,
        clock: &Clock,
    ) {
        assert!(table::contains(&registry.locks, derived_key), E_LOCK_NOT_FOUND);
        let lock = table::borrow_mut(&mut registry.locks, derived_key);
        assert!(lock.status == LOCK_STATUS_ACTIVE, E_LOCK_ALREADY_USED);
        assert!(clock::timestamp_ms(clock) > lock.expires_at_ms, E_TIMELOCK_ACTIVE);
        lock.status = LOCK_STATUS_EXPIRED;
        event::emit(RateLockExpired {
            derived_key,
            locker: lock.locker,
            expired_at_ms: clock::timestamp_ms(clock),
        });
    }

    // ── Admin: treasury rotation (MED-4) ──────────────────────────────────────

    /// Rotate the fee treasury to a new address (e.g. key compromise / new multisig).
    public fun update_treasury(
        _cap: &AdminCap,
        config: &mut RateLockConfig,
        new_treasury: address,
        clock: &Clock,
    ) {
        let old_treasury = config.treasury;
        config.treasury = new_treasury;
        event::emit(TreasuryUpdated {
            old_treasury,
            new_treasury,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ── Admin: 48h timelock fee rate change ───────────────────────────────────

    /// MED-4: new_rate is bounded by MAX_LOCK_FEE_RATE (500 bps = 5%).
    public fun propose_fee_rate_change(
        _cap: &AdminCap,
        config: &mut RateLockConfig,
        new_rate: u64,
        clock: &Clock,
    ) {
        // MED-4: hard ceiling even under key compromise
        assert!(new_rate <= MAX_LOCK_FEE_RATE, E_FEE_TOO_HIGH);
        let valid_at = clock::timestamp_ms(clock) + ADMIN_TIMELOCK_MS;
        config.pending_fee_rate = new_rate;
        config.pending_fee_rate_valid_at_ms = valid_at;
        event::emit(LockFeeRateProposed { new_rate, valid_at_ms: valid_at });
    }

    public fun execute_fee_rate_change(
        _cap: &AdminCap,
        config: &mut RateLockConfig,
        clock: &Clock,
    ) {
        assert!(config.pending_fee_rate_valid_at_ms > 0, E_NO_PENDING_CHANGE);
        assert!(
            clock::timestamp_ms(clock) >= config.pending_fee_rate_valid_at_ms,
            E_TIMELOCK_ACTIVE
        );
        let old = config.lock_fee_rate;
        config.lock_fee_rate = config.pending_fee_rate;
        config.pending_fee_rate = 0;
        config.pending_fee_rate_valid_at_ms = 0;
        event::emit(LockFeeRateExecuted {
            old_rate: old,
            new_rate: config.lock_fee_rate,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ── Pure helpers ──────────────────────────────────────────────────────────

    fun compute_lock_fee(amount: u64, rate: u64): u64 {
        (((amount as u128) * (rate as u128)) / (FEE_DENOMINATOR as u128)) as u64
    }

    /// MED-3: Derive a sender-scoped storage key = blake2b256(bcs(sender) ++ lock_id).
    fun derive_key(sender: address, lock_id: vector<u8>): vector<u8> {
        let mut preimage = bcs::to_bytes(&sender);
        vector::append(&mut preimage, lock_id);
        hash::blake2b256(&preimage)
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    public fun get_lock_status(registry: &RateLockRegistry, derived_key: vector<u8>): u8 {
        assert!(table::contains(&registry.locks, derived_key), E_LOCK_NOT_FOUND);
        table::borrow(&registry.locks, derived_key).status
    }
    public fun get_locked_rate(registry: &RateLockRegistry, derived_key: vector<u8>): u64 {
        assert!(table::contains(&registry.locks, derived_key), E_LOCK_NOT_FOUND);
        table::borrow(&registry.locks, derived_key).locked_rate
    }
    public fun get_oracle_rate(oracle: &RateOracle, corridor: u8): (u64, u64) {
        assert!(table::contains(&oracle.rates, corridor), E_CORRIDOR_NOT_FOUND);
        let e = table::borrow(&oracle.rates, corridor);
        (e.rate, e.updated_at_ms)
    }
    public fun compute_derived_key(sender: address, lock_id: vector<u8>): vector<u8> {
        derive_key(sender, lock_id)
    }
    public fun total_locks(registry: &RateLockRegistry): u64 { registry.total_locks }
    public fun total_fees_collected(registry: &RateLockRegistry): u64 { registry.total_fees_collected }
    public fun max_lock_fee_rate(): u64 { MAX_LOCK_FEE_RATE }
    public fun oracle_max_staleness_ms(): u64 { ORACLE_MAX_STALENESS_MS }
    public fun status_active(): u8   { LOCK_STATUS_ACTIVE }
    public fun status_executed(): u8 { LOCK_STATUS_EXECUTED }
    public fun status_expired(): u8  { LOCK_STATUS_EXPIRED }
}
