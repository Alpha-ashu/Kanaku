# Finora — Sprint 1: User-Level Test Scenarios
**Sprint:** 1 (Current)
**Period:** June 13 – June 20, 2026
**Goal:** Validate every core feature with real-world data across 7 user personas
**Environment:** Production (or staging mirror)

---

## Overview

Each test user represents a real-life financial persona. The purpose is to exercise every major feature with realistic data — not synthetic or trivial data — so that bugs, UX gaps, and integration failures surface before the next feature sprint.

**Cross-user verification:** Users U1, U2, U5, U6 are connected as friends so that cross-user notifications, group expenses, and shared To-Dos can be verified together.

---

## Test User Accounts

| ID | Name | Email | Role | Persona |
|----|------|-------|------|---------|
| U1 | Arjun Sharma | arjun.test@finora.app | End User | Debt / Loan Manager |
| U2 | Priya Mehta | priya.test@finora.app | End User | Group Expense Splitter |
| U3 | Rohan Verma | rohan.test@finora.app | End User | Investor |
| U4 | Sneha Kapoor | sneha.test@finora.app | End User | Goal Setter |
| U5 | Dev Nair | dev.test@finora.app | Client | Portfolio Builder |
| U6 | Isha Patel | isha.test@finora.app | End User | Collaborative Planner |
| U7 | Admin Tester | admin.test@finora.app | End User | Power User (all features) |

> **Password for all test users:** `TestFinora@2026`
> **PIN for all test users:** `1234`

---

## PRE-TEST SETUP

Before running any scenario, complete these setup steps:

1. Create all 7 accounts via the registration flow (do not use seed scripts — test the actual registration UX)
2. U1, U2, U5, U6 add each other as friends (test friend request + cross-user notifications)
3. Verify that when U1 adds U2, U2 receives a notification in-app and via email
4. U2 creates a group and adds U1, U5, U6 as members

---

## SCENARIO U1 — Debt / Loan Manager (Arjun Sharma)

**Objective:** Validate the complete loan lifecycle — creation, EMI logging, multiple loan types, repayment tracking.

### Setup Data
- Primary account: SBI Savings Account — ₹45,000 opening balance

### Test Steps

**Step 1 — Home Loan**
- Add loan: "Home Loan – HDFC"
  - Principal: ₹35,00,000
  - Interest rate: 8.5% per annum
  - Tenure: 20 years
  - EMI: ₹30,415/month (auto-calculated or manually entered)
  - Start date: January 2024
- Log 6 months of EMI payments (January–June 2024)
- Verify outstanding balance recalculates after each payment

**Step 2 — Personal Loan**
- Add loan: "Personal Loan – ICICI"
  - Principal: ₹2,50,000
  - Interest rate: 14% per annum
  - Tenure: 2 years
  - EMI: ₹12,003/month
  - Start date: March 2026
- Log 3 months of payments
- Verify total debt summary on dashboard

**Step 3 — Friend Debt (Informal)**
- Add loan: "Borrowed from Priya for trip"
  - Type: Personal / Borrowed
  - Amount: ₹8,500
  - No interest
  - Due date: August 1, 2026
- Log one partial repayment: ₹3,000 paid on June 5
- Verify outstanding: ₹5,500

**Step 4 — Lent to someone**
- Add loan: "Lent to colleague Raj"
  - Type: Lent / Given
  - Amount: ₹15,000
  - Expected return: July 31, 2026

**Verification Checklist:**
- [ ] All 4 loans appear in the loans list
- [ ] Dashboard total debt figure is correct (sum of borrowed amounts)
- [ ] EMI payments correctly reduce outstanding balance
- [ ] Partial repayment reflects correctly
- [ ] Due date reminders configured (check notification settings)
- [ ] Export loans list as CSV and verify data accuracy

---

## SCENARIO U2 — Group Expense Splitter (Priya Mehta)

**Objective:** Validate friend management, group creation, expense splitting, and settlement flows with cross-user notifications.

### Setup Data
- Primary account: Axis Savings — ₹28,000 opening balance

### Test Steps

**Step 1 — Friend Network Setup**
- Priya adds Arjun (U1), Dev (U5), and Isha (U6) as friends
- Verify:
  - U1, U5, U6 each receive a "Friend Request" notification in-app
  - Email notification reaches their inbox
  - When any of them add Priya back → both users get "Friend Connected" notification
  - Socket.IO real-time notification fires (check browser console for socket event)

**Step 2 — Create Group: "Goa Trip 2026"**
- Members: Priya, Arjun, Dev, Isha (4 members)
- Currency: INR

