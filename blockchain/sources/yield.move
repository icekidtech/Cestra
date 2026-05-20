/// cestra::yield
///
/// Opt-in yield vault for idle USDsui/USDC. Tracks per-user principal and
/// lazily accrued yield. Yield liquidity is sourced externally via `inject_yield`;
/// the contract handles accounting only.
module cestra::yield {
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
    const E_YIELD_NOT_ENABLED: u64     = 300;
    const E_ZERO_AMOUNT: u64           = 301;
    const E_INSUFFICIENT_POSITION: u64 = 302;
    const E_VAULT_PAUSED: u64          = 303;
    const E_ALREADY_ENABLED: u64       = 304;
    const E_NO_POSITION: u64           = 305;
    const E_INVALID_TIMESTAMP: u64     = 306;

    // APY_SCALE: 1_000_000 = 100% APY (e.g. 40_000 = 4%)
    const APY_SCALE: u64   = 1_000_000;
    const MS_PER_YEAR: u64 = 365 * 24 * 60 * 60 * 1_000;

    // ── Objects ──────────────────────────────────────────────────────────────

    public struct YieldVault<phantom T> has key {
        id: UID,
        current_apy: u64,
        apy_effective_at_ms: u64,
        pending_apy: u64,
        pending_apy_effective_at_ms: u64,
        paused: bool,
        balance: Balance<T>,
        positions: Table<address, YieldPosition>,
        total_depositors: u64,
        total_yield_paid: u64,
    }

    public struct YieldPosition has store, drop {
        principal: u64,
        accrued_yield: u64,
        last_update_ms: u64,
        last_apy: u64,
        risk_acknowledged: bool,
        acknowledged_at_ms: u64,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    public struct YieldEnabled has copy, drop {
        user: address, acknowledged_at_ms: u64,
    }
    public struct YieldDeposited has copy, drop {
        user: address, amount: u64, total_principal: u64, timestamp_ms: u64,
    }
    public struct YieldWithdrawn has copy, drop {
        user: address, principal_out: u64, yield_out: u64, timestamp_ms: u64,
    }
    public struct ApyUpdated has copy, drop {
        old_apy: u64, new_apy: u64, timestamp_ms: u64, effective_at_ms: u64,
    }
    public struct DailyAccrualSnapshot has copy, drop {
        user: address, accrued_amount: u64, total_yield: u64, apy: u64, timestamp_ms: u64,
    }
    public struct YieldInjected has copy, drop {
        amount: u64, new_vault_balance: u64, timestamp_ms: u64,
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    fun init(_ctx: &TxContext) {}

    /// Creates and shares a new vault for coin type T. Admin only.
    public fun create_vault<T>(
        _cap: &AdminCap,
        initial_apy: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        transfer::share_object(YieldVault<T> {
            id: object::new(ctx),
            current_apy: initial_apy,
            apy_effective_at_ms: clock::timestamp_ms(clock),
            pending_apy: 0,
            pending_apy_effective_at_ms: 0,
            paused: false,
            balance: balance::zero<T>(),
            positions: table::new(ctx),
            total_depositors: 0,
            total_yield_paid: 0,
        });
    }

    // ── User: opt-in ─────────────────────────────────────────────────────────

    /// Records the caller's risk acknowledgment. Must be called before `deposit`.
    public fun enable_yield<T>(
        vault: &mut YieldVault<T>,
        compliance: &ComplianceRegistry,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        compliance::assert_not_paused(compliance);
        let user = tx_context::sender(ctx);
        compliance::assert_not_blacklisted(compliance, user);
        assert!(!vault.paused, E_VAULT_PAUSED);

        if (table::contains(&vault.positions, user)) {
            let pos = table::borrow(&vault.positions, user);
            assert!(!pos.risk_acknowledged, E_ALREADY_ENABLED);
            let pos_mut = table::borrow_mut(&mut vault.positions, user);
            pos_mut.risk_acknowledged = true;
            pos_mut.acknowledged_at_ms = clock::timestamp_ms(clock);
        } else {
            let now_ms = clock::timestamp_ms(clock);
            table::add(&mut vault.positions, user, YieldPosition {
                principal: 0,
                accrued_yield: 0,
                last_update_ms: now_ms,
                last_apy: vault.current_apy,
                risk_acknowledged: true,
                acknowledged_at_ms: now_ms,
            });
        };

        event::emit(YieldEnabled {
            user,
            acknowledged_at_ms: clock::timestamp_ms(clock),
        });
    }

