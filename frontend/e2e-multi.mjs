import puppeteer from 'puppeteer-core';

const SITE = 'http://document-copilot-frontend-521170871988.s3-website.ap-south-1.amazonaws.com/';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();

const log = [];
const seen = new Set();
const push = (s) => { if (!seen.has(s)) { seen.add(s); log.push(`${new Date().toISOString().slice(14, 19)} ${s}`); } };
page.on('console', (m) => push(`[c.${m.type()}] ${m.text()}`.slice(0, 200)));
page.on('pageerror', (e) => push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => push(`[FAIL] ${r.method()} ${r.url().split('on.aws')[1] ?? r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('lambda-url')) push(`[${r.status()}] ${r.request().method()} ${u.split('on.aws')[1]}`);
});

const state = () =>
  page.evaluate(() => ({
    users: document.querySelectorAll('.copilotKitUserMessage').length,
    rootLen: (document.querySelector('#root')?.innerText ?? '').length,
    imgs: document.querySelectorAll('#root img').length,
    inProgress: !!document.querySelector('[data-copilotkit-in-progress="true"]'),
  }));

async function ask(text, turn) {
  const before = await state();
  const ta = await page.$('.copilotKitInput textarea');
  await ta.click();
  await ta.type(text);
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => document.querySelector('.copilotKitInput button[aria-label="Send"]')?.click());
  push(`>>> TURN ${turn} sent: "${text}" (rootLen ${before.rootLen}, imgs ${before.imgs})`);
  // answer renders in the action block → detect via #root text growth + stability
  let last = 0, stable = 0;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await state();
    const grew = s.rootLen - before.rootLen;
    if (grew > 250 && s.rootLen === last) stable++; else stable = 0;
    last = s.rootLen;
    if (grew > 250 && !s.inProgress && stable >= 2) {
      push(`<<< TURN ${turn} ANSWERED (rootLen ${s.rootLen} (+${grew}), imgs ${s.imgs})`);
      return true;
    }
  }
  const s = await state();
  push(`!!! TURN ${turn} TIMED OUT (rootLen ${s.rootLen}, imgs ${s.imgs}, inProgress ${s.inProgress})`);
  return false;
}

await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 30000 }).catch((e) => push('goto ' + e.message));
await new Promise((r) => setTimeout(r, 2500));

await ask('How tight should the drive chain be?', 1);
await new Promise((r) => setTimeout(r, 1500));
await ask('what about drive box malfunction?', 2);

console.log('=== TIMELINE ===');
console.log(log.join('\n'));
const finalText = await page.evaluate(() => document.querySelector('#root')?.innerText ?? '');
console.log('\n=== FINAL #root TEXT (last 900) ===\n' + finalText.slice(-900));
await browser.close();
