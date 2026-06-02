import puppeteer from 'puppeteer-core';

const SITE = 'http://document-copilot-frontend-521170871988.s3-website.ap-south-1.amazonaws.com/';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();

const reqs = [];
const seen = new Set();
page.on('console', (m) => {
  const t = `[c.${m.type()}] ${m.text()}`;
  if (!seen.has(t)) { seen.add(t); reqs.push(t); } // dedupe noisy warns
});
page.on('pageerror', (e) => reqs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => reqs.push(`[FAIL] ${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('lambda-url')) {
    let body = '';
    try { body = (await r.text()).slice(0, 200); } catch {}
    reqs.push(`[${r.status()}] ${r.request().method()} ${u.split('on.aws')[1]} :: ${body}`);
  }
});

await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 30000 }).catch((e) => console.log('goto', e.message));
await new Promise((r) => setTimeout(r, 2500));

// inspect the input controls
const inputHtml = await page.evaluate(() => {
  const el = document.querySelector('.copilotKitInput') || document.querySelector('textarea')?.closest('div');
  return el ? el.outerHTML.slice(0, 600) : 'NO INPUT FOUND';
});
console.log('=== INPUT AREA HTML ===\n', inputHtml, '\n');

// Attempt 1: click a starter chip (tests sendMessage)
console.log('=== clicking starter chip ===');
const chipClicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('How tight should the drive chain'));
  if (b) { b.click(); return true; }
  return false;
});
console.log('chip clicked:', chipClicked);
await new Promise((r) => setTimeout(r, 6000));

// Attempt 2: type + click the send button
const ta = await page.$('.copilotKitInput textarea, textarea');
if (ta) {
  await ta.click();
  await ta.type('How do I clean the scanner lens?');
  await new Promise((r) => setTimeout(r, 300));
  const btnClicked = await page.evaluate(() => {
    const btn = document.querySelector('.copilotKitInput button[type="submit"], .copilotKitInput button:last-of-type');
    if (btn) { btn.click(); return btn.outerHTML.slice(0, 120); }
    return 'NO SEND BUTTON';
  });
  console.log('send button:', btnClicked);
}
// wait up to 70s for the agent to finish (answer text + figure cards)
let done = false;
for (let i = 0; i < 35; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const st = await page.evaluate(() => ({
    imgs: document.querySelectorAll('#root img').length,
    txt: document.querySelector('#root')?.innerText ?? '',
  }));
  if (st.imgs > 0 || st.txt.includes('Sources:')) { done = true; break; }
  if (!st.txt.includes('Looking through')) { /* maybe answered without cards */ }
}

const final = await page.evaluate(() => ({
  imgs: document.querySelectorAll('#root img').length,
  hasSources: !!document.querySelector('#root')?.innerText.includes('Sources:'),
  txt: document.querySelector('#root')?.innerText ?? '',
}));
console.log('\n=== FUNCTION-URL REQUESTS + KEY CONSOLE ===');
console.log(reqs.slice(-25).join('\n'));
console.log('\n=== RESULT: figure imgs =', final.imgs, '| sources line =', final.hasSources, '| answered =', done);
console.log('=== #root text (last 700) ===\n', final.txt.slice(-700));
await browser.close();
