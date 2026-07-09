const { PrismaClient } = require('./generated/prisma');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
const pin = process.env.SEED_ADMIN_PIN;

if (!email || !password || !pin) {
    console.error('Error: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, and SEED_ADMIN_PIN must be set in env');
    process.exit(1);
}

const prisma = new PrismaClient();

async function createAdminUser() {
    try {
        // Check if admin user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
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
            const hashedPassword = await bcrypt.hash(password, 10);
            const adminUser = await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    name: 'Admin User',
                    role: 'admin',
                    isEmailVerified: true,
                    pin
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
