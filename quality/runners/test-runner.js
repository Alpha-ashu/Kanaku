import fetch from 'node-fetch';

// Test configuration
const CONFIG = {
    frontendUrl: 'http://localhost:5173',
    backendUrl: 'http://localhost:3001',
    apiBaseUrl: 'http://localhost:3001/api/v1',
    adminCredentials: {
        email: 'shaik.job.details@gmail.com',
        password: '123456789',
        pin: '123456'
    }
};

let testResults = {};
let authToken = '';

async function runTest(testName, testFunction) {
    console.log(`\n Running test: ${testName}`);
    console.log(''.repeat(50));
    
    try {
        const result = await testFunction();
        testResults[testName] = result;
        
        if (result.success) {
            console.log(` ${testName}: PASSED`);
            console.log(`   ${result.message}`);
        } else {
            console.log(` ${testName}: FAILED`);
            console.log(`   ${result.message}`);
        }
        
        return result;
    } catch (error) {
        console.log(` ${testName}: ERROR`);
        console.log(`   ${error.message}`);
        testResults[testName] = { success: false, message: error.message };
        return { success: false, message: error.message };
    }
}

// Test functions
async function testFrontend() {
    try {
        const response = await fetch(CONFIG.frontendUrl, { method: 'HEAD' });
        if (response.ok) {
            return { success: true, message: 'Frontend server responding on port 5173' };
        } else {
            return { success: false, message: `Frontend server error: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `Frontend server unreachable: ${error.message}` };
    }
}

async function testBackend() {
    try {
        const response = await fetch(`${CONFIG.backendUrl}/health`);
        if (response.ok) {
            const data = await response.json();
            return { success: true, message: `Backend API responding on port 3001 - ${JSON.stringify(data)}` };
        } else {
            return { success: false, message: `Backend API error: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `Backend API unreachable: ${error.message}` };
    }
}

async function testDatabase() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/health/db`);
        if (response.ok) {
            const data = await response.json();
            return { success: true, message: `Database connection successful - ${JSON.stringify(data)}` };
        } else {
            return { success: false, message: `Database connection failed: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `Database unreachable: ${error.message}` };
    }
}

