# Security Specification - Sumeth Rice Shop (สุเมธค้าข้าว)

This document outlines the security architecture, data invariants, and defensive validation rules for Sumeth Rice Shop's Firestore database.

## 1. Data Invariants

- **Authentication & Authorization**:
  - All read operations require a signed-in user.
  - All write operations require a signed-in user with a verified email (`request.auth.token.email_verified == true`).
- **Product Invariants**:
  - `price` and `stock` must be non-negative numbers.
  - All product string fields (such as `id`, `name`, `category`, and `status`) must adhere to strict size bounds to prevent resource exhaustion.
- **Sale Invariants**:
  - `total` and `discount` must be non-negative numbers.
  - `status` can only be `'สำเร็จ'` (Success) or `'ยกเลิก'` (Cancelled).
  - List of items must contain at most 100 entries.
- **Customer Invariants**:
  - `id` and `name` are required and must have safe string bounds.

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads represent malicious attempts to bypass validation, spoof identities, or inject garbage data, all of which are blocked by the security rules:

1. **Unverified Email Write**: Attempting to write a new product with an email that is not verified.
2. **Negative Product Price**: Adding a product with `price: -100`.
3. **Negative Stock Level**: Writing `stock: -5` to a product.
4. **Oversized String Injection**: Trying to inject a 10MB string into the product `name` or `imageUrl` field.
5. **Undefined Status Override**: Changing a sale's status to a random string like `"hack_status"`.
6. **Negative Sale Total**: Creating an invoice with a negative `total` price.
7. **Negative Discount**: Spoofing a sale with a negative discount.
8. **Malicious Path Traversal ID**: Creating a customer with a malicious document ID containing path traversal symbols.
9. **Missing Mandatory Fields**: Attempting to create a product without a `status` field.
10. **Extra Shadow Field (Privilege Escalation)**: Creating a customer with an unrequested field like `role: "admin"`.
11. **Malicious Long Array Injection**: Submitting a sale with more than 10,000 items in the array to cause Denial of Wallet.
12. **Null Type Value Poisoning**: Trying to write `total: null` or `total: "free"` on a Sale document.

## 3. Test Runner Definition (`firestore.rules.test.ts`)

A test suite verifying that all of the above payloads return `PERMISSION_DENIED` has been defined. The rules enforces the requirements globally, ensuring that no unverified or invalid writes can proceed to the database under any circumstances.
