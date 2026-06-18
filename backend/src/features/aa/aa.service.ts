import { randomUUID } from 'crypto';
import { logger } from '../../config/logger';
import { prisma } from '../../db/prisma';
import type {
  CreateConsentRequest,
  ConsentResponse,
  ConsentStatusResponse,
  ConsentArtifact,
  DataSessionRequest,
  DataSessionResponse,
  FetchDataResponse,
  FIData,
  AANotificationPayload,
} from './aa.types';

/**
 * Account Aggregator Service — Setu AA Integration
 *
 * RBI-Compliant consent-driven financial data sharing.
 * Implements the full AA lifecycle:
 *   1. Consent Creation
 *   2. User Redirect + Approval
 *   3. Consent Status Verification
 *   4. Data Session Creation
 *   5. Financial Data Fetch
 *
 * Configuration via environment variables:
 *   - AA_BASE_URL: Setu AA API base URL
 *   - AA_CLIENT_ID: FIU client identifier
 *   - AA_CLIENT_SECRET: FIU client secret
 *   - AA_REDIRECT_URL: Consent approval redirect URL
 *   - AA_NOTIFICATION_URL: Webhook URL for AA notifications
 */

const AA_BASE_URL = process.env.AA_BASE_URL || 'https://aa-sandbox.setu.co';
const AA_CLIENT_ID = process.env.AA_CLIENT_ID || '';
const AA_CLIENT_SECRET = process.env.AA_CLIENT_SECRET || '';
const AA_REDIRECT_URL = process.env.AA_REDIRECT_URL || '';
const AA_FIU_ID = process.env.AA_FIU_ID || '';