    // ── User: deposit ─────────────────────────────────────────────────────────

    public fun deposit<T>(
        vault: &mut YieldVault<T>,
        compliance: &mut ComplianceRegistry,
        coin_in: Coin<T>,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let user = tx_context::sender(ctx);
        assert!(!vault.paused, E_VAULT_PAUSED);
        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, user);
        assert!(amount > 0, E_ZERO_AMOUNT);
        assert!(table::contains(&vault.positions, user), E_YIELD_NOT_ENABLED);

        let pos = table::borrow(&vault.positions, user);
        assert!(pos.risk_acknowledged, E_YIELD_NOT_ENABLED);

        let mut payment = coin_in;
        let deposit_coin = coin::split(&mut payment, amount, ctx);
        let remainder = coin::value(&payment);
        if (remainder > 0) {
            transfer::public_transfer(payment, user);
        } else {
            coin::destroy_zero(payment);
        };

        balance::join(&mut vault.balance, coin::into_balance(deposit_coin));

        let now_ms = clock::timestamp_ms(clock);
        apply_pending_apy(vault, now_ms);
        let pos_mut = table::borrow_mut(&mut vault.positions, user);
        if (pos_mut.principal == 0 && amount > 0) {
            vault.total_depositors = vault.total_depositors + 1;
        };
        let pending = compute_yield(pos_mut.principal, pos_mut.last_apy, now_ms - pos_mut.last_update_ms);
        pos_mut.accrued_yield  = pos_mut.accrued_yield + pending;
        pos_mut.principal      = pos_mut.principal + amount;
        pos_mut.last_update_ms = now_ms;
        pos_mut.last_apy       = vault.current_apy;

        event::emit(YieldDeposited {
            user, amount, total_principal: pos_mut.principal, timestamp_ms: now_ms,
        });
    }

    // ── User: withdraw ────────────────────────────────────────────────────────

    /// Withdraws principal and all accrued yield. Pass `principal_amount = 0` to
    /// claim yield only.
    public fun withdraw<T>(
        vault: &mut YieldVault<T>,
        compliance: &ComplianceRegistry,
        principal_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let user = tx_context::sender(ctx);
        assert!(!vault.paused, E_VAULT_PAUSED);
        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, user);
        assert!(table::contains(&vault.positions, user), E_NO_POSITION);

        let now_ms = clock::timestamp_ms(clock);
        apply_pending_apy(vault, now_ms);
        let pos = table::borrow_mut(&mut vault.positions, user);
        assert!(pos.risk_acknowledged, E_YIELD_NOT_ENABLED);
        assert!(principal_amount <= pos.principal, E_INSUFFICIENT_POSITION);

        let pending = compute_yield(pos.principal, pos.last_apy, now_ms - pos.last_update_ms);
        pos.accrued_yield  = pos.accrued_yield + pending;
        pos.last_update_ms = now_ms;
        pos.last_apy       = vault.current_apy;

        let yield_out  = pos.accrued_yield;
        let total_out  = principal_amount + yield_out;

        assert!(balance::value(&vault.balance) >= total_out, E_INSUFFICIENT_POSITION);

        let prior_principal = pos.principal;
        pos.principal     = pos.principal - principal_amount;
        pos.accrued_yield = 0;

        vault.total_yield_paid = vault.total_yield_paid + yield_out;

        // Position record is kept so risk_acknowledged is preserved on re-entry.
        if (pos.principal == 0 && prior_principal > 0) {
            vault.total_depositors = vault.total_depositors - 1;
        };

        let out_coin = coin::from_balance(balance::split(&mut vault.balance, total_out), ctx);
        transfer::public_transfer(out_coin, user);

        event::emit(YieldWithdrawn {
            user, principal_out: principal_amount, yield_out, timestamp_ms: now_ms,
        });
    }

    // ── Admin: APY ────────────────────────────────────────────────────────────

