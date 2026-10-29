// L0: PDF page-count and link checks in Node (plan §4.23).
// Part 1 proves the inspector against generated fixtures with known answers (always runs).
// Part 2 checks real edition PDFs ONLY when configured; otherwise it is reported PENDING, never passed:
//   PDF_STAGING_FILES=/path/a.pdf,/path/b.pdf   local copies (e.g. downloaded by a human)
//   PDF_STAGING_URLS=https://…/epaper/2026_10_24_EU.pdf   GET, HMAC-signed like the app when the key is available
//   PDF_STAGING_CONTENT_IDS=2026_10_24_EU,2026_10_24_NA     same, URL built from config/environments.ts (stage)
//   PDF_MIN_PAGES=20   [ASSUMPTION] lower bound for a real print edition
// Signing key: env:STAGE_DOWNLOAD_HMAC_KEY via SecretsBroker (framework .env, never logged). Missing key ⇒ unsigned.
import '../../src/core/loadSettings.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { endpoints } from '../../config/environments.js';
import { envSecrets } from '../../config/secrets.js';
import { inspectPdf } from '../../src/contract/PdfInspector.js';
import { editionPdfUrl, signAssetRequest } from '../../src/secrets/AssetSigner.js';
import { SecretsBroker } from '../../src/secrets/SecretsBroker.js';
import type { SecretString } from '../../src/secrets/SecretString.js';
import { makePdf } from '../fixtures/makePdf.js';

describe('L0 pdf.contract — PdfInspector against fixtures with known answers', () => {
  it('counts pages exactly (1, 3, 12)', async () => {
    for (const n of [1, 3, 12]) {
      const r = await inspectPdf(await makePdf({ pages: n, uriLinks: [], internalLinks: [] }));
      assert.equal(r.pages, n);
      assert.equal(r.links.length, 0);
    }
  });

  it('finds URI and internal links with their pages and destinations', async () => {
    const r = await inspectPdf(
      await makePdf({
        pages: 4,
        uriLinks: [{ page: 1, uri: 'https://www.economist.com/a' }, { page: 3, uri: 'mailto:x@economist.com' }],
        internalLinks: [{ page: 2, toPage: 4 }, { page: 4, toPage: 1 }],
      }),
    );
    assert.equal(r.pages, 4);
    const uris = r.links.filter((l) => l.kind === 'uri').map((l) => `${l.page}:${l.uri}`);
    assert.deepEqual(uris, ['1:https://www.economist.com/a', '3:mailto:x@economist.com']);
    const internal = r.links.filter((l) => l.kind === 'internal').map((l) => `${l.page}->${l.destPage}`);
    assert.deepEqual(internal, ['2->4', '4->1']);
    assert.equal(r.brokenInternal.length, 0);
    assert.equal(r.suspiciousUri.length, 0);
  });

  it('reports internal links to a missing named destination as broken', async () => {
    const r = await inspectPdf(await makePdf({ pages: 2, uriLinks: [], internalLinks: [], brokenInternal: 2 }));
    assert.equal(r.brokenInternal.length, 2);
  });

  it('flags non-http(s)/mailto URIs as suspicious', async () => {
    const r = await inspectPdf(await makePdf({ pages: 1, uriLinks: [{ page: 1, uri: 'javascript:alert(1)' }], internalLinks: [] }));
    assert.equal(r.suspiciousUri.length, 1);
  });

  it('rejects a non-PDF', async () => {
    await assert.rejects(inspectPdf(new TextEncoder().encode('<html>not a pdf</html>')));
  });
});

describe('L0 pdf.contract — real edition PDFs (opt-in; PENDING when not configured)', function () {
  const files = (process.env['PDF_STAGING_FILES'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ids = (process.env['PDF_STAGING_CONTENT_IDS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const urls = [
    ...(process.env['PDF_STAGING_URLS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    ...ids.map((id) => editionPdfUrl(endpoints.stage.mobileAssets, id)),
  ];
  const minPages = Number(process.env['PDF_MIN_PAGES'] ?? 20);

  if (files.length === 0 && urls.length === 0) {
    it('real edition PDF page count and links (set PDF_STAGING_FILES or PDF_STAGING_URLS; Q4 open, asset host is HMAC-signed)');
    return;
  }
  const check = async (label: string, bytes: Uint8Array) => {
    const r = await inspectPdf(bytes);
    assert.ok(r.pages >= minPages, `${label}: ${r.pages} pages < PDF_MIN_PAGES ${minPages}`);
    assert.equal(r.brokenInternal.length, 0, `${label}: broken internal links on pages ${r.brokenInternal.map((l) => l.page).join(',')}`);
    assert.equal(r.suspiciousUri.length, 0, `${label}: suspicious URIs ${r.suspiciousUri.map((l) => l.uri).join(',')}`);
  };
  for (const f of files) it(`file ${f}`, async () => check(f, new Uint8Array(await readFile(f))));
  let key: SecretString | undefined;
  before(async () => {
    if (urls.length) key = await new SecretsBroker().read(envSecrets.stage.downloadHmacKey).catch(() => undefined);
  });
  for (const u of urls) {
    it(`url ${u}`, async () => {
      const headers: Record<string, string> = key ? { ...signAssetRequest(u, key) } : {};
      const res = await fetch(u, { redirect: 'follow', headers });
      assert.equal(res.status, 200, `${u} → HTTP ${res.status} (${key ? 'HMAC-signed' : 'unsigned: STAGE_DOWNLOAD_HMAC_KEY not set'})`);
      assert.match(res.headers.get('content-type') ?? '', /pdf|octet-stream/);
      await check(u, new Uint8Array(await res.arrayBuffer()));
    });
  }
});
