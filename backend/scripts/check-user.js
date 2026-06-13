const { PrismaClient } = require('./generated/prisma');

// Override DATABASE_URL with correct credentials from docker-compose
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:postgres@localhost:5432/expense_tracker'
    }
  }
});

async function checkAndUpdateUser() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'Shaik.job.details@gmail.com' }
    });
    
    if (!user) {
      console.log(' User not found in database');
      console.log('\nAvailable users:');
      const allUsers = await prisma.user.findMany({
        select: { email: true, role: true, isApproved: true }
      });
      if (allUsers.length > 0) {
        allUsers.forEach(u => {
          console.log(`  - ${u.email} (role: ${u.role}, approved: ${u.isApproved})`);
        });
      } else {
        console.log('  No users in database');
      }
    } else {
      console.log(' User found:');
      console.log('  Email:', user.email);
      console.log('  Name:', user.name);
      console.log('  Role:', user.role);
      console.log('  Approved:', user.isApproved);
      
      if (user.role !== 'admin' || !user.isApproved) {
        console.log('\n  Updating role to admin and approving...');
        const updated = await prisma.user.update({
          where: { email: 'Shaik.job.details@gmail.com' },
          data: { 
            role: 'admin',
            isApproved: true
          }
        });
        console.log(' User updated successfully!');
        console.log('  New role:', updated.role);
        console.log('  New approved status:', updated.isApproved);
      } else {
        console.log('\n User already has admin role and is approved!');
      }
    }
  } catch (error) {
    console.error(' Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndUpdateUser();
