# Test Cases: User & Advisor Role Scenario-Level Testing

This document contains 10 detailed test scenarios for the **User (Client)** role and 10 detailed test scenarios for the **Advisor** role, each prepared with step-by-step instructions, expected results, and multiple test data sets.

---

## Part 1: User (Client) Role Test Cases

### US-01: New User Registration & Validation
* **Objective**: Ensure that a user can register via the UI and that negative/boundary validation logic works correctly.
* **Test Cases & Data sets**:
  * **Case 1.1 (Positive)**: Create a new account with a valid, unique email, dial code, phone number, and strong password.
  * **Case 1.2 (Negative - Weak Password)**: Attempt to register with a password containing only lowercase letters.
  * **Case 1.3 (Negative - Missed Confirmation)**: Attempt to register where confirm password does not match password.
* **Steps**:
  1. Navigate to Sign Up form.
  2. Fill in first name, last name, email, dial code, mobile number, password, and confirm password.
  3. Accept terms and submit.
* **Expected Result**:
  - Positive case: User registration succeeds and shifts to onboarding/PIN setup.
  - Negative cases: Proper validation errors are rendered on screen (e.g., password criteria not met).
* **Test Data**:
  ```json
  [
    {
      "id": "valid_user_A",
      "firstName": "Arjun",
      "lastName": "Sharma",
      "email": "arjun.qa.test@kanaku.test",
      "mobile": "9876543210",
      "password": "StrongPassword@2026",
      "confirmPassword": "StrongPassword@2026",
      "isValid": true
    },
    {
      "id": "weak_password_user",
      "firstName": "Bad",
      "lastName": "Pass",
      "email": "badpass.qa.test@kanaku.test",
      "mobile": "9876543211",
      "password": "weak",
      "confirmPassword": "weak",
      "isValid": false
    },
    {
      "id": "mismatched_password_user",
      "firstName": "Mismatch",
      "lastName": "Pass",
      "email": "mismatch.qa.test@kanaku.test",
      "mobile": "9876543212",
      "password": "StrongPassword@2026",
      "confirmPassword": "DifferentPassword@2026",
      "isValid": false
    }
  ]
  ```

### US-02: Login Challenge-Response Flow
* **Objective**: Ensure that a user can sign in using SHA-256 password challenge exchange or fallback.
* **Steps**:
  1. Navigate to Sign In form.
  2. Input registered email and password.
  3. Click sign in.
* **Expected Result**: Challenge is fetched from API, hashed locally, verified by API, and session tokens are set.
* **Test Data**:
  ```json
  [
    { "email": "arjun.qa.test@kanaku.test", "password": "StrongPassword@2026", "shouldSucceed": true },
    { "email": "arjun.qa.test@kanaku.test", "password": "WrongPassword123", "shouldSucceed": false }
  ]
  ```

### US-03: Account Creation & Balance Ingestion
* **Objective**: Verify that a user can add accounts of different types and institutions, rejecting empty inputs.
* **Steps**:
  1. Navigate to Accounts.
  2. Click Add Account.
  3. Fill in name, type, institution, balance, color.
  4. Submit.
* **Expected Result**: Account is added to list and correctly updates totals. Empty names or letters in balance are blocked.
* **Test Data**:
  ```json
  [
    { "name": "HDFC Premium Savings", "type": "bank", "balance": "100000", "isValid": true },
    { "name": "Pocket Cash", "type": "cash", "balance": "2500", "isValid": true },
    { "name": "", "type": "bank", "balance": "5000", "isValid": false }
  ]
  ```

### US-04: Income & Expense Logging
* **Objective**: Check transaction recording for different categories and flow validation.
* **Steps**:
  1. Navigate to Transactions.
  2. Click Add Transaction.
  3. Choose type (Income/Expense), category, account, amount, and date.
  4. Save.
* **Expected Result**: Transactions appear in the list; account balance adjusts correctly.
* **Test Data**:
  ```json
  [
    { "type": "income", "category": "Salary", "amount": "75000", "account": "HDFC Premium Savings" },
    { "type": "expense", "category": "Food", "amount": "1200", "account": "Pocket Cash" }
  ]
  ```