**Step 3 — Add Group Expenses**
Add these expenses (Priya paid for all, split equally):
| Expense | Amount | Paid By | Split |
|---------|--------|---------|-------|
| Hotel – 3 nights | ₹18,000 | Priya | Equal (4) |
| Flight tickets | ₹24,400 | Priya | Equal (4) |
| Goa dinner cruise | ₹6,800 | Priya | Equal (4) |
| Water sports | ₹5,200 | Priya | Equal (4) |
| Return cab | ₹2,400 | Arjun | Equal (4) |

**Step 4 — Verify Split Calculations**
- Hotel: ₹4,500 per person
- Flights: ₹6,100 per person
- Total each person owes Priya: ₹13,600
- Arjun: paid ₹600 cab (₹2,400 / 4) for others → his net debt to Priya = ₹13,600 − ₹1,800 = ₹11,800
- Verify all balances match these calculations in the app

**Step 5 — Settlement**
- Dev settles his share: mark ₹13,600 as paid
- Verify group balance updates and Dev shows ₹0 owed

**Step 6 — Personal Split (outside group)**
- Add a direct split with Isha: "Lunch at Bandra" ₹1,200 split 50/50
- Verify: Isha owes ₹600 (or Priya owes ₹600 depending on who paid)

**Verification Checklist:**
- [ ] All group members appear correctly
- [ ] Each expense shows correct per-person split amount
- [ ] Net balances (who owes whom, how much) are accurate
- [ ] Settlement reduces the correct person's balance to zero
- [ ] Notification fires to group members when a new expense is added
- [ ] Group expense shows in Priya's transaction history (as expense)
- [ ] Export group expense report as PDF

---

## SCENARIO U3 — Investor (Rohan Verma)

**Objective:** Validate all investment types — stocks, mutual funds, gold, and fixed deposits.

### Setup Data
- Primary account: Zerodha Linked — ₹1,20,000 opening balance

### Test Steps

**Step 1 — Stock Portfolio**
Add these stock holdings:
| Stock | Qty | Buy Price | Buy Date |
|-------|-----|-----------|----------|
| Reliance Industries | 15 | ₹2,840 | Jan 15, 2026 |
| TCS | 8 | ₹3,920 | Feb 3, 2026 |
| HDFC Bank | 25 | ₹1,640 | Feb 20, 2026 |
| Infosys | 20 | ₹1,580 | Mar 10, 2026 |
| SBI | 50 | ₹780 | Apr 5, 2026 |

- Verify portfolio value calculates total invested = ₹2,22,100
- Check if current market price updates (live or manual)
- Add a sell transaction: Sold 5 Reliance at ₹2,950 (profit: ₹550)

**Step 2 — Mutual Funds**
Add these SIP investments:
| Fund | Monthly SIP | Start Date | Units |
|------|-------------|------------|-------|
| HDFC Midcap Opportunities | ₹5,000 | Jan 2026 | 142.3 |
| Mirae Asset Large Cap | ₹3,000 | Feb 2026 | 76.8 |
| Axis Small Cap | ₹2,000 | Mar 2026 | 58.2 |

- Log 5 months of SIP for each fund
- Verify total SIP invested amount per fund

**Step 3 — Gold**
- Add: Digital Gold via Zerodha Mint
  - Grams: 25g purchased at ₹6,400/g = ₹1,60,000
  - Purchase date: December 2025
- Add: SGB (Sovereign Gold Bond)
  - Units: 10 bonds at ₹6,230/unit = ₹62,300
  - Maturity: 2033

**Step 4 — Fixed Deposits**
| FD | Bank | Amount | Rate | Tenure | Start |
|----|------|--------|------|--------|-------|
| FD-1 | SBI | ₹1,00,000 | 7.1% | 1 year | Jan 2026 |
| FD-2 | HDFC | ₹50,000 | 7.3% | 2 years | March 2026 |

- Verify maturity date and expected interest calculated correctly

**Verification Checklist:**
- [ ] All 4 investment types appear in portfolio
- [ ] Total portfolio value aggregates all types correctly
- [ ] Sell transaction reduces stock qty correctly
- [ ] SIP monthly entries accumulate over time
- [ ] Gold gram value and bond value shown separately
- [ ] FD maturity interest calculated (simple or compound)
- [ ] Investment report exportable as PDF

---

## SCENARIO U4 — Goal Setter (Sneha Kapoor)

**Objective:** Validate multiple savings goals with contributions, milestone tracking, and goal completion.

### Setup Data
- Primary account: Kotak Savings — ₹65,000 opening balance

