# Cafe Aadvikam — Point of Sale System

A multi-role POS system for Cafe Aadvikam and associated bakery/branch outlets.
Built with **React 18 + Vite + TypeScript + Zustand + Supabase**.

## Quick Starts

```bash
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm ci
# In Supabase SQL Editor, run: supabase/migrations/001_security.sql
npm run dev
```  

## Roles & Routes

| Role | Default Route |
|------|--------------|
| `admin` | `/admin-dashboard` |
| `billing` | `/billing` |
| `order_taker` | `/order-pad` |
| `kitchen` | `/kitchen` |
| `baker` | `/bakery/baker` |
| `store` | `/bakery/store` |
| `packing` | `/bakery/packing` |
| `order_receiver` | `/bakery/receive` |
| `branch_vrsnb` | `/branch/vrsnb` |
| `branch_snb` | `/branch/snb` |
| `branch_hosur` | `/branch/hosur` |

## Required Supabase Tables

`staff_users`, `menu_items`, `orders`, `employees`, `attendance`,
`bakery_orders`, `bakery_items`, `branch_stock`, `branch_sales`,
`branch_incoming`, `branch_advance_orders`, `branch_thresholds`,
`branch_stock_mismatches`, `login_attempts`

## Required RPCs (all in 001_security.sql)

| RPC | Purpose |
|-----|---------|
| `login_staff` | Bcrypt auth + rate limiting |
| `get_next_order_number` | Atomic sequence order numbers |
| `decrement_branch_stock` | Atomic stock decrement (race-safe) |
| `increment_branch_stock` | Rollback helper |
| `confirm_incoming_stock` | Atomic incoming confirmation |
| `archive_old_branch_sales` | Soft-archive old sales |

## Git Workflow

- `main` — production (protected: 1 PR review + CI pass required)
- `feature/*` — new features
- `fix/*` — bug fixes

## Deployment (Vercel)

Set these environment variables in Vercel (never the `service_role` key):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
