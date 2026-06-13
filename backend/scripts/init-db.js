const { PrismaClient } = require('./generated/prisma');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log(' Initializing database...');
  
  try {
    // Create admin user
    const adminEmail = 'shaik.job.details@gmail.com';
    const adminPassword = '123456789';
    const adminPin = '123456';
    
    // Check if admin already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail }
    });
    
    if (existingAdmin) {
      console.log(' Admin user already exists:', existingAdmin.email);
    } else {
      // Create admin user
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      const hashedPin = await bcrypt.hash(adminPin, 10);
      
      const admin = await prisma.user.create({
        data: {
          email: adminEmail,
          name: 'Admin User',
          password: hashedPassword,
          role: 'admin',
          isApproved: true
        }
      });
      
      console.log(' Admin user created:', admin.email);
    }
    
    // Create some test data
    console.log(' Creating test data...');
    
    // Create test account
    const account = await prisma.account.create({
      data: {
        userId: existingAdmin ? existingAdmin.id : (await prisma.user.findUnique({ where: { email: adminEmail } })).id,
        name: 'Test Account',
        type: 'bank',
        balance: 1000.00,
        currency: 'USD'
      }
    });
    
    console.log(' Test account created:', account.name);
    
    // Create test transaction
    const transaction = await prisma.transaction.create({
      data: {
        userId: existingAdmin ? existingAdmin.id : (await prisma.user.findUnique({ where: { email: adminEmail } })).id,
        accountId: account.id,
        type: 'income',
        amount: 500.00,
        category: 'salary',
        description: 'Test salary income',
        date: new Date()
      }
    });
    
    console.log(' Test transaction created:', transaction.description);
    
    console.log(' Database initialization completed successfully!');
    
  } catch (error) {
    console.error(' Database initialization failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
