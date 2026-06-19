# Kanaku — Admin Terms & Conditions

**Role:** Platform Administrator
**Effective Date:** June 13, 2026
**Applies to:** Kanaku internal staff and authorized administrators only

> These terms apply in addition to the [Master Terms & Conditions](TERMS_MASTER.md). Admin access is granted only to authorized Kanaku employees and contractors. **Admin credentials must never be shared.**

---

## Who Is a Kanaku Admin?

A Kanaku Admin is a member of the Kanaku internal team (employee or authorized contractor) who has been granted elevated platform access to maintain operations, ensure safety, and manage the platform on behalf of the company.

Admin accounts are created **only** by other admins or by the platform owner. If you received Admin access, you are bound by these terms as a condition of your employment or contract.

---

## What Admins Can Do (Admin Features)

### User Management
- View all registered user accounts (End Users, Clients, Advisors)
- Search users by email, name, phone, or ID
- View user account details, registration date, and account status
- Suspend or terminate user accounts for terms violations
- Reset user passwords and force logout of all sessions
- Merge duplicate accounts (after verification)

### Advisor Management
- Review advisor applications (approve or reject with reasons)
- View advisor credentials and uploaded documents
- Suspend or ban advisors for misconduct
- View advisor performance metrics, ratings, and complaint history
- Override advisor availability (in emergency situations only)
- Process advisor appeals

### Content & Platform Safety
- Review reported content and user complaints
- Act on Trust & Safety reports within the defined SLA (5 business days)
- Remove illegal, harmful, or policy-violating content
- Issue warnings to users before suspension
- Flag accounts for further legal review

### Feature Flags & Configuration
- Enable or disable platform features (feature gates) globally or per-user
- Set feature rollout percentages (e.g., roll out a new feature to 10% of users first)
- Toggle AI features, advisor module, investment tracking, etc.
- Configure platform-wide settings and defaults

### Financial Oversight
- View platform-wide transaction volumes (anonymized aggregate data)
- Review payment disputes between clients and advisors
- Approve manual refunds outside the automated refund system
- Monitor payout queue and advisor earnings

### Diagnostics & Monitoring
- View system health dashboards (API uptime, error rates, response times)
- Access server and application logs (for debugging only)
- Run database diagnostics
- Trigger manual data sync operations

### Audit Logs
- View a complete audit log of all admin actions performed on any user account
- All admin actions are logged automatically with timestamp, admin ID, and action type
- Audit logs cannot be deleted or modified

---

## Your Responsibilities as an Admin (Dos)

| Do | Why |
|----|-----|
| Access only the minimum data required to complete a task | Principle of least privilege — required by our data protection policy |
| Log every manual intervention in the admin action notes field | Creates an auditable record for compliance |
| Verify user identity before making changes to their account | Prevents unauthorized account modifications |
| Escalate unusual patterns (mass sign-ups, payment anomalies) to the security team | Early detection of fraud or abuse |
| Keep your admin credentials strictly confidential | Admin credentials grant access to all user data |
| Use multi-factor authentication (MFA) on your admin account at all times | Required — MFA is enforced for all admin accounts |
| Follow the approval process for high-impact actions (e.g., mass suspensions) | Prevents accidental or unauthorized mass actions |
| Report data breaches within 1 hour of discovery | Required by data protection law |
| Treat all user data with strict confidentiality — no sharing, no screenshots | User data is not yours to share |
| Stay current on Kanaku's internal admin training and policy updates | Platform policies evolve; admins must be current |

---

## Things You Must Never Do as an Admin (Don'ts)

