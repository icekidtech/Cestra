/// cestra::bridge
/// Cross-chain USDC receive interface.
///
/// Handles inbound USDC from:
///   - Circle CCTP V2 (Ethereum, Base, Avalanche → Sui)
///   - Wormhole messaging (Solana → Sui)
///
/// This contract acts as the on-chain settlement layer for cross-chain inflows.
/// The backend (bridge relayer) monitors attestations off-chain and calls
/// `complete_cctp_receive` or `complete_wormhole_receive` after verifying
/// the cross-chain message/attestation.
///
/// Security:
///   - Only a designated bridge relayer (holding BridgeCap) can mint/credit.
///   - All inbound transactions are idempotent (keyed by source message nonce).
///   - Compliance gating: recipient must not be blacklisted.
///   - Min/max amount limits enforced on-chain.
///   - Emergency pause inherited from compliance module.
module cestra::bridge {
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use cestra::compliance::{Self, ComplianceRegistry, AdminCap};

    // ── Errors ───────────────────────────────────────────────────────────────
    const E_ALREADY_PROCESSED: u64 = 600;
    const E_BELOW_MINIMUM: u64     = 601;
    const E_ABOVE_MAXIMUM: u64     = 602;
    const E_INVALID_SOURCE: u64    = 603;
    const E_BRIDGE_PAUSED: u64     = 604;
    const E_NOT_AUTHORIZED: u64    = 605;
    const E_INSUFFICIENT_LIQUIDITY: u64 = 606;
    const E_INVALID_LIMIT: u64          = 607;

    // ── Source chain codes ────────────────────────────────────────────────────
    const CHAIN_ETHEREUM: u8  = 1;
    const CHAIN_BASE: u8      = 2;
    const CHAIN_AVALANCHE: u8 = 3;
    const CHAIN_SOLANA: u8    = 4;

    // ── Limits (USDC micro-units, 6 decimals) ─────────────────────────────────
    const MIN_INBOUND: u64  = 1_000_000;       // $1 minimum
    const MAX_INBOUND: u64  = 50_000_000_000;  // $50,000 maximum per PRD

    // ── Objects ──────────────────────────────────────────────────────────────

    /// Capability held by the bridge relayer service account.
    /// Created by admin and transferred to the relayer.
    public struct BridgeCap has key { id: UID }

    /// Shared bridge config.
    public struct BridgeConfig has key {
        id: UID,
        paused: bool,
        min_inbound: u64,
        max_inbound: u64,
        /// Total USDC credited via CCTP
        total_cctp_volume: u128,
        /// Total USDC credited via Wormhole
        total_wormhole_volume: u128,
        /// Relayers banned by admin
        banned_relayers: Table<address, bool>,
    }

    /// Processed message registry — prevents double-spend / replay attacks.
    public struct ProcessedMessages has key {
        id: UID,
        /// nonce/message_id → true (already processed)
        processed: Table<vector<u8>, bool>,
        total_count: u64,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    public struct CctpReceiveCompleted has copy, drop {
        message_nonce: vector<u8>,
        source_chain: u8,
        amount_usdc: u64,
        recipient: address,
        credited_at_ms: u64,
    }

    public struct WormholeReceiveCompleted has copy, drop {
        vaa_hash: vector<u8>,
        amount_usdc: u64,
        recipient: address,
        credited_at_ms: u64,
    }

    public struct BridgeCapGranted has copy, drop {
        relayer: address, timestamp_ms: u64,
    }

    public struct BridgePaused   has copy, drop { timestamp_ms: u64 }
    public struct BridgeUnpaused has copy, drop { timestamp_ms: u64 }

    // ── Init ─────────────────────────────────────────────────────────────────
    fun init(ctx: &mut TxContext) {
        transfer::share_object(BridgeConfig {
            id: object::new(ctx),
            paused: false,
            min_inbound: MIN_INBOUND,
            max_inbound: MAX_INBOUND,
            total_cctp_volume: 0,
            total_wormhole_volume: 0,
            banned_relayers: table::new(ctx),
        });
        transfer::share_object(ProcessedMessages {
            id: object::new(ctx),
            processed: table::new(ctx),
            total_count: 0,
        });
    }

    // ── Admin: grant and revoke bridge capability ─────────────────────────────

    public fun grant_bridge_cap(
        _admin: &AdminCap,
        relayer: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let cap = BridgeCap { id: object::new(ctx) };
        transfer::transfer(cap, relayer);
        event::emit(BridgeCapGranted { relayer, timestamp_ms: clock::timestamp_ms(clock) });
    }

    public fun revoke_bridge_cap(_admin: &AdminCap, cap: BridgeCap) {
        let BridgeCap { id } = cap;
        object::delete(id);
    }

    public fun ban_relayer(_admin: &AdminCap, config: &mut BridgeConfig, relayer: address) {
        if (!table::contains(&config.banned_relayers, relayer)) {
            table::add(&mut config.banned_relayers, relayer, true);
        }
    }

    public fun unban_relayer(_admin: &AdminCap, config: &mut BridgeConfig, relayer: address) {
        if (table::contains(&config.banned_relayers, relayer)) {
            table::remove(&mut config.banned_relayers, relayer);
        }
    }

    // ── CCTP V2 completion ────────────────────────────────────────────────────