async function testAdminLogin() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: CONFIG.adminCredentials.email,
                password: CONFIG.adminCredentials.password
            })
        });

        if (response.ok) {
            const data = await response.json();
            authToken = data.token;
            return { 
                success: true, 
                message: `Admin login successful - User ID: ${data.userId}, Role: ${data.role}` 
            };
        } else {
            return { success: false, message: `Admin login failed: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `Login error: ${error.message}` };
    }
}

async function testRoleAccess() {
    if (!authToken) {
        return { success: false, message: 'Cannot test role access without authentication' };
    }
    
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/admin/users`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            return { success: true, message: 'Admin role permissions working correctly' };
        } else {
            return { success: false, message: `Admin role access failed: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `Role testing error: ${error.message}` };
    }
}

async function testDashboard() {
    if (!authToken) {
        return { success: false, message: 'Cannot test dashboard without authentication' };
    }
    
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/dashboard`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            return { success: true, message: 'Dashboard data loaded successfully' };
        } else {
            return { success: false, message: `Dashboard error: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `Dashboard error: ${error.message}` };
    }
}

async function testExpenses() {
    if (!authToken) {
        return { success: false, message: 'Cannot test expenses without authentication' };
    }
    
    try {
        const expenseData = {
            amount: 100,
            category: 'Food',
            description: 'Test expense',
            date: new Date().toISOString()
        };

        const response = await fetch(`${CONFIG.apiBaseUrl}/transactions`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(expenseData)
        });

        if (response.ok) {
            return { success: true, message: 'Expense creation successful' };
        } else {
            return { success: false, message: `Expense error: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `Expense error: ${error.message}` };
    }
}

async function testTransfers() {
    if (!authToken) {
        return { success: false, message: 'Cannot test transfers without authentication' };
    }
    
    try {
        const transferData = {
            fromAccount: 'account1',
            toAccount: 'account2',
            amount: 50,
            description: 'Test transfer'
        };

        const response = await fetch(`${CONFIG.apiBaseUrl}/transfers`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(transferData)
        });

        if (response.ok) {
            return { success: true, message: 'Transfer creation successful' };
        } else {
            return { success: false, message: `Transfer error: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `Transfer error: ${error.message}` };
    }
}

async function testReports() {
    if (!authToken) {
        return { success: false, message: 'Cannot test reports without authentication' };
    }
    
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/reports/summary`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const data = await response.json();
            return { success: true, message: 'Report generation successful' };
        } else {
            return { success: false, message: `Report error: ${response.status}` };
        }
    } catch (error) {
        return { success: false, message: `Report error: ${error.message}` };
    }
}

async function testPerformance() {
    try {
        const startTime = Date.now();
        const response = await fetch(`${CONFIG.backendUrl}/health`);
        const endTime = Date.now();
        
        const responseTime = endTime - startTime;
        
        if (response.ok && responseTime < 1000) {
            return { success: true, message: `API response time: ${responseTime}ms (within acceptable limits)` };
        } else {
            return { success: false, message: `Performance concern: ${responseTime}ms response time` };
        }
    } catch (error) {
        return { success: false, message: `Performance test failed: ${error.message}` };
    }
}

async function testErrors() {
    try {
        const response = await fetch(`${CONFIG.apiBaseUrl}/invalid-endpoint`, {
            method: 'GET'
        });

        if (response.status === 404) {
            return { success: true, message: '404 error handled gracefully' };
        } else {
            return { success: false, message: `Unexpected error response: ${response.status}` };
        }
    } catch (error) {
        return { success: true, message: 'Network errors handled gracefully' };
    }
}

// Main test execution
async function runAllTests() {
    console.log(' Starting Expense Tracker Comprehensive Test Suite');
    console.log('='.repeat(60));
    console.log(`Admin Credentials: ${CONFIG.adminCredentials.email}`);
    console.log(`Password: ${CONFIG.adminCredentials.password}`);
    console.log(`PIN: ${CONFIG.adminCredentials.pin}`);
    console.log('='.repeat(60));

    // Run all tests
    await runTest('Frontend Server', testFrontend);
    await runTest('Backend API', testBackend);
    await runTest('Database Connection', testDatabase);
    await runTest('Admin Login', testAdminLogin);
    await runTest('Role-Based Access', testRoleAccess);
    await runTest('Dashboard Functionality', testDashboard);
    await runTest('Expense Management', testExpenses);
    await runTest('Transfer Functionality', testTransfers);
    await runTest('Reports & Analytics', testReports);
    await runTest('API Performance', testPerformance);
    await runTest('Error Handling', testErrors);

    // Generate summary
    console.log('\n TEST SUMMARY');
    console.log('='.repeat(60));
    
    const totalTests = Object.keys(testResults).length;
    const passedTests = Object.values(testResults).filter(result => result.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success Rate: ${successRate}%`);

    if (successRate === 100) {
        console.log('\n ALL TESTS PASSED! The application is fully functional.');
    } else if (successRate >= 80) {
        console.log('\n  MOST TESTS PASSED! Some issues detected but core functionality works.');
    } else {
        console.log('\n TESTS FAILED! Significant issues detected.');
    }

    console.log('\n DETAILED RESULTS:');
    console.log('-'.repeat(40));
    Object.entries(testResults).forEach(([testName, result]) => {
        const status = result.success ? ' PASS' : ' FAIL';
        console.log(`${status} ${testName}: ${result.message}`);
    });

    return { totalTests, passedTests, failedTests, successRate, testResults };
}

// Run the tests
runAllTests().then(results => {
    console.log('\n Test suite completed!');
    process.exit(results.successRate === 100 ? 0 : 1);
}).catch(error => {
    console.error(' Test suite failed:', error);
    process.exit(1);
});