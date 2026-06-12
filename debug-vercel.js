(async () => {
  const puppeteer = (await import('puppeteer')).default;
  const delay = ms => new Promise(r => setTimeout(r, ms));

  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));

  console.log("Navigating to app...");
  await page.goto('https://business-financial-management.vercel.app/');
  
  await delay(2000);
  
  console.log("Current URL:", page.url());
  
  // Register an account
  if (page.url().includes('login')) {
    console.log("Switching to Sign Up...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const signUpBtn = btns.find(b => b.textContent.includes('Sign Up'));
      if (signUpBtn) signUpBtn.click();
    });
    
    await delay(1000);
    console.log("Filling form...");
    
    // Fill the registration form
    await page.type('#company', 'Test Company ' + Date.now());
    await page.type('#name', 'Test User');
    await page.type('#email', 'test' + Date.now() + '@example.com');
    await page.type('#password', 'testpassword123');
    
    console.log("Submitting...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const submitBtn = btns.find(b => b.textContent.includes('Create Account'));
      if (submitBtn) submitBtn.click();
    });
    
    await delay(5000);
    console.log("URL after login:", page.url());
  }

  // Now reload
  console.log("Reloading page...");
  await page.reload({ waitUntil: 'networkidle0' });
  console.log("Reload complete. URL:", page.url());
  
  await delay(5000);

  // Take a screenshot
  await page.screenshot({ path: 'vercel_screenshot.png' });
  console.log("Screenshot saved.");

  await browser.close();
})();