    /// Schedules a new APY. `effective_at_ms` must be a future timestamp.
    public fun update_apy<T>(
        _cap: &AdminCap,
        vault: &mut YieldVault<T>,
        new_apy: u64,
        effective_at_ms: u64,
        clock: &Clock,
    ) {
        let now = clock::timestamp_ms(clock);
        apply_pending_apy(vault, now);
        assert!(effective_at_ms > now, E_INVALID_TIMESTAMP);
        vault.pending_apy = new_apy;
        vault.pending_apy_effective_at_ms = effective_at_ms;
        event::emit(ApyUpdated { old_apy: vault.current_apy, new_apy, timestamp_ms: now, effective_at_ms });
    }

    fun apply_pending_apy<T>(vault: &mut YieldVault<T>, now_ms: u64) {
        if (vault.pending_apy_effective_at_ms > 0 && now_ms >= vault.pending_apy_effective_at_ms) {
            vault.current_apy = vault.pending_apy;
            vault.apy_effective_at_ms = vault.pending_apy_effective_at_ms;
            vault.pending_apy = 0;
            vault.pending_apy_effective_at_ms = 0;
        }
    }

    /// Settles and snapshots accrued yield for a user. Consumed by the backend webhook.
    public fun emit_accrual_snapshot<T>(
        _cap: &AdminCap,
        vault: &mut YieldVault<T>,
        user: address,
        clock: &Clock,
    ) {
        assert!(table::contains(&vault.positions, user), E_NO_POSITION);
        let now_ms = clock::timestamp_ms(clock);
        apply_pending_apy(vault, now_ms);
        let pos = table::borrow_mut(&mut vault.positions, user);
        let pending = compute_yield(pos.principal, pos.last_apy, now_ms - pos.last_update_ms);
        pos.accrued_yield  = pos.accrued_yield + pending;
        pos.last_update_ms = now_ms;
        event::emit(DailyAccrualSnapshot {
            user, accrued_amount: pending, total_yield: pos.accrued_yield,
            apy: vault.current_apy, timestamp_ms: now_ms,
        });
    }

    // ── Admin: inject yield ───────────────────────────────────────────────────

    /// Deposits externally-sourced yield into the vault. This is the sole
    /// mechanism for funding withdrawable yield; the contract does not
    /// self-generate returns.
    public fun inject_yield<T>(
        _cap: &AdminCap,
        vault: &mut YieldVault<T>,
        yield_coin: Coin<T>,
        clock: &Clock,
    ) {
        let amount = coin::value(&yield_coin);
        assert!(amount > 0, E_ZERO_AMOUNT);
        balance::join(&mut vault.balance, coin::into_balance(yield_coin));
        event::emit(YieldInjected {
            amount,
            new_vault_balance: balance::value(&vault.balance),
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ── Admin: pause ──────────────────────────────────────────────────────────
    public fun pause_vault<T>(_cap: &AdminCap, vault: &mut YieldVault<T>) {
        vault.paused = true;
    }
    public fun unpause_vault<T>(_cap: &AdminCap, vault: &mut YieldVault<T>) {
        vault.paused = false;
    }

    // ── Math ──────────────────────────────────────────────────────────────────

    /// Simple interest: principal * apy * elapsed_ms / (APY_SCALE * MS_PER_YEAR).
    /// u128 intermediates prevent overflow on large positions.
    fun compute_yield(principal: u64, apy: u64, elapsed_ms: u64): u64 {
        if (principal == 0 || apy == 0 || elapsed_ms == 0) { return 0 };
        let result = (principal as u128) * (apy as u128) * (elapsed_ms as u128)
            / ((APY_SCALE as u128) * (MS_PER_YEAR as u128));
        (result as u64)
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    public fun vault_balance<T>(v: &YieldVault<T>): u64 { balance::value(&v.balance) }
    public fun current_apy<T>(v: &YieldVault<T>): u64   { v.current_apy }
    public fun is_paused<T>(v: &YieldVault<T>): bool     { v.paused }
    public fun get_principal<T>(v: &YieldVault<T>, user: address): u64 {
        if (table::contains(&v.positions, user)) {
            table::borrow(&v.positions, user).principal
        } else { 0 }
    }
}
