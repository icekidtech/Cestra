/// cestra::pool
/// Group Send: multiple senders pool contributions that are delivered as a
/// single consolidated payout to one recipient.
///
/// Lifecycle: create → contribute* → execute (target met) | refund (deadline passed)
/// Security:
///   - Pool is a shared object; contributions are held in an on-chain Balance.
///   - Only one terminal state (executed XOR refunded) — invariant enforced.
///   - Admin can trigger payout/refund; contributors can trigger refund after deadline.
///   - Compliance gates on every contribution.
module cestra::pool {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use cestra::compliance::{Self, ComplianceRegistry, AdminCap};

    // ── Errors ───────────────────────────────────────────────────────────────
    const E_DEADLINE_PASSED: u64    = 200;
    const E_TARGET_ALREADY_MET: u64 = 201;
    const E_DEADLINE_NOT_PASSED: u64 = 202;
    const E_TARGET_NOT_MET: u64     = 203;
    const E_ALREADY_TERMINAL: u64   = 204;
    const E_ZERO_AMOUNT: u64        = 205;
    const E_NOT_CONTRIBUTOR: u64    = 206;

    // ── Status ───────────────────────────────────────────────────────────────
    const STATUS_OPEN: u8     = 0;
    const STATUS_EXECUTED: u8 = 1;
    const STATUS_REFUNDED: u8 = 2;

    // ── Objects ──────────────────────────────────────────────────────────────

    /// Shared pool object. Holds contributions in Balance<T>.
    public struct Pool<phantom T> has key {
        id: UID,
        creator: address,
        target: u64,
        recipient: address,
        deadline_ms: u64,
        status: u8,
        balance: Balance<T>,
        /// contributor → amount they contributed (for pro-rata refund)
        contributions: Table<address, u64>,
        contributor_count: u64,
        executed_at_ms: u64,
        refunded_at_ms: u64,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    public struct PoolCreated has copy, drop {
        pool_id: ID,
        creator: address,
        target: u64,
        recipient: address,
        deadline_ms: u64,
        timestamp_ms: u64,
    }

    public struct ContributionAdded has copy, drop {
        pool_id: ID,
        contributor: address,
        amount: u64,
        pool_balance: u64,
        timestamp_ms: u64,
    }

    public struct PoolExecuted has copy, drop {
        pool_id: ID,
        total_amount: u64,
        recipient: address,
        executed_at_ms: u64,
    }

    public struct PoolRefunded has copy, drop {
        pool_id: ID,
        total_refunded: u64,
        refunded_at_ms: u64,
    }

    public struct ContributorRefunded has copy, drop {
        pool_id: ID,
        contributor: address,
        amount: u64,
        timestamp_ms: u64,
    }

    // ── Create ────────────────────────────────────────────────────────────────

    /// Create a new group send pool. Caller must be Tier 2 verified.
    /// `target`      — total amount to collect (6-decimal USDC micro-units)
    /// `recipient`   — Sui address of the Cestra liquidity wallet / recipient
    /// `deadline_ms` — Unix epoch ms after which refund becomes available
    public fun create_pool<T>(
        compliance: &ComplianceRegistry,
        target: u64,
        recipient: address,
        deadline_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let creator = tx_context::sender(ctx);
        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, creator);
        // Pool creation restricted to Tier 2+ (per PRD §5.5)
        compliance::assert_kyc_tier(compliance, creator, compliance::tier_2());

        let now_ms = clock::timestamp_ms(clock);
        assert!(deadline_ms > now_ms, E_DEADLINE_PASSED);
        assert!(target > 0, E_ZERO_AMOUNT);

        let pool = Pool<T> {
            id: object::new(ctx),
            creator,
            target,
            recipient,
            deadline_ms,
            status: STATUS_OPEN,
            balance: balance::zero<T>(),
            contributions: table::new(ctx),
            contributor_count: 0,
            executed_at_ms: 0,
            refunded_at_ms: 0,
        };

        event::emit(PoolCreated {
            pool_id: object::uid_to_inner(&pool.id),
            creator,
            target,
            recipient,
            deadline_ms,
            timestamp_ms: now_ms,
        });

        transfer::share_object(pool);
    }

    // ── Contribute ────────────────────────────────────────────────────────────

    /// Add a contribution to the pool.
    /// Reverts if: deadline passed, target already met, pool not open.
    #[allow(lint(self_transfer))]
    public fun contribute<T>(
        pool: &mut Pool<T>,
        compliance: &mut ComplianceRegistry,
        coin_in: Coin<T>,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let contributor = tx_context::sender(ctx);
        let now_ms = clock::timestamp_ms(clock);

        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, contributor);
        compliance::assert_kyc_tier(compliance, contributor, compliance::tier_1());
        compliance::assert_within_monthly_limit(compliance, contributor, amount, clock); // Enforce HIGH-02