### US-05: Inter-Account Transfers
* **Objective**: Verify that transferring money between accounts updates both balances correctly.
* **Steps**:
  1. Add Transfer transaction.
  2. Select Source Account and Destination Account.
  3. Input amount and click Transfer.
* **Expected Result**: Source balance decreases, and destination balance increases by the transfer amount.
* **Test Data**:
  ```json
  [
    { "fromAccount": "HDFC Premium Savings", "toAccount": "Pocket Cash", "amount": "5000" }
  ]
  ```

### US-06: Goal Setting & Contributions
* **Objective**: Check target goals setup, progress calculation, and completion logic.
* **Steps**:
  1. Navigate to Goals page.
  2. Create a new Goal (target, date, name).
  3. Log a contribution.
* **Expected Result**: Progress bar displays correct percentages; completion state triggers when target is met.
* **Test Data**:
  ```json
  [
    { "name": "Emergency Fund", "target": "50000", "contribution": "25000", "expectedProgress": "50%" },
    { "name": "New Laptop", "target": "10000", "contribution": "10000", "expectedProgress": "100%" }
  ]
  ```

### US-07: Debt & EMI Tracking
* **Objective**: Set up loans and verify due calculation and EMI payment logging.
* **Steps**:
  1. Add a Loan (type: Lend/Borrow, lender, total amount, interest rate).
  2. Record a payment towards the loan.
* **Expected Result**: Remaining balance decreases; payment history updates.
* **Test Data**:
  ```json
  [
    { "lender": "SBI Car Loan", "amount": "500000", "interestRate": "8.5", "payment": "12000" }
  ]
  ```

### US-08: To-Do Checklist Management
* **Objective**: Test checklist creation, task checking/unchecking, and sharing.
* **Steps**:
  1. Go to To-Dos.
  2. Create a checklist.
  3. Add items, check off one item.
* **Expected Result**: Task status reflects completed state; count updates (e.g. 1/3 tasks done).
* **Test Data**:
  ```json
  [
    { "listName": "Monthly Audit Checklist", "items": ["Verify credit cards", "Log cash transactions", "Save salary deposit"] }
  ]
  ```

### US-09: Advisor Directory Browsing
* **Objective**: Test searching and filtering approved advisors in the system.
* **Steps**:
  1. Open "Find an Advisor" directory.
  2. Input keyword in search box or filter by specialization/ratings.
* **Expected Result**: Advisor list filters dynamically based on match.
* **Test Data**:
  ```json
  [
    { "search": "Tax", "expectedMatch": "Arjun Financial Services" },
    { "search": "Wealth", "expectedMatch": "Wealth Growth Expert" }
  ]
  ```

### US-10: Consultation Booking
* **Objective**: Test booking an advisor session for a selected date and time.
* **Steps**:
  1. Select an advisor.
  2. Pick preferred date, time, consultation type (video/chat), topic, and message.
  3. Send request.
* **Expected Result**: Toast shows "Booking request sent!", booking appears in "My Bookings" as pending.
* **Test Data**:
  ```json
  [
    { "advisorName": "Arjun Financial Services", "topic": "Income Tax Audit", "date": "2026-07-05", "time": "14:00", "type": "video" }
  ]
  ```

---

## Part 2: Advisor Role Test Cases

### AD-01: Advisor Application Submission
* **Objective**: Check that a user can submit an application with documents and transition status to pending.
* **Steps**:
  1. Sign in. Navigate to "Book Advisor" -> Click "Become an Advisor".
  2. Fill in experience, expertise, bio, and upload PAN/Aadhaar documents.
  3. Submit.
* **Expected Result**: Application enters manager verification queue.
* **Test Data**:
  ```json
  [
    { "fullName": "Advisor Rahul", "phone": "+91 9998887776", "expertise": "Mutual Funds", "experience": "5", "bio": "Registered financial expert.", "panDoc": "pan.pdf", "aadhaarDoc": "aadhaar.pdf" }
  ]
  ```

### AD-02: Application Rejection Lifecycle
* **Objective**: Ensure that the system handles rejections correctly and allows the user to re-apply/correct documents.
* **Steps**:
  1. Under Admin role, view Rahul's application.
  2. Reject application with reason "Aadhaar document blurred".
  3. Log back in as Rahul, verify rejected state and re-submission availability.
