# Solana Flip ⚡

Minimal P2P coin flip built on Solana.

## Live

https://filponsol.vercel.app/

## Preview

![Solana Flip Screenshot](/screenshot.png)

---

## Overview

Solana Flip is a peer-to-peer coin flip game where users bet in SOL.

The focus is simplicity:

- Clear mechanics
- Low friction
- Transparent fee structure
- Minimal surface area

No unnecessary abstractions.
No over-engineering.

---

## Features

- P2P coin flip in SOL
- 3% house edge
- 0.5% play fee
- Phantom wallet integration
- Fast UI updates
- Clean game state handling

---

## How It Works

1. Player creates a flip with a chosen stake
2. Another player joins the flip
3. Outcome is determined
4. Winner receives payout minus fees

Flow:

Client → Wallet → Transaction → On-chain logic → UI update

---

## Fee Model

- 3% house edge
- 0.5% play fee

Designed for sustainability and long-term volume.

---

## Stack

- Next.js
- TypeScript
- Solana Web3.js
- Vercel
- (Oracle / VRF integration if applicable)

---

## Roadmap

- [x] Core P2P flip mechanic
- [x] Wallet integration
- [x] Fee logic
- [ ] Leaderboard
- [ ] Token multiplier integration
- [ ] Enhanced randomness model

---

## Run Locally

```bash
npm install
npm run dev
