const { PrismaClient } = require('./generated/prisma');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createAdminUser() {
    try {
        // Check if admin user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: 'shaik.job.details@gmail.com' }
        });

        if (existingUser) {
            console.log('Admin user already exists:', {
                id: existingUser.id,
                email: existingUser.email,
                name: existingUser.name,
                role: existingUser.role
            });
        } else {
            // Create admin user
            const hashedPassword = await bcrypt.hash('123456789', 10);
            const adminUser = await prisma.user.create({
                data: {
                    email: 'shaik.job.details@gmail.com',
                    password: hashedPassword,
                    name: 'Admin User',
                    role: 'admin',
                    isEmailVerified: true,
                    pin: '123456'
                }
            });
            console.log('Admin user created successfully:', {
                id: adminUser.id,
                email: adminUser.email,
                name: adminUser.name,
                role: adminUser.role
            });
        }
    } catch (error) {
        console.error('Error creating admin user:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createAdminUser();
