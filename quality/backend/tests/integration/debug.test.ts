import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../../../backend/src/app';

const API = '/api/v1';
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-at-least-32-characters-long-for-testing';

// Generate a valid mock user and JWT
const userId = 'd89b14f8-1111-4444-8888-999999999999';
const validToken = jwt.sign(
  {
    userId: userId,
    email: 'testuser@example.com',
    role: 'user',
    isApproved: true,
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const getAuthHeaders = () => ({
  Authorization: `Bearer ${validToken}`,
});

describe('DEBUG TRANSACTION POST', () => {
  it('should post transaction and print error if 400', async () => {
    // 1. Create a live active account first
    const accountRes = await request(app)
      .post(`${API}/accounts`)
      .set(getAuthHeaders())
      .send({
        name: `Bank of Baroda - ${Math.random()}`,
        type: 'savings',
        balance: 10000,
        currency: 'INR',
      });
    
    console.log('Account response:', accountRes.status, accountRes.body);
    const accountId = accountRes.body.id || accountRes.body.data?.id;

    if (!accountId) {
      throw new Error('Failed to create account in test');
    }

    // 2. Send transaction with exact same payload structure as frontend
    const res = await request(app)
      .post(`${API}/transactions`)
      .set(getAuthHeaders())
      .send({
        accountId: accountId,
        type: 'expense',
        amount: 1300,
        category: 'Food & Dining',
        subcategory: '',
        description: 'Burger',
        merchant: '',
        date: new Date().toISOString(),
        tags: [],
      });

    console.log('Transaction response status:', res.status);
    console.log('Transaction response body:', JSON.stringify(res.body, null, 2));
  });
});
