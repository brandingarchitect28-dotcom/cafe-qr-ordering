# SmartCafé OS — Fee Extension Deploy Guide

## Files to deploy (3 total)

| File | Destination in your repo |
|------|--------------------------|
| `src/services/reportService.js`                   | NEW file — create it |
| `src/components/dashboard/Analytics.jsx`          | REPLACE existing file |
| `src/components/dashboard/Settings.jsx`           | REPLACE existing file |

## Deploy order

1. Add `src/services/reportService.js`  (new file, no conflicts)
2. Replace `src/components/dashboard/Settings.jsx`
3. Replace `src/components/dashboard/Analytics.jsx`
4. Push → Netlify auto-deploys

## What changed in each file

### reportService.js (NEW)
Pure functions — no side effects, no Firebase imports.
- `calcOrderServiceCharge(order)` → reads `order.serviceChargeAmount` (0 for old orders)
- `calcOrderPlatformFee(order, cafe)` → reads `order.platformFeeAmount` (0 for old orders)
- `calcFeeSummary(orders, cafe)` → aggregates across paid orders
- `downloadCSV(orders, cafe)` → triggers browser CSV download with BOM (Excel-safe)
- `downloadPDFPrint(orders, cafe)` → opens styled print window (no jsPDF needed)

### Analytics.jsx (EXTENDED)
Zero existing code removed or modified. Additions only:
- Imports `calcFeeSummary`, `downloadCSV`, `downloadPDFPrint` from reportService
- `[pdf/csvLoading]` state for button spinners
- `feeSummary` useMemo (new calc, doesn't touch existing `analytics` useMemo)
- Download buttons row (PDF + GST CSV) — above all charts
- Service Charges card — only shown if `cafe.serviceChargeEnabled === true`
- Platform Fees card — only shown if `cafe.platformFeeEnabled === true`
- Payment Breakdown section — only shown when at least one fee is enabled

### Settings.jsx (EXTENDED)
Zero existing UI changed. New "Platform Fee" section added after Service Charge.
- Toggle: `platformFeeEnabled`
- Dropdown: `platformFeeType` (percentage | fixed)
- Input: `platformFeeValue`
- Saved to / loaded from Firestore automatically

## Enabling fees

1. Go to Dashboard → Settings → Platform Fee section
2. Toggle ON
3. Choose type (% or fixed) and enter value
4. Save Settings
5. Go to Analytics — new cards appear immediately

## Backward compatibility

- Old orders with no `serviceChargeAmount` → reads as 0, no crash
- Old orders with no `platformFeeAmount` → falls back to computing from cafe settings
- Both flags off → zero new UI rendered, no behaviour change
- No existing chart, calculation, or Firestore schema modified

## GST logic

- Service charge: included in `grossRevenue` (customer pays it, cafe earns it)
- Platform fee: treated as a cost/deduction from net revenue (cafe pays it)
- GST collected: sum of `order.gstAmount + order.taxAmount` — unchanged from current