* **Expected Result**: Status updates to rejected; user is notified and can correct profile.
* **Test Data**:
  ```json
  [
    { "advisorId": "Rahul", "rejectReason": "Aadhaar document blurred" }
  ]
  ```

### AD-03: Compliance Review & Status Activation
* **Objective**: Manager/Admin verification activates the advisor.
* **Steps**:
  1. Sign in as Admin.
  2. Go to advisor verification screen.
  3. Select application, review, and Approve.
* **Expected Result**: Advisor role updates to ACTIVE. Profile is searchable.
* **Test Data**:
  ```json
  [
    { "advisorName": "Advisor Rahul", "action": "approve" }
  ]
  ```

### AD-04: Slot & Calendar Availability Setup
* **Objective**: Active advisor configures working days, hours, and timezone.
* **Steps**:
  1. Log in as Advisor.
  2. Set availability slots (e.g. Mondays 10:00 - 18:00).
* **Expected Result**: Slot settings persist in database and show up for client booking.
* **Test Data**:
  ```json
  [
    { "dayOfWeek": 1, "startTime": "10:00", "endTime": "18:00", "timezone": "Asia/Kolkata" }
  ]
  ```

### AD-05: Session Bookings Overview
* **Objective**: Advisor reads and accepts/reschedules incoming client bookings.
* **Steps**:
  1. Log in as Advisor. Go to Bookings screen.
  2. Accept a pending booking request.
* **Expected Result**: Status updates to "accepted/confirmed" on both advisor and user interfaces.
* **Test Data**:
  ```json
  [
    { "bookingId": "booking-001", "action": "accept" }
  ]
  ```

### AD-06: Session Notes Logging
* **Objective**: Advisor creates session summary notes, action items, and next dates.
* **Steps**:
  1. Select a booking.
  2. Add notes, check "make private" or leave public, add action items.
* **Expected Result**: Notes save successfully; visibility policies are honored.
* **Test Data**:
  ```json
  [
    { "notes": "Client needs to split funds between debt and equity.", "actionItems": ["Create low-risk mutual fund basket", "Set up SIP"], "isPrivate": true }
  ]
  ```

### AD-07: Fee Transaction Records
* **Objective**: Record and verify advisor transaction fees and statuses.
* **Steps**:
  1. Record fee transaction.
  2. Verify amount, currency, status, reference.
* **Expected Result**: Records persist and match totals.
* **Test Data**:
  ```json
  [
    { "amount": 1500, "currency": "INR", "status": "paid", "reference": "TXN_REF_QA001" }
  ]
  ```

### AD-08: Payout Request Handling
* **Objective**: Advisor requests earnings withdrawal, tracking processed states.
* **Steps**:
  1. Navigate to Payouts.
  2. Enter amount and bank account details. Submit.
* **Expected Result**: Payout request displays in pending state. Admin can mark as completed.
* **Test Data**:
  ```json
  [
    { "amount": "4500", "bankLast4": "4321", "notes": "Advisory session payout" }
  ]
  ```

### AD-09: Profile Update & Customizations
* **Objective**: Advisor updates fee per session, bio, or specializations.
* **Steps**:
  1. Go to Advisor Profile.
  2. Modify bio, fee per session, or certifications. Save.
* **Expected Result**: New attributes are reflected immediately in the search directory.
* **Test Data**:
  ```json
  [
    { "fee": "2500", "specializations": ["Retirement planning", "Tax planning"], "experienceYears": 6 }
  ]
  ```

### AD-10: Data Isolation & Security Restrictions
* **Objective**: Security validation preventing cross-advisor/user data access.
* **Steps**:
  1. Log in as Advisor A. Attempt to view sessions or update notes for Advisor B.
  2. Log in as User. Attempt to access advisor-only availability APIs.
* **Expected Result**: Backend returns 403 Forbidden / 401 Unauthorized; data is protected.
* **Test Data**:
  ```json
  [
    { "role": "user", "endpoint": "/advisors/me/sessions", "expectedStatus": 403 },
    { "role": "advisor", "bookingId": "another-advisor-booking", "endpoint": "/bookings/another-advisor-booking/cancel", "expectedStatus": 403 }
  ]
  ```
