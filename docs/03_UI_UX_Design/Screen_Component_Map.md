# Screen → Component → Service → API Map (Complete)

> Every UI surface in `frontend/src/app/components/**` and `frontend/src/pages/**`, the local Dexie tables it touches, the service it calls, and the `/api/v1` endpoints. Use this to trace any feature end-to-end.

## Marketing / Public (`components/marketing`, `pages/`)
| Screen | Component | API |
|---|---|---|
| Landing | `marketing/LandingPage` | — |
| About | `marketing/AboutPage`, `pages/about` | — |
| Pricing | `marketing/PricingPage`, `pages/pricing` | — |
| Contact | `marketing/ContactPage`, `pages/contact` | — |
| Privacy / Terms | `marketing/PrivacyPolicy`, `marketing/Terms` | — |
| Public navbar | `ui/PublicNavbar` | — |

## Auth & Onboarding (`components/auth`, `components/auth/onboarding`)
| Screen | Component | Service | API |
|---|---|---|---|
| Auth shell | `auth/AuthFlow`, `auth/AuthPage`, `auth/AuthCallback` | `services/permissionService`, `lib/auth-helpers` | `/auth/*` |
| Sign In / Sign Up | `auth/SignInForm`, `auth/SignUpForm` | `services/auth` | `/auth/check-email`, `/auth/login/challenge`, `/auth/login`, `/auth/register` |
| OTP | `auth/OTPVerification` | `services/pinService` | `/otp/send`, `/otp/verify` |
| PIN | `auth/PINSetup`, `auth/PINAuth` | `services/pinService` | `/pin/create`, `/pin/verify`, `/pin/reset` |
| Onboarding | `onboarding/AppFeatureSlides`, `NewUserOnboarding`, `UserOnboarding`, `OnboardingStep1-4`, `CountryLanguageStep`, `ProfileSetupStep`, `BankAccountStep`, `OnboardingCompleteStep` | — | `/settings/profile` |

## Core shell (`components/core`, `components/ui`, `components/shared`)
| Element | Component |
|---|---|
| App layout | `shared/AppLayout`, `shared/CenteredLayout` |
| Header / TopBar / Sidebar / BottomNav | `core/Header`, `ui/TopBar`, `core/Sidebar`, `core/BottomNav` |
| Quick action | `shared/QuickActionModal` |
| Command palette (Cmd+K) | `ui/TopBar` (search engine) |
| Offline / PWA / Limited | `shared/OfflineBanner`, `shared/PWAInstallPrompt`, `shared/PWAInstallPrompt`, `shared/LimitedModeBanner` |
| Sync status | `ui/SyncStatusBar` |
| Feature gating | `shared/FeatureGate`, `ui/FeatureGate`, `ui/FeatureVisibility` |
| Diagnostics | `shared/Diagnostics` |

## Accounts & Transactions
| Screen | Component | Dexie | Service | API |
|---|---|---|---|---|
| Dashboard | `core/Dashboard`, `shared/AIInsightsCard`, `ui/StatCard` | accounts, transactions | — | `/dashboard/summary`, `/dashboard/cashflow` |
| Accounts | `core/Accounts`, `core/AddAccount`, `core/EditAccount`, `ui/AccountLogos`, `ui/BankLogo` | accounts | `lib/backend-api` | `/accounts/*` |
| Transactions | `core/Transactions`, `transactions/AddTransaction`, `transactions/Transfer`, `transactions/TransferModal`, `transactions/AutoFillExpenseForm`, `transactions/PayEMI` | transactions, accounts | `services/transactionService`, `hooks/useTransactionCreation` | `/transactions`, `/transactions/bulk`, `/categorization` |
| Receipts | `transactions/ReceiptScanner`, `transactions/BillUpload`, `receipt-scanner/ReceiptScannerViews`, `features/ReceiptScannerPage`, `pages/receipt-scanner` | documents, expenseBills | `services/receiptScannerService`, `ocrService`, `tesseractOCRService`, `cloudReceiptScanService`, `hybridAIService`, `documentManagementService` | `/receipts/parse`, `/bills` |
| Import | `transactions/StatementImport`, `shared/ImportDataModal` | importHistories, smsTransactions | `services/statementImportService`, `bankStatementScannerService`, `smsTransactionDetectionService`, `smartExpenseImportService` | `/import/upload`, `/import/confirm`, `/import/:sessionId` |
| Category icons | `ui/CartoonCategoryIcons`, `ui/CategoryDropdown` | categories | `lib/smartCategorization`, `expenseCategories` | `/categorization` |

