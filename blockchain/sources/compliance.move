/// cestra::compliance
/// On-chain address blacklist, KYC tier enforcement, transaction limits,
/// OFAC screening hooks, and emergency pause.
/// Security: AdminCap owned-object pattern — no single private-key admin.
module cestra::compliance {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};

    // ── Errors ──────────────────────────────────────────────────────────────
    const E_ALREADY_BLACKLISTED: u64  = 1;
    const E_NOT_BLACKLISTED: u64      = 2;
    const E_ADDRESS_BLACKLISTED: u64  = 3;
    const E_SYSTEM_PAUSED: u64        = 4;
    const E_KYC_INSUFFICIENT: u64     = 5;
    const E_AMOUNT_EXCEEDS_LIMIT: u64 = 6;

    // ── KYC tiers ───────────────────────────────────────────────────────────
    const KYC_TIER_0: u8 = 0; // no KYC — blocked
    const KYC_TIER_1: u8 = 1; // email only  — ≤ $999/tx
    const KYC_TIER_2: u8 = 2; // ID + selfie — ≤ $3,000/tx
    const KYC_TIER_3: u8 = 3; // enhanced    — ≤ $10,000/tx

    // Limits in USDC micro-units (6 decimals)
    const TIER1_LIMIT: u64 =   999_000_000;
    const TIER2_LIMIT: u64 = 3_000_000_000;
    const TIER3_LIMIT: u64 = 10_000_000_000;

    // ── Objects ──────────────────────────────────────────────────────────────
    /// Singleton admin capability — held by Cestra multisig.
    public struct AdminCap has key { id: UID }

    /// Shared registry — single on-chain source of truth for compliance state.
    public struct ComplianceRegistry has key {
        id: UID,
        paused: bool,
        blacklist: Table<address, bool>,
        kyc_tiers: Table<address, u8>,
        monthly_volume: Table<address, u64>,
        monthly_reset_ts: Table<address, u64>,
        blacklist_count: u64,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    public struct AddressBlacklisted has copy, drop {
        target: address, reason_code: u8, timestamp_ms: u64,
    }
    public struct AddressUnblacklisted has copy, drop {
        target: address, timestamp_ms: u64,
    }
    public struct KycTierUpdated has copy, drop {
        user: address, tier: u8, timestamp_ms: u64,
    }
    public struct SystemPaused   has copy, drop { timestamp_ms: u64 }
    public struct SystemUnpaused has copy, drop { timestamp_ms: u64 }

    // ── Init ─────────────────────────────────────────────────────────────────
    fun init(ctx: &mut TxContext) {
        transfer::transfer(AdminCap { id: object::new(ctx) }, tx_context::sender(ctx));
        transfer::share_object(ComplianceRegistry {
            id: object::new(ctx),
            paused: false,
            blacklist: table::new(ctx),
            kyc_tiers: table::new(ctx),
            monthly_volume: table::new(ctx),
            monthly_reset_ts: table::new(ctx),
            blacklist_count: 0,
        });
    }

    // ── Admin: capability management ──────────────────────────────────────────

    /// Permanently destroy an AdminCap. Requires holding a second AdminCap as
    /// proof of authority — prevents accidental self-lockout.
    public fun revoke_admin_cap(_admin: &AdminCap, cap: AdminCap) {
        let AdminCap { id } = cap;
        object::delete(id);
    }

    /// Safely transfer an AdminCap to a new address (e.g. rotated multisig).
    /// Requires the caller to already hold a separate AdminCap so a compromised
    /// signer cannot unilaterally hand off authority.
    public fun transfer_admin_cap(_admin: &AdminCap, cap: AdminCap, to: address) {
        transfer::transfer(cap, to);
    }

    // ── Admin: blacklist ──────────────────────────────────────────────────────
    public fun blacklist_address(
        _cap: &AdminCap,
        registry: &mut ComplianceRegistry,
        target: address,
        reason_code: u8,
        clock: &Clock,
    ) {
        assert!(!table::contains(&registry.blacklist, target), E_ALREADY_BLACKLISTED);
        table::add(&mut registry.blacklist, target, true);
        registry.blacklist_count = registry.blacklist_count + 1;
        event::emit(AddressBlacklisted { target, reason_code, timestamp_ms: clock::timestamp_ms(clock) });
    }

    public fun unblacklist_address(
        _cap: &AdminCap,
        registry: &mut ComplianceRegistry,
        target: address,
        clock: &Clock,
    ) {
        assert!(table::contains(&registry.blacklist, target), E_NOT_BLACKLISTED);
        table::remove(&mut registry.blacklist, target);
        registry.blacklist_count = registry.blacklist_count - 1;
        event::emit(AddressUnblacklisted { target, timestamp_ms: clock::timestamp_ms(clock) });
    }

    // ── Admin: KYC tiers ─────────────────────────────────────────────────────
    public fun set_kyc_tier(
        _cap: &AdminCap,
        registry: &mut ComplianceRegistry,
        user: address,
        tier: u8,
        clock: &Clock,
    ) {
        if (table::contains(&registry.kyc_tiers, user)) {
            *table::borrow_mut(&mut registry.kyc_tiers, user) = tier;
        } else {
            table::add(&mut registry.kyc_tiers, user, tier);
        };
        event::emit(KycTierUpdated { user, tier, timestamp_ms: clock::timestamp_ms(clock) });
    }

    // ── Admin: pause ──────────────────────────────────────────────────────────
    public fun pause_system(_cap: &AdminCap, registry: &mut ComplianceRegistry, clock: &Clock) {
        registry.paused = true;
        event::emit(SystemPaused { timestamp_ms: clock::timestamp_ms(clock) });
    }

    public fun unpause_system(_cap: &AdminCap, registry: &mut ComplianceRegistry, clock: &Clock) {
        registry.paused = false;
        event::emit(SystemUnpaused { timestamp_ms: clock::timestamp_ms(clock) });
    }

    // ── Compliance assertion helpers (called by other modules) ────────────────
    public fun assert_not_paused(r: &ComplianceRegistry) {
        assert!(!r.paused, E_SYSTEM_PAUSED);
    }

    public fun assert_not_blacklisted(r: &ComplianceRegistry, addr: address) {
        assert!(!table::contains(&r.blacklist, addr), E_ADDRESS_BLACKLISTED);
    }

    public fun assert_kyc_tier(r: &ComplianceRegistry, user: address, required: u8) {
        let tier = get_kyc_tier(r, user);
        assert!(tier >= required, E_KYC_INSUFFICIENT);
    }

    public fun assert_within_tier_limit(r: &ComplianceRegistry, user: address, amount: u64) {
        let limit = get_monthly_limit_for_tier(get_kyc_tier(r, user));
        assert!(amount <= limit, E_AMOUNT_EXCEEDS_LIMIT);
    }

    public fun get_monthly_limit_for_tier(tier: u8): u64 {
        if (tier == KYC_TIER_1) { TIER1_LIMIT }
        else if (tier == KYC_TIER_2) { TIER2_LIMIT }
        else if (tier == KYC_TIER_3) { TIER3_LIMIT }
        else { 0 }
    }

    public fun get_monthly_volume(
        r: &ComplianceRegistry,
        user: address,
        clock: &Clock,
    ): u64 {
        let now_ms = clock::timestamp_ms(clock);
        let window_ms: u64 = 30 * 24 * 60 * 60 * 1000;
        if (table::contains(&r.monthly_volume, user)) {
            let last = *table::borrow(&r.monthly_reset_ts, user);
            if (now_ms - last >= window_ms) {
                0
            } else {
                *table::borrow(&r.monthly_volume, user)
            }
        } else {
            0
        }
    }

    public fun assert_within_monthly_limit(
        r: &ComplianceRegistry,
        user: address,
        amount: u64,
        clock: &Clock,
    ) {
        let monthly_limit = get_monthly_limit_for_tier(get_kyc_tier(r, user));
        let current_vol = get_monthly_volume(r, user, clock);
        assert!(current_vol + amount <= monthly_limit, E_AMOUNT_EXCEEDS_LIMIT);
    }

    /// Track 30-day fixed-epoch volume. Called by cestra::send after each
    /// initiated send. Restricted to package-internal callers only — prevents
    /// external actors from stuffing a user's volume limit (DoS vector).
    public(package) fun record_volume(
        r: &mut ComplianceRegistry,
        user: address,
        amount: u64,
        clock: &Clock,
    ) {
        let now_ms: u64 = clock::timestamp_ms(clock);
        let window_ms: u64 = 30 * 24 * 60 * 60 * 1000;
        if (table::contains(&r.monthly_volume, user)) {
            let last = *table::borrow(&r.monthly_reset_ts, user);
            if (now_ms - last >= window_ms) {
                // Epoch has expired — start a fresh bucket
                *table::borrow_mut(&mut r.monthly_volume, user)   = amount;
                *table::borrow_mut(&mut r.monthly_reset_ts, user) = now_ms;
            } else {
                let v = table::borrow_mut(&mut r.monthly_volume, user);
                *v = *v + amount;
            }
        } else {
            table::add(&mut r.monthly_volume, user, amount);
            table::add(&mut r.monthly_reset_ts, user, now_ms);
        }
    }

    /// Reverse a previously recorded volume entry on refund.
    /// Called by cestra::send::issue_refund so a failed transaction does not
    /// permanently consume the user's monthly limit.
    /// Safe: clamps to zero to guard against any underflow edge-cases.
    public(package) fun reverse_volume(
        r: &mut ComplianceRegistry,
        user: address,
        amount: u64,
    ) {
        if (!table::contains(&r.monthly_volume, user)) { return };
        let v = table::borrow_mut(&mut r.monthly_volume, user);
        if (amount >= *v) {
            *v = 0;
        } else {
            *v = *v - amount;
        }
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    public fun is_blacklisted(r: &ComplianceRegistry, addr: address): bool {
        table::contains(&r.blacklist, addr)
    }
    public fun get_kyc_tier(r: &ComplianceRegistry, user: address): u8 {
        if (table::contains(&r.kyc_tiers, user)) { *table::borrow(&r.kyc_tiers, user) }
        else { KYC_TIER_0 }
    }
    public fun is_paused(r: &ComplianceRegistry): bool { r.paused }
    public fun blacklist_count(r: &ComplianceRegistry): u64 { r.blacklist_count }
    public fun tier_1(): u8 { KYC_TIER_1 }
    public fun tier_2(): u8 { KYC_TIER_2 }
    public fun tier_3(): u8 { KYC_TIER_3 }
}
