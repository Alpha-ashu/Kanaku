const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../generated/prisma');

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  console.error('[prisma-helper] DATABASE_URL is not set in backend/.env');
}

const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

module.exports = { prisma, PrismaClient, adapter };
