# KANAKUIntelligence Systems Documentation

This document outlines the architecture, logic, and implementation details for KANAKU's core intelligence features: **OCR Bill Scanning**, **Bank Statement Analysis**, and **Voice Financial Assistance**.

---

## 1. OCR Intelligence Engine (Bill & Receipt Scanner)

### **Overview**
The OCR engine converts physical receipt images and digital PDFs into structured transaction data. It uses a **Hybrid Pipeline** to balance reliability and semantic accuracy.

### **Implementation Logic**
1.  **Stage 1: Raw Extraction (Tesseract.js)**:
    *   Powered by open-source **Tesseract.js**, lazy-loaded for performance.
    *   Extracts raw text strings from images with support for multiple languages.
2.  **Stage 2: Semantic Mapping (Gemini 1.5 Flash)**:
    *   The raw text is processed by **Gemini 1.5 Flash** to map unstructured strings into a strictly typed JSON schema.
    *   Gemini corrects OCR errors, identifies merchant names, and extracts itemized breakdowns.
3.  **Heuristic Fallback**:
    *   If Gemini is unreachable, a local **Heuristic Parser** takes over.
    *   **Signals**: Specialized regex for **Indian Taxes (CGST, SGST, IGST)**, **GSTIN** validation, and line-item table parsing.
4.  **Math Validation**:
    *   Every result is cross-checked: `(Subtotal - Discount + Taxes)  Grand Total`. Results with high variance are flagged for review.

---

## 2. Bank Statement & PDF Scanner

### **Overview**
Designed for structured documents (PDFs), this engine extracts entire transaction histories. For digital PDFs, it skips OCR and performs direct text stream analysis.

### **Implementation Logic**
1.  **Text Stream Extraction**:
    *   Uses `pdf-parse` to extract clean text layers from digital PDFs.
2.  **Semantic Structuring**:
    *   Passes extracted text to the Gemini structuring pipeline for professional-grade accuracy in identifying transaction dates, descriptions, and amounts.
3.  **Automatic Categorization**:
    *   Maps narration strings (NEFT, UPI, etc.) to KANAKUcategories using LLM insights and a local keyword dictionary.

---

## 3. Voice Financial Assistant (NLP)

### **Overview**
Allows hands-free logging using natural language. Supports complex, multi-action sentences.

### **Implementation Logic**
1.  **Segmentation**:
    *   Splits multi-part sentences (e.g., "Spent 500 on dinner and sent 200 to Rahul") into individual transactional segments.
2.  **Intent Classification**:
    *   Categorizes transcripts into intents: `expense`, `income`, `transfer`, `loan`, `goal`, and `investment`.
3.  **Gemini Enhancement**:
    *   For ambiguous segments (confidence < 0.7), the system uses Gemini to refine entities like Merchant, Category, and Person.
4.  **Currency & Goal Logic**:
    *   Robustly extracts Indian currency terms and goal-specific durations ("save 2 Lakhs in 1 year").

---

## 4. Integration & UI
*   **Shared Types**: All systems return standardized results compatible with the `Transaction` interface.
*   **Deduplication**: Every scanned transaction is hashed to prevent duplicate entries if the same bill or statement is scanned twice.
*   **Security**: All processing (OCR/Voice) happens **locally on the device** where possible to ensure financial privacy.

