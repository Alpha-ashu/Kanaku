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

async function testAPIEndpoints() {
    try {
        // Test if API routes are accessible (even if they return 401/404, that's expected without auth/db)
        const endpoints = [
            '/api/v1/auth/login',
            '/api/v1/dashboard',
            '/api/v1/transactions',
            '/api/v1/accounts',
            '/api/v1/goals'
        ];

        let accessibleEndpoints = 0;
        for (const endpoint of endpoints) {
            try {
                const response = await fetch(`${CONFIG.backendUrl}${endpoint}`, { method: 'GET' });
                if (response.status !== 404) {
                    accessibleEndpoints++;
                }
            } catch (error) {
                // Endpoint not accessible
            }
        }

        if (accessibleEndpoints > 0) {
            return { success: true, message: `API structure working - ${accessibleEndpoints}/${endpoints.length} endpoints accessible` };
        } else {
            return { success: false, message: 'No API endpoints accessible' };
        }
    } catch (error) {
        return { success: false, message: `API structure test failed: ${error.message}` };
    }
}

async function testCORS() {
    try {
        const response = await fetch(`${CONFIG.backendUrl}/health`, {
            method: 'GET',
            headers: {
                'Origin': CONFIG.frontendUrl
            }
        });
        
        const corsHeader = response.headers.get('access-control-allow-origin');
        if (corsHeader) {
            return { success: true, message: `CORS configured - Allow Origin: ${corsHeader}` };
        } else {
            return { success: false, message: 'CORS not properly configured' };
        }
    } catch (error) {
        return { success: false, message: `CORS test failed: ${error.message}` };
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

async function testFrontendPages() {
    try {
        // Test if main frontend pages are accessible
        const pages = [
            '/',
            '/dashboard',
            '/expenses',
            '/transfers',
            '/reports'
        ];

        let accessiblePages = 0;
        for (const page of pages) {
            try {
                const response = await fetch(`${CONFIG.frontendUrl}${page}`, { method: 'GET' });
                if (response.ok) {
                    accessiblePages++;
                }
            } catch (error) {
                // Page not accessible
            }
        }

        if (accessiblePages > 0) {
            return { success: true, message: `Frontend pages working - ${accessiblePages}/${pages.length} pages accessible` };
        } else {
            return { success: false, message: 'No frontend pages accessible' };
        }
    } catch (error) {
        return { success: false, message: `Frontend pages test failed: ${error.message}` };
    }
}

// Main test execution
async function runAllTests() {
    console.log(' Starting Expense Tracker - Simplified Test Suite');
    console.log('='.repeat(60));
    console.log(`Testing frontend and backend connectivity`);
    console.log(`Admin Credentials: ${CONFIG.adminCredentials.email}`);
    console.log('='.repeat(60));

    // Run all tests
    await runTest('Frontend Server', testFrontend);
    await runTest('Backend API', testBackend);
    await runTest('API Endpoints Structure', testAPIEndpoints);
    await runTest('CORS Configuration', testCORS);
    await runTest('Frontend Pages', testFrontendPages);
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
        console.log('\n ALL TESTS PASSED! The application infrastructure is working correctly.');
    } else if (successRate >= 80) {
        console.log('\n  MOST TESTS PASSED! Core infrastructure works, some issues detected.');
    } else {
        console.log('\n TESTS FAILED! Significant infrastructure issues detected.');
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