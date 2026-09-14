import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'docs', 'user-manual.html');
const pdfPath = path.join(root, 'docs', '스마트건축물안전점검_사용자매뉴얼.pdf');

if (!fs.existsSync(htmlPath)) {
    console.error('Missing:', htmlPath);
    process.exit(1);
}

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#64748b;text-align:center;padding:0 16mm;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
});
await browser.close();
console.log('Wrote', pdfPath);