    /// Called by bridge relayer after Circle CCTP V2 attestation is verified.
    /// Credits the recipient's Cestra balance (via coin transfer from reserve).
    ///
    /// `message_nonce` — unique CCTP message nonce (prevents replay)
    /// `source_chain`  — CHAIN_ETHEREUM | CHAIN_BASE | CHAIN_AVALANCHE
    /// `amount_usdc`   — amount to credit (net of any bridge fees)
    /// `recipient`     — Sui address to credit
    /// `credit_coin`   — actual USDC coin from the bridge reserve/mint
    public fun complete_cctp_receive<T>(
        _cap: &BridgeCap,
        config: &mut BridgeConfig,
        messages: &mut ProcessedMessages,
        compliance: &ComplianceRegistry,
        message_nonce: vector<u8>,
        source_chain: u8,
        amount_usdc: u64,
        recipient: address,
        credit_coin: Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!config.paused, E_BRIDGE_PAUSED);
        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, recipient);
        compliance::assert_within_tier_limit(compliance, recipient, amount_usdc);
        assert!(!table::contains(&config.banned_relayers, tx_context::sender(ctx)), E_NOT_AUTHORIZED);

        // Source chain must be CCTP-supported
        assert!(
            source_chain == CHAIN_ETHEREUM ||
            source_chain == CHAIN_BASE ||
            source_chain == CHAIN_AVALANCHE,
            E_INVALID_SOURCE
        );

        // Amount limits
        assert!(amount_usdc >= config.min_inbound, E_BELOW_MINIMUM);
        assert!(amount_usdc <= config.max_inbound, E_ABOVE_MAXIMUM);

        // Idempotency guard
        assert!(!table::contains(&messages.processed, message_nonce), E_ALREADY_PROCESSED);
        table::add(&mut messages.processed, message_nonce, true);
        messages.total_count = messages.total_count + 1;

        // Validate coin amount matches claimed amount
        assert!(coin::value(&credit_coin) == amount_usdc, E_INSUFFICIENT_LIQUIDITY);

        // Credit recipient
        transfer::public_transfer(credit_coin, recipient);

        config.total_cctp_volume = config.total_cctp_volume + (amount_usdc as u128);

        event::emit(CctpReceiveCompleted {
            message_nonce,
            source_chain,
            amount_usdc,
            recipient,
            credited_at_ms: clock::timestamp_ms(clock),
        });
    }

    // ── Wormhole completion ───────────────────────────────────────────────────

    /// Called by bridge relayer after Wormhole VAA (Verified Action Approval) is verified.
    /// Supports Solana USDC inbound transfers.
    ///
    /// `vaa_hash`   — keccak256 hash of the Wormhole VAA (prevents replay)
    /// `amount_usdc` — amount to credit
    /// `recipient`   — Sui address
    /// `credit_coin` — USDC coin to transfer
    public fun complete_wormhole_receive<T>(
        _cap: &BridgeCap,
        config: &mut BridgeConfig,
        messages: &mut ProcessedMessages,
        compliance: &ComplianceRegistry,
        vaa_hash: vector<u8>,
        amount_usdc: u64,
        recipient: address,
        credit_coin: Coin<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!config.paused, E_BRIDGE_PAUSED);
        compliance::assert_not_paused(compliance);
        compliance::assert_not_blacklisted(compliance, recipient);
        compliance::assert_within_tier_limit(compliance, recipient, amount_usdc);
        assert!(!table::contains(&config.banned_relayers, tx_context::sender(ctx)), E_NOT_AUTHORIZED);

        assert!(amount_usdc >= config.min_inbound, E_BELOW_MINIMUM);
        assert!(amount_usdc <= config.max_inbound, E_ABOVE_MAXIMUM);

        assert!(!table::contains(&messages.processed, vaa_hash), E_ALREADY_PROCESSED);
        table::add(&mut messages.processed, vaa_hash, true);
        messages.total_count = messages.total_count + 1;

        assert!(coin::value(&credit_coin) == amount_usdc, E_INSUFFICIENT_LIQUIDITY);
        transfer::public_transfer(credit_coin, recipient);

        config.total_wormhole_volume = config.total_wormhole_volume + (amount_usdc as u128);

        event::emit(WormholeReceiveCompleted {
            vaa_hash,
            amount_usdc,
            recipient,
            credited_at_ms: clock::timestamp_ms(clock),
        });
    }

    // ── Admin: pause ─────────────────────────────────────────────────────────
    public fun pause_bridge(
        _cap: &AdminCap, config: &mut BridgeConfig, clock: &Clock,
    ) {
        config.paused = true;
        event::emit(BridgePaused { timestamp_ms: clock::timestamp_ms(clock) });
    }

    public fun unpause_bridge(
        _cap: &AdminCap, config: &mut BridgeConfig, clock: &Clock,
    ) {
        config.paused = false;
        event::emit(BridgeUnpaused { timestamp_ms: clock::timestamp_ms(clock) });
    }

    // ── Admin: update limits ──────────────────────────────────────────────────
    public fun update_limits(
        _cap: &AdminCap,
        config: &mut BridgeConfig,
        new_min: u64,
        new_max: u64,
    ) {
        assert!(new_min > 0 && new_max > new_min, E_INVALID_LIMIT);
        config.min_inbound = new_min;
        config.max_inbound = new_max;
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    public fun is_message_processed(messages: &ProcessedMessages, nonce: vector<u8>): bool {
        table::contains(&messages.processed, nonce)
    }
    public fun is_bridge_paused(config: &BridgeConfig): bool { config.paused }
    public fun total_cctp_volume(config: &BridgeConfig): u128 { config.total_cctp_volume }
    public fun total_wormhole_volume(config: &BridgeConfig): u128 { config.total_wormhole_volume }
    public fun total_messages_processed(messages: &ProcessedMessages): u64 { messages.total_count }
    public fun chain_ethereum(): u8  { CHAIN_ETHEREUM }
    public fun chain_base(): u8      { CHAIN_BASE }
    public fun chain_avalanche(): u8 { CHAIN_AVALANCHE }
    public fun chain_solana(): u8    { CHAIN_SOLANA }
}
