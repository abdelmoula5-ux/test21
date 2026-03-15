const request = require('supertest');

// Mock DB connection so tests don't need Azure SQL
jest.mock('../src/models/db', () => ({
  connectDB: jest.fn().mockResolvedValue(true),
  getPool: jest.fn(),
  sql: {}
}));

const { app } = require('../server');

describe('Health check', () => {
  it('GET /health should return 200', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});
