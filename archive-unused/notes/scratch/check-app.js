import { chromium } from '@playwright/test';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR] ${err.message}`);
    console.error(err.stack);
  });

  try {
    console.log('Navigating to http://localhost:9002...');
    await page.goto('http://localhost:9002', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Page loaded. Current URL:', page.url());
    
    const content = await page.content();
    console.log('Page HTML length:', content.length);
    console.log('Body text:', await page.locator('body').innerText());
    
    await page.screenshot({ path: 'k:/Project/kenku/Finora/scratch/screenshot.png' });
    console.log('Screenshot saved to k:/Project/kenku/Finora/scratch/screenshot.png');
  } catch (error) {
    console.error('Failed to load page:', error);
  } finally {
    await browser.close();
  }
})();
