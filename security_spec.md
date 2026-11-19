# Security Specification - Sumeth Rice Shop (สุเมธค้าข้าว)

This document outlines the hardened security architecture, role-based access control (RBAC) invariants, and defensive validation rules for Sumeth Rice Shop's Firestore database.

## 1. Data & Access Control Invariants

- **Default-Deny Baseline**:
  - Any path not explicitly matched is denied via `match /{document=**} { allow read, write: if false; }`.
- **Authentication & Verification**:
  - Zero unauthenticated reads or writes across every collection (`users`, `products`, `sales`, `customers`, `system`).
  - All authenticated reads and writes require a verified email (`request.auth.token.email_verified == true`).
- **Role-Based Access Control (RBAC) & PII Isolation**:
  - `users/{userId}`: Only the profile owner (`request.auth.uid == userId`) or an admin can `get` the document. Collection `list` is forbidden to prevent user email scraping. Self-escalation to `role: "admin"` is blocked unless the user's verified email is in the bootstrapped admin allowlist.
  - `products/{productId}`: Verified users can read (`get`, `list`). Only admins can `create`, `delete`, or edit product catalog fields (`name`, `price`, `category`, `imageUrl`). Employees may only update `stock` and `status` during checkout/bill cancellation.
  - `sales/{saleId}`: Verified users can read (`get`, `list`) and `create` new sales (`status: "สำเร็จ"`). Employees may only toggle `status` (`"สำเร็จ"` <-> `"ยกเลิก"`), while full edits and `delete` operations are strictly restricted to admins.
  - `customers/{customerId}`: Verified users can read (`get`, `list`) for POS/receipt selection. Only admins can `create`, `update`, or `delete` customer PII records.
  - `system/{docId}`: Verified users can `get` initialization status; `list` is forbidden, and writes/deletes are strictly restricted to admins.
- **Schema & Size Guards**:
  - Document IDs and entity IDs must match `^[a-zA-Z0-9_\\-]+$` (max 128 chars).
  - Strict `hasAll` + `hasOnly` key checks prevent shadow field injection.
  - All strings enforce explicit `.size()` bounds and numeric totals/prices/discounts/stocks must be non-negative.
  - `sales.items` is bounded to `1..200` items and validates element shape.

## 2. The "Dirty Dozen" Malicious Payloads

1. **Unauthenticated Product Read/Write**: Reading or overwriting `products` without `request.auth`.
2. **Unverified Email Write**: Writing to any collection when `request.auth.token.email_verified == false`.
3. **Self-Admin Privilege Escalation**: A standard employee writing `role: "admin"` to `/users/{ownUid}`.
4. **User PII List Scraping**: Running `list` on `/users` to harvest staff emails.
5. **Employee Product Price Tampering**: An employee updating `price` on `/products/{id}` instead of only `stock`/`status`.
6. **Employee Sale Deletion / Total Tampering**: An employee calling `delete` on `/sales/{id}` or modifying `total`/`items`.
7. **Employee Customer Modification**: An employee creating or deleting `/customers/{id}` records.
8. **Negative Product Price / Stock**: Writing `price: -100` or `stock: -5`.
9. **Oversized String Injection**: Injecting >200 chars into `name` or >1000 chars into `imageUrl`.
10. **Ghost / Shadow Field Injection**: Adding `isAdmin: true` or unknown fields to `users`, `products`, `sales`, or `customers`.
11. **Denial-of-Wallet Array Bomb**: Submitting a `sale` with >200 items in `items`.
12. **Malicious Path / ID Injection**: Writing documents whose ID does not match `^[a-zA-Z0-9_\\-]+$` or whose body `id` differs from the path ID.