### Test Steps

**Step 1 — Create 5 Goals**
| Goal | Target | Deadline | Monthly Save |
|------|--------|----------|-------------|
| Emergency Fund | ₹3,00,000 | Dec 2026 | ₹25,000 |
| Europe Vacation 2027 | ₹2,50,000 | March 2027 | ₹18,000 |
| New Laptop | ₹1,20,000 | September 2026 | ₹15,000 |
| Down Payment – Flat | ₹10,00,000 | December 2028 | ₹30,000 |
| Wedding Fund | ₹5,00,000 | June 2027 | ₹40,000 |

**Step 2 — Add Contributions**
For each goal, add 4–6 contributions (varying amounts, over the past months):

Emergency Fund:
- Jan: ₹25,000 | Feb: ₹25,000 | Mar: ₹30,000 | Apr: ₹20,000 | May: ₹25,000
- Total so far: ₹1,25,000 (41.7% of goal)

Europe Vacation:
- Feb: ₹18,000 | Mar: ₹18,000 | Apr: ₹15,000 | May: ₹18,000
- Total: ₹69,000 (27.6%)

New Laptop:
- Mar: ₹15,000 | Apr: ₹20,000 | May: ₹15,000 | June: ₹15,000
- Total: ₹65,000 (54.2%)

Down Payment:
- Jan: ₹30,000 | Feb: ₹30,000 | Mar: ₹30,000 | Apr: ₹30,000 | May: ₹30,000 | June: ₹30,000
- Total: ₹1,80,000 (18%)

Wedding Fund:
- Apr: ₹40,000 | May: ₹40,000 | June: ₹35,000
- Total: ₹1,15,000 (23%)

**Step 3 — Goal Completion Test**
- Simulate completing the Laptop goal: add ₹55,000 final contribution
- Verify goal shows as "Achieved" or 100% complete
- Check if a completion notification fires

**Step 4 — Goal Progress Verification**
- View all goals on the goals dashboard
- Verify each goal shows: % complete, amount saved, amount remaining, months left
- Check that "on track" vs "behind" status is calculated correctly based on deadline

**Verification Checklist:**
- [ ] All 5 goals created with correct targets and deadlines
- [ ] Contribution amounts accumulate correctly per goal
- [ ] Progress percentage and remaining amount calculated correctly
- [ ] "On track" / "behind" status is accurate given the deadline
- [ ] Goal marked complete when 100% reached
- [ ] Completion notification fires
- [ ] Goals visible in dashboard summary

---

## SCENARIO U5 — Portfolio Builder (Dev Nair) — Client Role

**Objective:** Validate multi-account management, diverse transaction categories, transfers between accounts, and the Client role (advisor access).

### Setup Data
- This user is a **Client** (role: client) — can access advisor features

### Step 1 — Create Multiple Accounts
| Account | Type | Opening Balance |
|---------|------|----------------|
| ICICI Savings | Bank Savings | ₹85,000 |
| HDFC Salary Account | Bank Savings | ₹1,20,000 |
| Paytm Wallet | Digital Wallet | ₹4,500 |
| Credit Card – AMEX | Credit Card | -₹32,000 (outstanding) |
| Cash in Hand | Cash | ₹8,000 |

### Step 2 — Add Diverse Transactions (30+ entries across all categories)
Add at least 3 transactions per category:

**Food & Dining:**
- Swiggy order — ₹485 (June 10)
- Team lunch at Trattoria — ₹1,200 (June 8)
- Grocery – DMart — ₹3,400 (June 6)
- Coffee – Starbucks — ₹380 (June 5)

**Transportation:**
- Petrol – HP Pump — ₹2,500 (June 9)
- Ola cab — ₹340 (June 7)
- Metro recharge — ₹500 (June 3)

**Shopping:**
- Amazon – Keyboard — ₹2,799 (June 8)
- Myntra – Shirt — ₹1,499 (June 4)
- Pet food – Drools — ₹1,200 (June 2)

**Services & Utilities:**
- Electricity bill — ₹1,840 (June 1)
- Netflix subscription — ₹649/month (recurring)
- Jio prepaid — ₹299 (June 1)
- Water bill — ₹420 (June 1)

**Healthcare:**
- Pharmacy – Apollo — ₹680 (June 5)
- Doctor consultation — ₹500 (June 3)

**Income:**
- Salary credit — ₹1,10,000 (June 1)
- Freelance payment — ₹25,000 (June 7)

**Transfer:**
- ICICI → HDFC: ₹20,000 (June 8) — verify both accounts update correctly
- HDFC → Paytm: ₹2,000 (June 5)

