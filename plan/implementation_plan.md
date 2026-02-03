# Implementation Plan: Inventory Automation System

## Goal Description
Build a professional, enterprise-level Inventory Automation System supported on **Android, Windows, and macOS**. The system will feature strict Role-Based Access Control (RBAC) and **Lot-Wise (Batch) Inventory Tracking** to manage stock more precisely.

## User Review Required
> [!IMPORTANT]
> **Lot-Wise Tracking Strategy**: I have updated the database schema to verify stock by **Lots/Batches**. This means every time Stock is added, a Batch Number (and optional Expiry Date) is assigned. When selling, the system will default to **FIFO (First-In-First-Out)** logic or allow manual lot selection.

## 1. Technology Architecture

### **1. Desktop Application (Phase 1 Focus)**
*   **Directory**: `/desktop`
*   **Framework**: Electron + React (Vite)
*   **Target**: Windows (.exe) and macOS (.dmg)
*   **Status**: In Progress

### **2. Mobile Application (Phase 2)**
*   **Directory**: `/mobile`
*   **Framework**: React Native (Expo)
*   **Target**: Android & iOS
*   **Status**: Planned (Shared logic with Desktop)

### **Backend & Database: Supabase**
*   **Database**: PostgreSQL.
*   **Authentication**: Email/Password with RBAC.
*   **Security**: Row Level Security (RLS).

---

## 2. Database Schema & Role Management

### **Roles**
1.  **Admin**: Full Create, Read, Update, Delete (CRUD) access.
2.  **Staff**: Limited access (Sales, Stock In, View).

### **Core Tables (Updated for Lots)**
*   **`profiles`**: `id`, `role` ('admin', 'staff'), `full_name`.
*   **`products`**: `id`, `name`, `sku`, `min_stock_alert`, `description`, `image_url`.
    *   *Note: Total stock is now calculated as the sum of active lots.*
*   **`product_lots`** (NEW): 
    *   `id`: UUID
    *   `product_id`: FK to products
    *   `lot_number`: String (Batch ID)
    *   `expiry_date`: Date (Optional)
    *   `quantity_remaining`: Integer
    *   `cost_price`: Decimal (Cost may vary per batch)
    *   `received_date`: Timestamp
*   **`transactions`**: 
    *   `id`
    *   `product_id`
    *   `lot_id`: FK to product_lots (Crucial to track which batch was sold)
    *   `type`: 'in', 'sale', 'adjustment'
    *   `quantity_changed`
    *   `performed_by`: user_id
*   **`invoices`**: `id`, `total_amount`, `customer_details`.

---

## 3. Module & Feature Breakdown

### **A. Authentication (Login)**
*   Single login screen.
*   Role detection routing.

### **B. Dashboard**
*   **Admin**: Total Valuation (Sum of Lots * Cost), Expiry Alerts (Lots nearing expiry), Sales Trends.
*   **Staff**: personal sales metrics.

### **C. Inventory Management (Lot-Aware)**
*   **Product View**: Shows total stock, but expanding a product reveals its **Lots Breakdown** (e.g., "Product A: 100 total. Lot X: 50, Lot Y: 50").
*   **Stock In**: 
    *   User selects Product.
    *   **Enters Lot Number** (or auto-generate).
    *   Enters Expiry Date (optional) & Quantity.
    *   Creates entry in `product_lots`.

### **D. Sales & Stock Out (Lot-Aware)**
*   **POS Interface**: 
    *   Add product to cart.
    *   **Lot Selection**: 
        1.  **Auto (Default)**: System picks oldest lot (FIFO).
        2.  **Manual**: Cashier selects specific lot if customer grabs a specific batch.
    *   Validation: Ensure distinct lot has enough quantity.

### **E. Expenses & Finance**
*   **Expenses**: Standard logging.
*   **Finance**: Accurate Profit/Loss calculation using specific Lot Cost Price vs Selling Price (Real margin calculation).

### **F. User Role Management**
*   Admin manages Staff accounts.

---

## 4. UI/UX Design Guidelines

*   **Multi-Platform Layout**:
    *   **Stock In Screen**: Needs fields for "Batch/Lot #" and "Expiry".
    *   **Inventory Tables**: Nested rows or expandable rows to show lots under products.
*   **Visuals**:
    *   Use color badges for Lot Status (Green = Fresh, Red = Near Expiry).

## 5. Implementation Phases

### **Phase 1: Foundation**
*   Flutter Project Setup.
*   Supabase Table creation (including `product_lots`).

### **Phase 2: Lot-Based Inventory**
*   Product creation.
*   **Stock In Flow**: Create lots.
*   **Inventory View**: Display hierarchical data (Product -> Lots).

### **Phase 3: Transactions**
*   **Stock Out Logic**: Implement FIFO algorithm to deduct from correct tables.
*   Sales UI.

### **Phase 4: Analytics**
*   Lot expiration reports.
*   Profit margins based on lot costs.

## Verification Plan

### Manual Verification
*   **Lot Flow Test**: 
    1.  Add Product "Milk" - Lot A (Exp: Jan 1), Lot B (Exp: Feb 1).
    2.  Sell "Milk".
    3.  Verify system deduced from Lot A (FIFO).
