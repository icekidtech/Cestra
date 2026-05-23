# Cestra Smart Contracts — Architecture Reference

> **Primary Chain:** Sui (Move) · **Testnet target:** `framework/testnet`

---

## Contract Map

| Module | File | Purpose | Audit Required |
|---|---|---|---|
| `cestra::compliance` | `compliance.move` | Blacklist, KYC tiers, tx limits, OFAC, pause | Yes |
| `cestra::send` | `send.move` | Core payment: fee deduction, routing, confirm/refund | Yes |
| `cestra::pool` | `pool.move` | Group Send: pool contributions to payout or refund | Yes |
| `cestra::yield` | `yield.move` | Opt-in yield vault, Suilend interface, APY accrual | Yes |
| `cestra::circle` | `circle.move` | Rotating savings (Susu/Chama), auto-payouts | Yes |
| `cestra::ratelock` | `ratelock.move` | FX forward rate lock for businesses, 24h window | Yes |
| `cestra::bridge` | `bridge.move` | CCTP V2 + Wormhole inbound USDC receive | Yes |

---

## Security Architecture

### Authority Model
Every admin-gated function uses the **owned-object capability pattern** — no single private-key admin anywhere.

| Capability | Holder | Powers |
|---|---|---|
| `AdminCap` (compliance) | Cestra multisig | Blacklist, KYC tier updates, system pause |
| `AdminCap` (send) | Cestra multisig | Confirm delivery, issue refunds, fee rate proposals |
| `AdminCap` (pool) | Cestra multisig | Execute payouts, initiate refunds |
| `AdminCap` (yield) | Cestra multisig | Update APY, create vaults, pause vault |
| `AdminCap` (circle) | Cestra multisig | Start circles, trigger payouts |
| `AdminCap` (ratelock) | Cestra multisig | Mark expired locks, fee rate proposals |
| `AdminCap` (bridge) | Cestra multisig | Grant BridgeCap, pause bridge, update limits |
| `BridgeCap` | Bridge relayer service | Complete CCTP / Wormhole receives |

### Critical Invariants

**`cestra::send`**
- `fee = amount x 80 / 10_000` (exactly 0.80% — enforced in pure integer math)
- `amount + fee` debited atomically in a single operation
- A tx can only be CONFIRMED **or** REFUNDED — never both (terminal state guard)
- All operations are idempotent via `tx_id` key

**`cestra::pool`**
- Pool balance held on-chain in `Balance<T>` — never leaves until execution or refund
- Refund amounts tracked per contributor — no over-refund possible
- Once EXECUTED or REFUNDED, status is immutably final

**`cestra::bridge`**
- Every CCTP nonce / Wormhole VAA hash stored in `ProcessedMessages` on first use
- Re-submission of same nonce/hash aborts with `E_ALREADY_PROCESSED`

### Upgrade Timelock
Critical parameter changes require a **48-hour timelock**:
1. `propose_*` — records pending change and `valid_at_ms = now + 48h`
2. `execute_*` — only callable after `valid_at_ms` has passed

---

## Fee Structure

| Action | Fee | Beneficiary |
|---|---|---|
| Send | 0.80% of send amount | Cestra treasury |
| Rate Lock | 0.15% of locked amount | Cestra treasury |
| Pool contribution | None | — |
| Yield deposit/withdraw | None | — |
| Bridge inbound | None on-chain | — |

---

## KYC Tier Enforcement

| Tier | Requirement | Per-tx Limit |
|---|---|---|
| 0 | None | Blocked |
| 1 | Email only | $999 |
| 2 | ID + selfie | $3,000 |
| 3 | Enhanced due diligence | $10,000 |

Tier set on-chain via `compliance::set_kyc_tier` (admin only, after Persona verification).

---

## Bridge Flow

```
[Ethereum / Base / Avalanche]      [Solana]
    USDC send via CCTP V2       USDC via Wormhole
           |                           |
    CCTP Attestation              Wormhole VAA
           |                           |
        Backend Relayer (monitors off-chain)
           |
    complete_cctp_receive()  /  complete_wormhole_receive()
           |                           |
    ProcessedMessages (nonce registry - replay prevention)
           |
    USDC credited to recipient on Sui
```

---

## Deployment Order

Deploy in this dependency order:
1. `cestra::compliance` — no dependencies
2. `cestra::send` — depends on compliance
3. `cestra::pool` — depends on compliance
4. `cestra::yield` — depends on compliance
5. `cestra::circle` — depends on compliance
6. `cestra::ratelock` — depends on compliance
7. `cestra::bridge` — depends on compliance

**Post-deployment steps:**
- Transfer all `AdminCap`s to the Cestra multisig wallet
- Call `grant_bridge_cap` to issue `BridgeCap` to the relayer service account
- Set initial KYC tiers for beta users via `set_kyc_tier`
- Call `create_vault` and `update_apy` on YieldVault

---

## Testing Checklist

- [ ] Unit tests: all entry functions with valid + invalid inputs
- [ ] Invariant tests: fee calculation, terminal state guards, replay prevention
- [ ] Fuzz: arithmetic edge cases (min/max u64, zero amounts)
- [ ] Integration: full send flow on testnet (send -> confirm_delivery)
- [ ] Integration: pool create -> contribute -> execute + refund paths
- [ ] Integration: CCTP receive with duplicate nonce rejection
- [ ] Integration: yield deposit -> accrue -> withdraw
- [ ] Integration: savings circle full rotation
- [ ] Security audit: OtterSec / Zellic / Trail of Bits before mainnet