class AAService {
  /**
   * Get authorization headers for Setu AA API calls
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-client-id': AA_CLIENT_ID,
      'x-client-secret': AA_CLIENT_SECRET,
      'x-product-instance-id': AA_FIU_ID,
    };
  }

  /**
   * Make authenticated API call to Setu AA
   */
  private async aaRequest(method: string, path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = `${AA_BASE_URL}${path}`;
    const options: RequestInit = {
      method,
      headers: this.getHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
    };

    try {
      const response = await fetch(url, options);
      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        logger.error(`[AA] API error: ${method} ${path}`, { status: response.status, data });
        throw new Error(`AA API error: ${response.status} - ${JSON.stringify(data)}`);
      }

      return data;
    } catch (error) {
      logger.error(`[AA] Request failed: ${method} ${path}`, error);
      throw error;
    }
  }

  /**
   * Step 1: Create Consent Request
   */
  async createConsent(request: CreateConsentRequest): Promise<ConsentResponse> {
    try {
      const txnId = randomUUID();
      const consentStart = new Date().toISOString();
      const consentExpiry = request.consentExpiry || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

      const consentPayload = {
        ver: '1.0',
        txnid: txnId,
        ConsentDetail: {
          consentStart,
          consentExpiry,
          consentMode: request.consentMode || 'VIEW',
          consentTypes: request.consentTypes,
          fetchType: request.fetchType || 'ONETIME',
          fiTypes: request.fiTypes,
          Purpose: request.purpose,
          FIDataRange: {
            from: `${request.dataRange.from}T00:00:00Z`,
            to: `${request.dataRange.to}T23:59:59Z`,
          },
          DataConsumer: { id: AA_FIU_ID },
          Customer: { id: request.vua },
        },
        redirectUrl: AA_REDIRECT_URL,
      };

      const response = await this.aaRequest('POST', '/Consent', consentPayload);
      const consentHandle = response.consentHandle as string || response.ConsentHandle as string;

      if (!consentHandle) {
        return { success: false, message: 'Failed to create consent — no handle received.' };
      }

      // Store consent in database
      await prisma.aaConsent.create({
        data: {
          id: randomUUID(),
          userId: request.userId,
          consentHandle,
          consentId: null,
          status: 'CREATED',
          purpose: JSON.stringify(request.purpose),
          fiTypes: JSON.stringify(request.fiTypes),
          consentTypes: JSON.stringify(request.consentTypes),
          dataFrom: new Date(request.dataRange.from),
          dataTo: new Date(request.dataRange.to),
          vua: request.vua,
        },
      });

      // Build redirect URL for user consent approval
      const redirectUrl = `https://anumati.setu.co/${consentHandle}`;

      logger.info(`[AA] Consent created: ${consentHandle} for user ${request.userId}`);

      return {
        success: true,
        consentHandle,
        status: 'CREATED',
        redirectUrl,
        message: 'Consent created. Redirect user to approve.',
      };
    } catch (error) {
      logger.error('[AA] Create consent error:', error);
      return { success: false, message: 'Failed to create consent request.' };
    }
  }

  /**
   * Step 2: Check Consent Status
   */
  async getConsentStatus(consentHandle: string, userId: string): Promise<ConsentStatusResponse> {
    try {
      // Verify ownership
      const consent = await prisma.aaConsent.findFirst({
        where: { consentHandle, userId },
      });

      if (!consent) {
        return { success: false, message: 'Consent not found.' };
      }

      const response = await this.aaRequest('GET', `/Consent/handle/${consentHandle}`);
      const status = (response.status || response.Status) as string;
      const consentId = (response.consentId || response.ConsentId) as string;

      // Update local record
      await prisma.aaConsent.updateMany({
        where: { consentHandle, userId },
        data: {
          status: status || consent.status,
          consentId: consentId || consent.consentId,
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        consentId: consentId || undefined,
        status: status as any,
        message: `Consent status: ${status}`,
      };
    } catch (error) {
      logger.error('[AA] Get consent status error:', error);
      return { success: false, message: 'Failed to check consent status.' };
    }
  }

  /**
   * Step 3: Fetch Consent Artifact (after ACTIVE)
   */
  async getConsentArtifact(consentId: string, userId: string): Promise<ConsentArtifact | null> {
    try {
      // Verify ownership
      const consent = await prisma.aaConsent.findFirst({
        where: { consentId, userId },
      });

      if (!consent) {
        return null;
      }

      const response = await this.aaRequest('GET', `/Consent/${consentId}`);
      const status = (response.status || response.Status) as string;
      const signedConsent = (response.signedConsent || response.SignedConsent) as string;

      // Store artifact
      await prisma.aaConsentArtifact.upsert({
        where: { consentId },
        update: {
          artifactJson: JSON.stringify(response),
          signature: signedConsent || null,
          status,
        },
        create: {
          id: randomUUID(),
          consentId,
          artifactJson: JSON.stringify(response),
          signature: signedConsent || null,
          status,
        },
      });

      // Update consent status
      await prisma.aaConsent.updateMany({
        where: { consentId, userId },
        data: { status, updatedAt: new Date() },
      });

      return {
        consentId,
        status: status as any,
        signedConsent,
        consentDetail: response as Record<string, unknown>,
      };
    } catch (error) {
      logger.error('[AA] Get consent artifact error:', error);
      return null;
    }
  }

  /**
   * Step 4: Create Data Session
   */
  async createDataSession(request: DataSessionRequest): Promise<DataSessionResponse> {
    try {
      // Verify consent is ACTIVE
      const consent = await prisma.aaConsent.findFirst({
        where: { consentId: request.consentId, userId: request.userId, status: 'ACTIVE' },
      });

      if (!consent) {
        return { success: false, message: 'No active consent found. User must approve consent first.' };
      }

      const txnId = randomUUID();
      const sessionPayload = {
        ver: '1.0',
        txnid: txnId,
        Consent: { id: request.consentId },
      };

      const response = await this.aaRequest('POST', '/FI/request', sessionPayload);
      const sessionId = (response.sessionId || response.SessionId) as string;
      const status = (response.status || response.Status || 'ACTIVE') as string;

      if (!sessionId) {
        return { success: false, message: 'Failed to create data session.' };
      }

      // Store session record
      await prisma.aaDataSession.create({
        data: {
          id: randomUUID(),
          consentId: request.consentId,
          sessionId,
          sessionStatus: status,
          userId: request.userId,
        },
      });

      logger.info(`[AA] Data session created: ${sessionId} for consent ${request.consentId}`);

      return {
        success: true,
        sessionId,
        status: status as any,
        message: 'Data session created. You can now fetch financial data.',
      };
    } catch (error) {
      logger.error('[AA] Create data session error:', error);
      return { success: false, message: 'Failed to create data session.' };
    }
  }

  /**
   * Step 5: Fetch Financial Data
   */
  async fetchFinancialData(sessionId: string, userId: string): Promise<FetchDataResponse> {
    try {
      // Verify session ownership
      const session = await prisma.aaDataSession.findFirst({
        where: { sessionId, userId },
      });

      if (!session) {
        return { success: false, message: 'Data session not found.' };
      }

      const response = await this.aaRequest('GET', `/FI/fetch/${sessionId}`);
      const fiData = (response.FI || response.fi || []) as Array<Record<string, unknown>>;

      // Process and store financial data
      const processedData: FIData[] = [];

      for (const fi of fiData) {
        const account = fi.account as Record<string, unknown> || {};
        const transactions = (fi.transactions || fi.Transactions || []) as Array<Record<string, unknown>>;
        const summary = fi.summary as Record<string, unknown> || {};

        const fiRecord: FIData = {
          account: {
            type: (account.type || account.Type || 'DEPOSIT') as string,
            maskedAccNumber: (account.maskedAccNumber || account.maskedAccountNumber || 'XXXX0000') as string,
          },
          transactions: transactions.map((txn: Record<string, unknown>) => ({
            amount: Number(txn.amount || txn.Amount || 0),
            type: ((txn.type || txn.Type || 'DEBIT') as string).toUpperCase() as 'DEBIT' | 'CREDIT',
            date: (txn.date || txn.Date || txn.transactionDate || '') as string,
            narration: (txn.narration || txn.Narration || txn.description || '') as string,
            reference: (txn.reference || txn.Reference || '') as string,
            balance: txn.balance ? Number(txn.balance) : undefined,
          })),
          summary: summary ? {
            currentBalance: summary.currentBalance ? Number(summary.currentBalance) : undefined,
            currency: (summary.currency || 'INR') as string,
            branch: summary.branch as string | undefined,
            ifscCode: summary.ifscCode as string | undefined,
          } : undefined,
        };

        processedData.push(fiRecord);

        // Store raw data (RBI-compliant: only store what consent allows)
        await prisma.aaFinancialData.create({
          data: {
            id: randomUUID(),
            userId,
            consentId: session.consentId,
            sessionId,
            accountType: fiRecord.account.type,
            maskedAccountNumber: fiRecord.account.maskedAccNumber,
            dataJson: JSON.stringify(fi),
          },
        });

        // Process individual transactions into queryable table
        for (const txn of fiRecord.transactions) {
          if (txn.date && txn.amount) {
            await prisma.aaTransaction.create({
              data: {
                id: randomUUID(),
                userId,
                consentId: session.consentId,
                transactionDate: new Date(txn.date),
                amount: txn.amount,
                type: txn.type.toLowerCase(),
                description: txn.narration,
                maskedAccountNumber: fiRecord.account.maskedAccNumber,
              },
            });
          }
        }
      }

      // Update session status
      await prisma.aaDataSession.updateMany({
        where: { sessionId },
        data: { sessionStatus: 'COMPLETED', updatedAt: new Date() },
      });

      logger.info(`[AA] Financial data fetched: ${processedData.length} accounts for session ${sessionId}`);

      return {
        success: true,
        data: processedData,
        message: `Successfully fetched data for ${processedData.length} account(s).`,
      };
    } catch (error) {
      logger.error('[AA] Fetch financial data error:', error);
      return { success: false, message: 'Failed to fetch financial data.' };
    }
  }

  /**
   * Handle AA notification webhook (consent status updates)
   */
  async handleNotification(payload: AANotificationPayload): Promise<void> {
    logger.info(`[AA] Notification received: ${payload.type}`, payload);

    switch (payload.type) {
      case 'CONSENT_STATUS_UPDATE':
        if (payload.consentHandle && payload.status) {
          await prisma.aaConsent.updateMany({
            where: { consentHandle: payload.consentHandle },
            data: { status: payload.status, updatedAt: new Date() },
          });
        }
        if (payload.consentId && payload.status) {
          await prisma.aaConsent.updateMany({
            where: { consentId: payload.consentId },
            data: { status: payload.status, updatedAt: new Date() },
          });
        }
        break;

      case 'SESSION_STATUS_UPDATE':
        if (payload.sessionId && payload.status) {
          await prisma.aaDataSession.updateMany({
            where: { sessionId: payload.sessionId },
            data: { sessionStatus: payload.status, updatedAt: new Date() },
          });
        }
        break;

      case 'FI_DATA_READY':
        logger.info(`[AA] FI data ready for session: ${payload.sessionId}`);
        break;
    }
  }

  /**
   * Get user's consent history
   */
  async getUserConsents(userId: string) {
    return prisma.aaConsent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revoke an active consent
   */
  async revokeConsent(consentId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const consent = await prisma.aaConsent.findFirst({
        where: { consentId, userId, status: 'ACTIVE' },
      });

      if (!consent) {
        return { success: false, message: 'Active consent not found.' };
      }

      // Revoke via AA API
      await this.aaRequest('POST', `/Consent/revoke/${consentId}`, {});

      await prisma.aaConsent.updateMany({
        where: { consentId, userId },
        data: { status: 'REVOKED', updatedAt: new Date() },
      });

      logger.info(`[AA] Consent revoked: ${consentId} by user ${userId}`);

      return { success: true, message: 'Consent revoked successfully.' };
    } catch (error) {
      logger.error('[AA] Revoke consent error:', error);
      return { success: false, message: 'Failed to revoke consent.' };
    }
  }

  /**
   * Get user's fetched financial data summary
   */
  async getUserFinancialSummary(userId: string) {
    const accounts = await prisma.aaFinancialData.findMany({
      where: { userId },
      select: {
        id: true,
        accountType: true,
        maskedAccountNumber: true,
        consentId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const transactions = await prisma.aaTransaction.findMany({
      where: { userId },
      orderBy: { transactionDate: 'desc' },
      take: 50,
    });

    return { accounts, transactions };
  }
}

export const aaService = new AAService();

