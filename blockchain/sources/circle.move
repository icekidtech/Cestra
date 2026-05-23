/// cestra::circle
/// Savings Circle (rotating savings / Susu / Chama / Tanda / Hui).
///
/// A group of N members each contribute a fixed amount every period.
/// One member receives the full pot each period. The order rotates until
/// every member has received once. All logic is deterministic and on-chain —
/// no manual admin distribution required after circle creation.
///
/// Lifecycle:
///   create_circle → join (N members) → start_circle (admin) →
///   contribute_period* → payout_period* → circle_complete
///
/// Penalty: missed contributors are excluded from the next period
///   (forfeiture of remaining payout eligibility).
module cestra::circle {
    use sui::object::{UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use cestra::compliance::{Self, ComplianceRegistry, AdminCap};

    // ── Errors ───────────────────────────────────────────────────────────────
    const E_CIRCLE_FULL: u64           = 400;
    const E_ALREADY_MEMBER: u64        = 401;
    const E_ALREADY_STARTED: u64       = 402;
    const E_NOT_STARTED: u64           = 403;
   // const E_PERIOD_NOT_OPEN: u64       = 404;
    const E_ALREADY_CONTRIBUTED: u64   = 405;
    const E_NOT_MEMBER: u64            = 406;
    const E_PERIOD_NOT_COMPLETE: u64   = 407;
   // const E_CIRCLE_COMPLETE: u64       = 408;
    const E_ZERO_AMOUNT: u64           = 409;
    const E_MEMBER_EXCLUDED: u64       = 410;
    const E_PERIOD_DEADLINE_PASSED: u64 = 411;

    // ── Status ───────────────────────────────────────────────────────────────
    const CIRCLE_FORMING: u8  = 0;
    const CIRCLE_ACTIVE: u8   = 1;
    const CIRCLE_COMPLETE: u8 = 2;

    // ── Objects ──────────────────────────────────────────────────────────────

    public struct Circle<phantom T> has key {
        id: UID,
        creator: address,
        /// Number of members the circle will accept
        max_members: u64,
        /// Fixed contribution per member per period
        contribution_amount: u64,
        /// Period in milliseconds (weekly=604_800_000, biweekly=1_209_600_000, monthly=2_592_000_000)
        period_ms: u64,
        status: u8,
        /// Ordered payout list (address of recipient for each period, index = period number)
        payout_order: vector<address>,
        /// Current period index (0-based)
        current_period: u64,
        /// Timestamp when current period started
        period_start_ms: u64,
        /// Members that have contributed: address -> period_nonce
        period_contributions: Table<address, u64>,
        period_nonce: u64,
        /// Count of contributions received this period
        period_contribution_count: u64,
        /// Members that have been excluded (missed payment)
        excluded_members: Table<address, bool>,
        /// All members for O(1) lookups
        members: Table<address, bool>,
        /// All-time pot balance
        pot: Balance<T>,
        /// Total members joined
        member_count: u64,
        /// Active members (not excluded)
        active_member_count: u64,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    public struct CircleCreated has copy, drop {
        circle_id: ID, creator: address, max_members: u64,
        contribution_amount: u64, period_ms: u64, timestamp_ms: u64,
    }
    public struct MemberJoined has copy, drop {
        circle_id: ID, member: address, position: u64, timestamp_ms: u64,
    }
    public struct CircleStarted has copy, drop {
        circle_id: ID, member_count: u64, started_at_ms: u64,
    }
    public struct ContributionMade has copy, drop {
        circle_id: ID, contributor: address, period: u64,
        amount: u64, timestamp_ms: u64,
    }
    public struct PeriodPayout has copy, drop {
        circle_id: ID, period: u64, recipient: address,
        amount: u64, paid_at_ms: u64,
    }
    public struct MemberExcluded has copy, drop {
        circle_id: ID, member: address, period: u64, reason: u8,
    }
    public struct CircleCompleted has copy, drop {
        circle_id: ID, total_periods: u64, completed_at_ms: u64,
    }

    // ── Create ────────────────────────────────────────────────────────────────

    #[allow(unused_let_mut)]
    public fun create_circle<T>(
        compliance: &ComplianceRegistry,
        max_members: u64,
        contribution_amount: u64,
        period_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let creator = tx_context::sender(ctx);
        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, creator);
        compliance::assert_kyc_tier(compliance, creator, compliance::tier_2());
        assert!(max_members > 1 && max_members <= 50, E_CIRCLE_FULL);
        assert!(contribution_amount > 0, E_ZERO_AMOUNT);
        assert!(period_ms > 0, E_ZERO_AMOUNT);

        // Creator is first member and first in payout order
        let mut payout_order = vector[creator];

        let period_contributions = table::new<address, u64>(ctx);
        let excluded_members = table::new<address, bool>(ctx);
        let mut members = table::new<address, bool>(ctx);
        table::add(&mut members, creator, true);

        let circle = Circle<T> {
            id: object::new(ctx),
            creator,
            max_members,
            contribution_amount,
            period_ms,
            status: CIRCLE_FORMING,
            payout_order,
            current_period: 0,
            period_start_ms: 0,
            period_contributions,
            period_nonce: 1,
            period_contribution_count: 0,
            excluded_members,
            members,
            pot: balance::zero<T>(),
            member_count: 1,
            active_member_count: 1,
        };

        event::emit(CircleCreated {
            circle_id: object::uid_to_inner(&circle.id),
            creator,
            max_members,
            contribution_amount,
            period_ms,
            timestamp_ms: clock::timestamp_ms(clock),
        });

        transfer::share_object(circle);
    }

    // ── Join ──────────────────────────────────────────────────────────────────

    public fun join_circle<T>(
        circle: &mut Circle<T>,
        compliance: &ComplianceRegistry,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let member = tx_context::sender(ctx);
        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, member);
        compliance::assert_kyc_tier(compliance, member, compliance::tier_1());

        assert!(circle.status == CIRCLE_FORMING, E_ALREADY_STARTED);
        assert!(circle.member_count < circle.max_members, E_CIRCLE_FULL);

        // Prevent double-join
        assert!(!table::contains(&circle.members, member), E_ALREADY_MEMBER);

        table::add(&mut circle.members, member, true);

        let position = vector::length(&circle.payout_order);
        vector::push_back(&mut circle.payout_order, member);
        circle.member_count = circle.member_count + 1;
        circle.active_member_count = circle.active_member_count + 1;

        event::emit(MemberJoined {
            circle_id: object::uid_to_inner(&circle.id),
            member,
            position,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ── Start ─────────────────────────────────────────────────────────────────

    /// Admin starts the circle once all members have joined.
    public fun start_circle<T>(
        _cap: &AdminCap,
        circle: &mut Circle<T>,
        clock: &Clock,
    ) {
        assert!(circle.status == CIRCLE_FORMING, E_ALREADY_STARTED);
        let now_ms = clock::timestamp_ms(clock);
        circle.status = CIRCLE_ACTIVE;
        circle.period_start_ms = now_ms;

        event::emit(CircleStarted {
            circle_id: object::uid_to_inner(&circle.id),
            member_count: circle.member_count,
            started_at_ms: now_ms,
        });
    }

    // ── Contribute ────────────────────────────────────────────────────────────

    /// Each member pays their contribution for the current period.
    #[allow(lint(self_transfer))]
    public fun contribute_period<T>(
        circle: &mut Circle<T>,
        compliance: &mut ComplianceRegistry,
        coin_in: Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let contributor = tx_context::sender(ctx);
        let now_ms = clock::timestamp_ms(clock);

        assert!(circle.status == CIRCLE_ACTIVE, E_NOT_STARTED);
        assert!(now_ms < circle.period_start_ms + circle.period_ms, E_PERIOD_DEADLINE_PASSED);

        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, contributor);

        // Must be a member
        assert!(table::contains(&circle.members, contributor), E_NOT_MEMBER);
        assert!(!table::contains(&circle.excluded_members, contributor), E_MEMBER_EXCLUDED);
        
        let already_contributed = table::contains(&circle.period_contributions, contributor) &&
            *table::borrow(&circle.period_contributions, contributor) == circle.period_nonce;
        assert!(!already_contributed, E_ALREADY_CONTRIBUTED);

        assert!(coin::value(&coin_in) >= circle.contribution_amount, E_ZERO_AMOUNT);
        let mut payment = coin_in;
        let contribution = coin::split(&mut payment, circle.contribution_amount, ctx);
        let remainder = coin::value(&payment);
        if (remainder > 0) {
            transfer::public_transfer(payment, contributor);
        } else {
            coin::destroy_zero(payment);
        };

        balance::join(&mut circle.pot, coin::into_balance(contribution));
        
        if (table::contains(&circle.period_contributions, contributor)) {
            *table::borrow_mut(&mut circle.period_contributions, contributor) = circle.period_nonce;
        } else {
            table::add(&mut circle.period_contributions, contributor, circle.period_nonce);
        };
        
        circle.period_contribution_count = circle.period_contribution_count + 1;

        compliance::record_volume(compliance, contributor, circle.contribution_amount, clock);

        event::emit(ContributionMade {
            circle_id: object::uid_to_inner(&circle.id),
            contributor,
            period: circle.current_period,
            amount: circle.contribution_amount,
            timestamp_ms: now_ms,
        });
    }

    // ── Payout period ─────────────────────────────────────────────────────────

    /// Admin triggers payout after all active members have contributed.
    /// Also marks any missing contributors as excluded.
    public fun payout_period<T>(
        _cap: &AdminCap,
        circle: &mut Circle<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(circle.status == CIRCLE_ACTIVE, E_NOT_STARTED);
        let now_ms = clock::timestamp_ms(clock);
        // Allow payout after deadline even if not all contributed
        assert!(
            now_ms >= circle.period_start_ms + circle.period_ms ||
            circle.period_contribution_count >= circle.active_member_count,
            E_PERIOD_NOT_COMPLETE
        );

        // Exclude members who didn't contribute
        let len = vector::length(&circle.payout_order);
        let mut i = 0;
        while (i < len) {
            let member = *vector::borrow(&circle.payout_order, i);
            let contributed = table::contains(&circle.period_contributions, member) &&
                *table::borrow(&circle.period_contributions, member) == circle.period_nonce;
            if (!table::contains(&circle.excluded_members, member) && !contributed) {
                table::add(&mut circle.excluded_members, member, true);
                circle.active_member_count = circle.active_member_count - 1;
                event::emit(MemberExcluded {
                    circle_id: object::uid_to_inner(&circle.id),
                    member,
                    period: circle.current_period,
                    reason: 1, // missed payment
                });
            };
            i = i + 1;
        };

        // Identify recipient for this period
        let recipient = *vector::borrow(&circle.payout_order, circle.current_period);

        let payout_amount = balance::value(&circle.pot);
        if (!table::contains(&circle.excluded_members, recipient)) {
            if (payout_amount > 0) {
                let out_balance = balance::withdraw_all(&mut circle.pot);
                let out_coin = coin::from_balance(out_balance, ctx);
                transfer::public_transfer(out_coin, recipient);
            };

            event::emit(PeriodPayout {
                circle_id: object::uid_to_inner(&circle.id),
                period: circle.current_period,
                recipient,
                amount: payout_amount,
                paid_at_ms: now_ms,
            });
        };

        // Clear period state and increment nonce
        circle.current_period = circle.current_period + 1;
        circle.period_start_ms = now_ms;
        circle.period_contribution_count = 0;
        circle.period_nonce = circle.period_nonce + 1;

        // Check if circle is complete
        if (circle.current_period >= len) {
            circle.status = CIRCLE_COMPLETE;
            event::emit(CircleCompleted {
                circle_id: object::uid_to_inner(&circle.id),
                total_periods: circle.current_period,
                completed_at_ms: now_ms,
            });
        };
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    public fun circle_status<T>(c: &Circle<T>): u8     { c.status }
    public fun current_period<T>(c: &Circle<T>): u64   { c.current_period }
    public fun pot_balance<T>(c: &Circle<T>): u64      { balance::value(&c.pot) }
    public fun member_count<T>(c: &Circle<T>): u64     { c.member_count }
    public fun current_recipient<T>(c: &Circle<T>): address {
        *vector::borrow(&c.payout_order, c.current_period)
    }
    public fun is_member_excluded<T>(c: &Circle<T>, member: address): bool {
        table::contains(&c.excluded_members, member)
    }
}