**Credit Card:**
- Credit card payment (AMEX) — ₹15,000 (June 10) — reduces outstanding
- New charge — Dinner ₹2,800 (June 9)

### Step 3 — Advisor Booking (Client Role)
- Browse available advisors
- Book a session with a verified advisor
- Verify booking confirmation notification
- Share dashboard data with advisor (select: transactions + goals)
- Verify advisor can see the shared data

### Step 4 — Budget Setup
- Create budget for current month:
  - Food: ₹8,000
  - Transport: ₹4,000
  - Shopping: ₹6,000
  - Services: ₹4,000
- Verify budget vs. actual shows current spend from transactions
- Check if "near limit" alert fires when approaching budget

**Verification Checklist:**
- [ ] All 5 accounts created with correct opening balances
- [ ] Transfer between accounts updates both account balances correctly
- [ ] Credit card outstanding decreases when payment is made
- [ ] 30+ transactions across 8+ categories all saved correctly
- [ ] Category breakdown visible in dashboard
- [ ] Budget alerts fire when spending approaches limit
- [ ] Advisor booking flow completes successfully
- [ ] Advisor can see the data shares Dev authorized
- [ ] Expense report exported as PDF shows all transactions

---

## SCENARIO U6 — Collaborative Planner (Isha Patel)

**Objective:** Validate personal To-Do lists, shared To-Do lists with friends, group task management, and real-time sync across users.

### Setup Data
- Primary account: Yes Bank — ₹22,000 opening balance

### Test Steps

**Step 1 — Personal To-Do Lists**
Create 2 personal lists:

*List: "Daily Finance Tasks"*
- [ ] Check bank balance every morning
- [ ] Log all expenses by 9 PM
- [ ] Review budget at week end
- [ ] Pay electricity bill (due June 15)
- [ ] Renew car insurance (due July 1)

*List: "Investment Research"*
- [ ] Research Nifty 50 index fund options
- [ ] Compare SIP returns across 3 AMCs
- [ ] Read SEBI circular on mutual fund taxation
- [ ] Open Zerodha account

**Step 2 — Mark Tasks Complete**
- Mark "Check bank balance every morning" as done
- Mark "Pay electricity bill" as done (after adding the bill payment as a transaction)
- Verify completion timestamps recorded

**Step 3 — Shared To-Do List with Friends**
Create shared list: "Goa Trip Planning" — shared with U1 (Arjun), U2 (Priya)
- [ ] Book return train tickets (Assign to: Arjun)
- [ ] Research hotels in South Goa (Assign to: Priya)
- [ ] Create shared expense group (Done)
- [ ] Pack list (Assign to: Isha — self)
- [ ] Buy travel insurance (Assign to: Isha)

- Verify: Arjun and Priya receive a notification that they were added to the shared list
- Log in as Arjun (U1) and mark "Book return train tickets" as complete
- Log back in as Isha — verify the task shows as completed in real-time

**Step 4 — Group Task Management**
Inside the "Goa Trip 2026" expense group (created by U2):
- Verify the to-do list is accessible from the group context (if feature is linked)
- Add group-level reminder: "Settle expenses by July 1, 2026"

**Step 5 — Individual Finance To-Dos**
Add recurring reminder tasks:
- Monthly: "Review investment portfolio" — recurs every 1st of month
- Weekly: "Log weekly expenses" — recurs every Sunday
- Verify recurring tasks appear in the upcoming section

**Verification Checklist:**
- [ ] Personal lists created with all tasks
- [ ] Task completion marks correctly with timestamp
- [ ] Shared list shows for all invited friends
- [ ] Invited friends receive notifications
- [ ] Real-time sync: task completed by U1 shows as done for U6 within seconds
- [ ] Task assignment to specific users works
- [ ] Recurring tasks reappear after each cycle

---

## SCENARIO U7 — Power User / Full Activity Monitor (Admin Tester)

**Objective:** Test every feature category in a single account — the most comprehensive regression test.

### Setup Data
- Primary account: Multiple (4 accounts)
- All features enabled (verify feature gates are ON)

### Account Setup
| Account | Type | Balance |
|---------|------|---------|
| State Bank Savings | Bank | ₹55,000 |
| HDFC Credit Card | Credit | -₹18,000 |
| Groww Wallet | Digital Wallet | ₹6,000 |
| Cash | Cash | ₹3,200 |

### Full Activity Sequence (run in order)

