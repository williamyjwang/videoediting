import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({executablePath: process.env.REMOTION_BROWSER_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1080}});
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.MCC_TEST_ORIGIN || 'http://127.0.0.1:3001/');
  await page.getByRole('heading', {name: 'Start with your footage'}).waitFor();
  await page.screenshot({path: '.data/studio-desktop.png', fullPage: true});
  await page.getByRole('button', {name: 'Explore with a sample'}).click();
  await page.getByLabel('Project title').waitFor();
  await page.getByLabel('Opening hook').fill('A considered edit.');
  await page.getByRole('button', {name: 'Save edit', exact: true}).click();
  await page.getByText('Edit plan saved.', {exact: true}).waitFor();
  assert.equal(await page.getByLabel('Opening hook').inputValue(), 'A considered edit.');
  await page.screenshot({path: '.data/studio-sample.png', fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: '.data/studio-mobile.png', fullPage: true});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile layout should fit');
  assert.deepEqual(errors, []);
  console.log('PASS: studio loads, sample project, Remotion preview, hook editing, save, and mobile layout. No browser exceptions.');
} finally {await browser.close();}
