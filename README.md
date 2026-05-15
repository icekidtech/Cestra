# CESTRA

Cestra is a cross-border stablecoin payment platform built on the Sui blockchain, designed to make international money transfers cheap, fast, and transparent. It enables diaspora senders and businesses to move value across borders using USDC and USDsui, settling transactions on-chain in seconds rather than days. Cestra abstracts away the complexity of blockchain infrastructure, giving users a familiar payment experience while leveraging Sui's high throughput and low fees. The platform connects ACH rails, on-chain Move smart contracts, and local off-ramp partners to deliver funds in the recipient's local currency.

---

## Workspace Overview

| Directory | Technology Stack | Purpose |
|---|---|---|
| `backend/` | NestJS · TypeORM · PostgreSQL | REST API, off-chain orchestration, database access, and business logic services |
| `blockchain/` | Sui Move · Sui CLI | On-chain smart contracts for transfers, pooling, yield, compliance, and cross-chain bridging |
| `web/` | Next.js · React · Tailwind CSS | Consumer web dashboard and business portal for initiating and tracking payments |

---

## Prerequisites

Ensure the following tools are installed before working in any workspace:

| Tool | Minimum Version |
|---|---|
| Node.js | ≥ 20 |
| pnpm | ≥ 9 (or npm ≥ 10) |
| Sui CLI | ≥ 1.x |
| PostgreSQL | ≥ 15 |

---

## Getting Started

Follow the steps below for each workspace. Each workspace is independent — you can set up only the one you need.

### Backend (`backend/`)

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Copy environment file and fill in values
cp .env.example .env
# Edit .env with your PostgreSQL credentials and other settings

# 3. Start the development server
npm run start:dev
```

### Blockchain (`blockchain/`)

```bash
# 1. Build the Move package (no Node.js dependencies)
cd blockchain
sui move build

# 2. Run Move tests
sui move test
```

### Web (`web/`)

```bash
# 1. Install dependencies
cd web
npm install

# 2. Copy environment file and fill in values
cp .env.example .env
# Edit .env with your API base URL and environment name

# 3. Start the development server
npm run dev
```

---

## Architecture

For a detailed breakdown of the system layers, workspace-to-layer mapping, transaction flow, smart contract modules, and cross-chain integrations, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Contributing

### Branch Naming

Use the following convention for all branches:

| Prefix | Use case |
|---|---|
| `feat/<scope>` | New features (e.g., `feat/backend-auth`, `feat/web-send-form`) |
| `fix/<scope>` | Bug fixes (e.g., `fix/blockchain-ratelock`, `fix/web-layout`) |
| `chore/<scope>` | Maintenance tasks (e.g., `chore/update-deps`, `chore/ci-pipeline`) |

### Pull Request Process

1. Create a branch from `main` using the naming convention above.
2. Implement your changes and ensure all tests pass locally.
3. Open a pull request against `main` with a clear title and description.
4. Request a review from at least one team member.
5. Address review feedback and resolve all conversations before merging.
6. Merge to `main` only after approval — squash merge is preferred to keep history clean.

### GitHub Issues

Tasks and bugs are tracked via GitHub Issues. Use the following workspace labels to categorise issues:

| Label | Scope |
|---|---|
| `backend` | NestJS API, TypeORM, PostgreSQL, off-chain services |
| `blockchain` | Sui Move contracts, Sui CLI, on-chain logic |
| `web` | Next.js frontend, UI components, Tailwind CSS |
| `docs` | Documentation updates (READMEs, ARCHITECTURE.md) |
| `infra` | CI/CD, Docker, deployment configuration |

Assign yourself to an issue before starting work to avoid duplicate effort.