## Wealth
| Screen | Component | Dexie | Service | API |
|---|---|---|---|---|
| Goals | `goals/Goals`, `goals/AddGoal`, `goals/GoalDetail` | goals, goalContributions | `lib/goal-utils` | `/goals/*` |
| Loans | `loans/Loans`, `loans/AddLoan`, `loans/AddLoanModalWithFriends` | loans, loanPayments | — | `/loans/*`, `/loans/:id/payments` |
| Investments | `investments/Investments`, `AddInvestment`, `EditInvestment`, `CloseInvestmentModal`, `WealthVaultDashboard`, `LiveMarket`, `LiveMarketTicker` | investments | `lib/stockApi`, `investmentUtils`, `marketFlash` | `/investments/*`, `/stocks/*` |
| Gold | `investments/AddGold` | gold | `lib/metalPriceService` | `/gold/*` |
| Budgets | `features/BudgetAlertsPage` | budgets, budgetAlerts | `services/budgetCoachService` | `/budgets/*` |
| Recurring | `features/RecurringTransactions` | recurringTransactions | — | `/recurring/*` |
| Reports / Export | `features/Reports`, `features/ExportReports`, `features/Calendar` | — | `lib/statementReportPdf`, `importExport` | `/dashboard/*` |

## Social & Collaboration
| Screen | Component | Dexie | API |
|---|---|---|---|
| Friends | `groups/FriendsList`, `groups/AddFriends`, `groups/FriendProfile` | friends | `/friends/*` |
| Groups / Split | `groups/Groups`, `groups/AddGroup` | groups, groupExpenses | `/groups/*` |
| To-Do | `features/ToDoLists`, `features/ToDoListDetail`, `features/ToDoListShare` | toDoLists, toDoItems, toDoListShares | `/todos/*` |

## AI & Voice
| Screen | Component | Dexie | Service | API |
|---|---|---|---|---|
| Voice | `features/VoiceAICommandCenter`, `features/VoiceInput`, `features/VoiceReview`, `pages/VoiceAssistantPage`, `pages/voice-assistant` | voiceDrafts | `services/voiceAIProcessor`, `voiceCommandParser`, `voiceFinancialService`, `voiceRecognitionService`, `voiceTransactionService`, `voiceContextStore`, `lib/voiceExpenseParser` | `/voice/*` |
| AI insights | `features/AIInsightsPage`, `pages/ai-insights`, `shared/AIInsightsCard` | ai_* | `services/KANKUIntelligenceEngine`, `nlqService`, `merchantProfileService` | `/ai/*` |

## Advisory
| Screen | Component | Dexie | API |
|---|---|---|---|
| Book advisor (client) | `advisor/BookAdvisor` | bookingRequests | `/advisors`, `/bookings` |
| Advisor workspace | `advisor/AdvisorPanel`, `advisor/AdvisorWorkspace`, `profile/AdvisorRoleSection` | advisorSessions, availability | `/advisors/*`, `/sessions/*` |
| Client management | `features/ClientManagementPage` | advisorAssignments | `/advisors/*` |
| Manager verification | `manager/ManagerAdvisorVerification`, `admin/AdminAdvisorVerification` | — | `/advisors/admin/*` |

## Admin
| Screen | Component | API |
|---|---|---|
| Admin dashboard | `admin/AdminDashboard` | `/admin/stats`, `/admin/users*` |
| Feature panel | `admin/AdminFeaturePanel` | `/admin/features*` |
| AI dashboard | `admin/AdminAIDashboard`, `admin/AdminAIFeatureSection` | `/admin/ai/*`, `/admin/ai-features*` |
| Sync monitor | `admin/SyncMonitorDashboard` | `/sync/*` |

## Profile / Settings / Notifications
| Screen | Component | Dexie | Service | API |
|---|---|---|---|---|
| Profile | `profile/UserProfile` | profiles | `services/permissionService` | `/auth/profile`, `/avatars/me`, `/pin/change` |
| Settings | `profile/Settings` | settings, all | `lib/userPreferences`, `sessionManagement`, `device-manager` | `/settings/*`, `/sessions`, `/devices` |
| Notifications | `profile/Notifications`, `ui/NotificationPopup` | notifications | `lib/notifications`, `notificationSystem` | `/notifications/*` |

## Contexts & Hooks (cross-cutting)
- Contexts: `AuthContext`, `EnhancedAuthContext`, `AppContext`, `SecurityContext`, `lib/notification-context`.
- Hooks: `useApi`(api.ts), `useFeatureFlags`, `usePermissions`, `useRBAC`, `useSharedMenu`, `useReceiptScanner`, `useVoiceAssistant`, `useTransactionCreation`, `useDeviceRegistration`, `useDeviceSync`, `useResponsive`, `useToast`, `usePerformanceMonitor`, `useScrollToTop`.
- Sync libs: `sync-service`, `backend-sync-service`, `offline-sync-engine`, `enhanced-sync`, `syncSchemaGuard`, `socket-client`, `realTime`, `realtimeData`.

