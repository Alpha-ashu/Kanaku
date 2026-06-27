/**
 * FinanceLife - Real-Time Features Verification Script
 * 
 * Copy and paste this into browser console to verify all real-time features are working
 * 
 * Usage: 
 * 1. Open http://localhost:5174 in browser
 * 2. Press F12 to open DevTools
 * 3. Go to Console tab
 * 4. Copy and paste the code below
 * 5. Press Enter to run
 */

(async function verifyRealtimeFeatures() {
  console.log(' FinanceLife - Real-Time Features Verification');
  console.log('=' .repeat(50));

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  // Test 1: Check Database
  console.log('\n1 Checking Database...');
  try {
    const accountCount = await db.accounts.count();
    const txCount = await db.transactions.count();
    console.log(`    Database operational`);
    console.log(`      - Accounts: ${accountCount}`);
    console.log(`      - Transactions: ${txCount}`);
    results.passed++;
  } catch (error) {
    console.log(`    Database error: ${error.message}`);
    results.failed++;
  }

  // Test 2: Check Service Worker
  console.log('\n2 Checking Service Worker...');
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        console.log(`    Service Worker registered`);
        results.passed++;
      } else {
        console.log(`     Service Worker not registered`);
        results.warnings++;
      }
    } else {
      console.log(`     Service Workers not supported`);
      results.warnings++;
    }
  } catch (error) {
    console.log(`    Error checking Service Worker: ${error.message}`);
    results.failed++;
  }

  // Test 3: Check Network Status
  console.log('\n3 Checking Network Status...');
  try {
    const online = navigator.onLine;
    console.log(`    Online status: ${online ? ' ONLINE' : ' OFFLINE'}`);
    results.passed++;
  } catch (error) {
    console.log(`    Error checking network: ${error.message}`);
    results.failed++;
  }

  // Test 4: Check Storage
  console.log('\n4 Checking Storage...');
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = ((usage / quota) * 100).toFixed(1);
      console.log(`    Storage quota: ${(quota / 1024 / 1024).toFixed(0)}MB`);
      console.log(`      - Used: ${(usage / 1024 / 1024).toFixed(2)}MB (${percentage}%)`);
      results.passed++;
    } else {
      console.log(`     Storage quota API not available`);
      results.warnings++;
    }
  } catch (error) {
    console.log(`    Error checking storage: ${error.message}`);
    results.failed++;
  }

  // Test 5: Check Real-Time Sync Manager
  console.log('\n5 Checking Real-Time Sync Manager...');
  try {
    if (typeof realtimeSyncManager !== 'undefined') {
      const isConnected = realtimeSyncManager.isConnected();
      console.log(`    Sync Manager active`);
      console.log(`      - Connected: ${isConnected}`);
      results.passed++;
    } else {
      console.log(`    Real-Time Sync Manager not available`);
      results.failed++;
    }
  } catch (error) {
    console.log(`    Error checking sync manager: ${error.message}`);
    results.failed++;
  }

  // Test 6: Check Health Checker
  console.log('\n6 Checking Health System...');
  try {
    if (typeof HealthChecker !== 'undefined') {
      const health = await HealthChecker.checkHealth();
      console.log(`    Health Check Complete`);
      console.log(`      - Status: ${health.status.toUpperCase()}`);
      console.log(`      - Database: ${health.components.database.status}`);
      console.log(`      - Service Worker: ${health.components.serviceWorker.status}`);
      console.log(`      - Network: ${health.components.network.status}`);
      console.log(`      - Memory: ${health.components.memory.status}`);
      results.passed++;
    } else {
      console.log(`     Health Checker not available`);
      results.warnings++;
    }
  } catch (error) {
    console.log(`    Error checking health: ${error.message}`);
    results.failed++;
  }

  // Test 7: Check Import/Export Functions
  console.log('\n7 Checking Import/Export...');
  try {
    const hasImportExport = typeof exportDataToJSON !== 'undefined';
    if (hasImportExport) {
      console.log(`    Import/Export functions available`);
      results.passed++;
    } else {
      console.log(`     Import/Export not loaded`);
      results.warnings++;
    }
  } catch (error) {
    console.log(`    Error checking import/export: ${error.message}`);
    results.failed++;
  }

  // Test 8: Check Memory Usage
  console.log('\n8 Checking Memory Usage...');
  try {
    if ((performance).memory) {
      const memory = (performance).memory;
      const usedPercent = ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(1);
      console.log(`    Memory status: ${usedPercent}% used`);
      if (usedPercent > 80) {
        console.log(`        High memory usage detected`);
        results.warnings++;
      } else {
        results.passed++;
      }
    } else {
      console.log(`     Memory API not available`);
      results.warnings++;
    }
  } catch (error) {
    console.log(`    Error checking memory: ${error.message}`);
    results.failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(' SUMMARY');
  console.log('='.repeat(50));
  console.log(` Passed: ${results.passed}`);
  console.log(`  Warnings: ${results.warnings}`);
  console.log(` Failed: ${results.failed}`);
  
  const totalTests = results.passed + results.warnings + results.failed;
  const successRate = ((results.passed / totalTests) * 100).toFixed(0);
  
  console.log(`\n Success Rate: ${successRate}%`);
  
  if (results.failed === 0) {
    console.log('\n All real-time features are working correctly!');
  } else {
    console.log('\n  Some features need attention. Check errors above.');
  }
  
  console.log('\n Tips:');
  console.log('   - Try adding a transaction to test real-time sync');
  console.log('   - Go offline and add data to test offline mode');
  console.log('   - Come back online to test automatic sync');
  console.log('   - Go to Settings to test import/export');
  console.log('\n Documentation: See REALTIME_FEATURES.md and QUICK_START.md');
})();