1. **Add account** (SBI) → verify balance reflects
2. **Add income transaction** (Salary ₹90,000) → verify account balance increases
3. **Add expense transaction** (Food ₹450) → verify balance decreases
4. **Add transfer** (SBI → Groww ₹5,000) → verify both accounts update
5. **Scan a receipt** (use any sample receipt) → verify AI extracts data → confirm as transaction
6. **Use voice logging** → say "Spent 250 rupees on petrol" → verify transaction created
7. **Add a budget** (Food ₹5,000/month) → verify current spend reflected
8. **Add a goal** (Emergency Fund ₹1,00,000) → add a contribution
9. **Add an investment** (HDFC Mutual Fund SIP ₹2,000) → log 3 months
10. **Add a loan** (Personal loan ₹50,000 borrowed) → log one EMI
11. **Add a bill** (Electricity ₹1,200 due June 15) → verify reminder
12. **Add a tax entry** (TDS deducted ₹4,500) → verify tax dashboard
13. **Add a recurring transaction** (Netflix ₹649/month) → verify it appears in recurring list
14. **Add a friend** (add U2 - Priya) → verify notification fires on both sides
15. **Create a group** ("Team Lunch Group") with U2 → add expense → split
16. **Create a To-Do list** ("This Week") → add 3 tasks → mark 1 complete
17. **Book an advisor session** (switch to Client role first) → complete booking flow
18. **Import a bank statement** (use `samples/imports/` test file) → verify transactions appear
19. **Export all transactions** as CSV → open file, verify data integrity
20. **View notification center** → verify all events from steps 1–19 generated appropriate notifications
21. **View dashboard** → verify all summary figures match actual data entered
22. **Check sync** → go offline → add a transaction → go online → verify sync fires

**Verification Checklist:**
- [ ] All 22 steps complete without a blocking error
- [ ] Dashboard summary is accurate after all data entry
- [ ] Notifications generated for: friend request, group expense, goal milestone (if reached)
- [ ] Receipt OCR extracted data correctly
- [ ] Voice command created transaction correctly
- [ ] Bank statement import successfully parsed all transactions
- [ ] CSV export contains all transaction records
- [ ] Offline → online sync works correctly
- [ ] No console errors in browser DevTools during the full flow
- [ ] All API calls return 2xx (check Network tab)

---

## BUG REPORTING PROCESS

For each scenario, if a bug is found:

1. Note: User | Step | Expected behavior | Actual behavior
2. Record: Browser console errors (if any)
3. Record: Network request that failed (URL + status code)
4. File in: `docs/reports/` as `BUG_SPRINT1_U<number>_<date>.md`

### Bug Severity Levels
| Level | Definition | Action |
|-------|-----------|--------|
| P0 — Critical | Data loss, login failure, payment error | Fix before Sprint 2 starts |
| P1 — High | Feature completely broken | Fix in Sprint 2, Day 1 |
| P2 — Medium | Feature partially broken / wrong calculation | Fix in Sprint 2 |
| P3 — Low | UI misalignment, minor wording | Add to backlog |

---

## CROSS-USER NOTIFICATION TEST MATRIX

This is the most important integration test. Run after all users are set up.

| Action | Performed By | Notified Users | Channel |
|--------|-------------|----------------|---------|
| U1 adds U2 as friend | U1 (Arjun) | U2 (Priya) | In-app + Email |
| U2 adds U1 back (mutual) | U2 (Priya) | U1 (Arjun) — "Friend Connected" | In-app + Email |
| U2 creates group, adds U1, U5, U6 | U2 (Priya) | U1, U5, U6 | In-app |
| U2 adds group expense | U2 (Priya) | U1, U5, U6 | In-app |
| U6 creates shared To-Do, adds U1, U2 | U6 (Isha) | U1, U2 | In-app + Email |
| U1 completes a shared task | U1 (Arjun) | U6, U2 | In-app (real-time) |
| U5 books an advisor session | U5 (Dev) | Advisor account | In-app + Email |
| Goal 100% reached (U4) | System trigger | U4 (Sneha) | In-app |

**Pass criteria:** Every notification row above fires within 5 seconds of the action.

---

## Sprint 1 Sign-Off Criteria

Sprint 1 is complete when:
- [ ] All 7 user scenarios have been executed
- [ ] Zero P0 bugs remain open
- [ ] Cross-user notification matrix is 100% green
- [ ] All verification checklists are checked
- [ ] Bug report filed for all P1–P3 issues found
- [ ] Sprint 2 planning doc updated with any new findings

---

*Document owner: Platform Owner / QA Lead*
*Next: [SPRINT_PLAN.md](../reports/SPRINT_PLAN.md)*