        assert!(pool.status == STATUS_OPEN, E_ALREADY_TERMINAL);
        assert!(now_ms < pool.deadline_ms, E_DEADLINE_PASSED);
        assert!(balance::value(&pool.balance) < pool.target, E_TARGET_ALREADY_MET);
        assert!(amount > 0, E_ZERO_AMOUNT);
        assert!(coin::value(&coin_in) >= amount, E_ZERO_AMOUNT);

        let mut payment = coin_in;
        let contribution_coin = coin::split(&mut payment, amount, ctx);

        // Return change
        let remainder = coin::value(&payment);
        if (remainder > 0) {
            transfer::public_transfer(payment, contributor);
        } else {
            coin::destroy_zero(payment);
        };

        // Accumulate into pool balance
        balance::join(&mut pool.balance, coin::into_balance(contribution_coin));

        // Track individual contribution for refund accounting
        if (table::contains(&pool.contributions, contributor)) {
            let existing = table::borrow_mut(&mut pool.contributions, contributor);
            *existing = *existing + amount;
        } else {
            table::add(&mut pool.contributions, contributor, amount);
            pool.contributor_count = pool.contributor_count + 1;
        };

        compliance::record_volume(compliance, contributor, amount, clock);

        event::emit(ContributionAdded {
            pool_id: object::uid_to_inner(&pool.id),
            contributor,
            amount,
            pool_balance: balance::value(&pool.balance),
            timestamp_ms: now_ms,
        });
    }

    // ── Execute payout ────────────────────────────────────────────────────────

    /// Consolidate and send pool to recipient. Admin callable after target met.
    public fun execute_pool<T>(
        _cap: &AdminCap,
        pool: &mut Pool<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(pool.status == STATUS_OPEN, E_ALREADY_TERMINAL);
        assert!(balance::value(&pool.balance) >= pool.target, E_TARGET_NOT_MET);

        let now_ms = clock::timestamp_ms(clock);
        pool.status = STATUS_EXECUTED;
        pool.executed_at_ms = now_ms;

        let total = balance::value(&pool.balance);
        let payout_balance = balance::withdraw_all(&mut pool.balance);
        let payout_coin = coin::from_balance(payout_balance, ctx);
        transfer::public_transfer(payout_coin, pool.recipient);

        event::emit(PoolExecuted {
            pool_id: object::uid_to_inner(&pool.id),
            total_amount: total,
            recipient: pool.recipient,
            executed_at_ms: now_ms,
        });
    }

    // ── Refund ────────────────────────────────────────────────────────────────

    /// Mark pool as refunded (admin initiates after deadline without target met).
    /// Individual contributors call `claim_refund` to receive their coins.
    public fun initiate_refund<T>(
        _cap: &AdminCap,
        pool: &mut Pool<T>,
        clock: &Clock,
    ) {
        assert!(pool.status == STATUS_OPEN, E_ALREADY_TERMINAL);
        assert!(clock::timestamp_ms(clock) >= pool.deadline_ms, E_DEADLINE_NOT_PASSED);
        let now_ms = clock::timestamp_ms(clock);
        pool.status = STATUS_REFUNDED;
        pool.refunded_at_ms = now_ms;
        event::emit(PoolRefunded {
            pool_id: object::uid_to_inner(&pool.id),
            total_refunded: balance::value(&pool.balance),
            refunded_at_ms: now_ms,
        });
    }

    /// Each contributor claims their own refund after refund is initiated.
    /// Auto-refund must complete within 60 seconds of pool expiry (off-chain driver).
    #[allow(lint(self_transfer))]
    public fun claim_refund<T>(
        pool: &mut Pool<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(pool.status == STATUS_REFUNDED, E_DEADLINE_NOT_PASSED);
        let claimant = tx_context::sender(ctx);
        assert!(table::contains(&pool.contributions, claimant), E_NOT_CONTRIBUTOR);

        let amount = table::remove(&mut pool.contributions, claimant);
        let refund_balance = balance::split(&mut pool.balance, amount);
        let refund_coin = coin::from_balance(refund_balance, ctx);
        transfer::public_transfer(refund_coin, claimant);

        event::emit(ContributorRefunded {
            pool_id: object::uid_to_inner(&pool.id),
            contributor: claimant,
            amount,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    public fun pool_balance<T>(pool: &Pool<T>): u64   { balance::value(&pool.balance) }
    public fun pool_target<T>(pool: &Pool<T>): u64    { pool.target }
    public fun pool_status<T>(pool: &Pool<T>): u8     { pool.status }
    public fun pool_deadline<T>(pool: &Pool<T>): u64  { pool.deadline_ms }
    public fun pool_recipient<T>(pool: &Pool<T>): address { pool.recipient }
    public fun status_open(): u8     { STATUS_OPEN }
    public fun status_executed(): u8 { STATUS_EXECUTED }
    public fun status_refunded(): u8 { STATUS_REFUNDED }
}