| Don't | Consequence |
|-------|-------------|
| Access user financial data out of personal curiosity | Immediate termination + potential legal action |
| Share admin credentials with anyone, including other Kanaku staff | Credential sharing is a serious security violation |
| Grant admin access to yourself for features you are not authorized to use | Privilege escalation violation |
| Delete audit logs or modify log records | Tampering with audit logs is a criminal offense |
| Approve advisor applications from friends or family (conflict of interest) | Recuse yourself and escalate to another admin |
| Make changes to a user's account without a legitimate support reason | Unauthorized account access |
| Use admin tools to gain personal financial advantage | Immediate termination + legal referral |
| Screenshot or copy user data for any purpose outside an authorized investigation | Data protection violation |
| Approve refunds or payments without proper authorization chain | Financial controls violation |
| Use admin access after your employment or contract ends | Unauthorized access — criminal violation |
| Share details of platform architecture, security measures, or user data externally | Confidentiality breach |

---

## Data Access Rules for Admins

### What Admins CAN access:
- Account metadata (email, name, registration date, account status)
- Anonymized platform analytics
- User-submitted support tickets
- Advisor application documents
- Flagged content in the Trust & Safety queue
- System and error logs (for debugging — not user financial content)
- Payment dispute records

### What Admins should NOT access without documented cause:
- Individual user transaction details (only with a support ticket reference)
- Client-advisor session chat history (only with a formal complaint investigation)
- User receipt images (only if investigating a specific fraud report)
- User's linked bank account details

### Absolute prohibitions:
- User passwords (these are hashed and inaccessible by design)
- User PINs (hashed — inaccessible)
- User biometric data (not stored)
- OTP codes (single-use, expire in 5 minutes)

---

## Admin Action Approval Levels

Not all admin actions can be taken by any admin. The following require approval:

| Action | Approval Required From |
|--------|----------------------|
| Terminate an advisor account | Senior Admin or Platform Owner |
| Bulk suspend more than 10 users | Senior Admin |
| Issue refund > ₹10,000 | Finance team + Senior Admin |
| Disable a platform-wide feature flag | Engineering lead + Senior Admin |
| Access session chat logs for investigation | Senior Admin sign-off + documentation |
| Export user data for legal/law enforcement | Legal team sign-off + documentation |

---

## Confidentiality & Non-Disclosure

By holding an Admin account, you are bound by strict confidentiality obligations:

- All user data is confidential. Do not discuss it outside secured, authorized communication channels.
- Platform security architecture, vulnerability reports, and internal system details are confidential.
- Any data accessed during your role must not be retained beyond the need of the task.
- These obligations survive the end of your employment or contract.

---

## Admin Account Security Requirements

Admins must maintain the following at all times:

- **Multi-Factor Authentication (MFA):** Mandatory — account will be locked without it
- **Password strength:** Minimum 16 characters, alphanumeric + symbols
- **Session timeout:** Admin sessions expire after 30 minutes of inactivity
- **Device restriction:** Admin login is restricted to approved, company-managed devices (or VPN)
- **Credential rotation:** Admin passwords must be changed every 90 days

Failure to maintain these standards may result in access revocation.

---

## Disciplinary Actions

Admin violations are treated with the highest severity:

1. **Warning** — for minor procedural issues (first offense, low-impact)
2. **Access restriction** — role downgraded pending investigation
3. **Termination** — for serious violations (data misuse, unauthorized access)
4. **Legal referral** — for criminal violations (data theft, fraud, unauthorized system access)

All admin disciplinary actions are logged and reviewed by the platform owner.

---

## Offboarding

When an Admin leaves Kanaku (by resignation, termination, or end of contract):
- Admin credentials are revoked immediately upon notice
- All company devices must be returned within 24 hours
- Any admin-generated reports or data downloads must be deleted and confirmed
- A security review is conducted on all admin actions taken in the 30 days before departure
- Confidentiality obligations remain in effect for 5 years after departure

---

## Reporting Concerns

If you become aware of a security issue, data breach, or policy violation by another admin:
- **Internal escalation:** Report to the Platform Owner immediately
- **Security incidents:** Use the internal security incident channel
- **External legal concern:** Contact legal@Kanaku.app with documentation

Whistleblower protections apply to good-faith reports made in accordance with this policy.

---

## Questions?

Contact the Platform Owner directly or email: **admin-support@Kanaku.app** (internal only)
