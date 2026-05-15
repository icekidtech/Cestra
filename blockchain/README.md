# Blockchain Workspace

## Purpose

The `blockchain/` workspace contains all Sui Move smart contracts for the Cestra platform. It implements the on-chain settlement layer (L3) responsible for stablecoin transfers, group pooling, yield accrual, rotating savings circles, FX rate locking, compliance enforcement, and cross-chain bridging. No business logic is active yet — each module is a stub awaiting implementation.

---

## Prerequisites

- **Sui CLI ≥ 1.x** — Install guide: [https://docs.sui.io/guides/developer/getting-started/sui-install](https://docs.sui.io/guides/developer/getting-started/sui-install)
- **Move edition**: `2024.beta` (required by this package; ensure your Sui CLI supports it)

---

## Contract Modules

| Module Name          | Source File                  | Purpose                                                              | Audit Required |
|----------------------|------------------------------|----------------------------------------------------------------------|----------------|
| `cestra::send`       | `sources/send.move`          | USDsui/USDC transfers with fee deduction and routing                 | Yes            |
| `cestra::pool`       | `sources/pool.move`          | Group Send pooling: contributions, payout, refund                    | Yes            |
| `cestra::yield`      | `sources/yield.move`         | Suilend interface: deposit, accrue, withdraw                         | Yes            |
| `cestra::circle`     | `sources/circle.move`        | Rotating savings circle: members, schedule, payouts                  | Yes            |
| `cestra::ratelock`   | `sources/ratelock.move`      | FX forward contract via DeepBook oracle                              | Yes            |
| `cestra::compliance` | `sources/compliance.move`    | On-chain blacklist, transaction limits, OFAC hooks                   | Yes            |
| `cestra::bridge`     | `sources/bridge.move`        | CCTP V2 and Wormhole interface for cross-chain USDC                  | Yes            |

---

## Commands

```bash
# Compile all Move modules — exits with code 0 if all stubs are valid
sui move build

# Run Move unit tests — exits cleanly (no test functions defined in stubs yet)
sui move test
```

---

## Quick Start

1. **Install Sui CLI** — follow the guide at [https://docs.sui.io/guides/developer/getting-started/sui-install](https://docs.sui.io/guides/developer/getting-started/sui-install) and verify with `sui --version` (must be ≥ 1.x).
2. **Clone the repo and navigate to this workspace**:
   ```bash
   git clone <repo-url>
   cd Cestra/blockchain
   ```
3. **Build the package**:
   ```bash
   sui move build
   ```
   A successful build prints no errors and exits with code 0.
