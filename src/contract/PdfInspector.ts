// PDF checks in Node (plan §4.23): page count and link annotations via pdfjs-dist. No device, no rendering.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfLink {
  page: number; // 1-based
  kind: 'uri' | 'internal' | 'other';
  uri?: string;
  /** For internal links: 1-based destination page when resolvable. */
  destPage?: number;
}

export interface PdfReport {
  pages: number;
  links: PdfLink[];
  /** Internal links whose destination page is outside 1..pages, or unresolvable. */
  brokenInternal: PdfLink[];
  /** URI links that are not http(s)/mailto. */
  suspiciousUri: PdfLink[];
  bytes: number;
}

interface RawAnnotation {
  subtype?: string;
  url?: string;
  unsafeUrl?: string;
  dest?: unknown;
}

export async function inspectPdf(data: Uint8Array): Promise<PdfReport> {
  const bytes = data.byteLength;
  // pdfjs takes ownership of the buffer; pass a copy so callers can reuse theirs.
  const doc = await getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
  try {
    const links: PdfLink[] = [];
    const brokenInternal: PdfLink[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const annots = (await page.getAnnotations()) as RawAnnotation[];
      for (const a of annots) {
        if (a.subtype !== 'Link') continue;
        const uri = a.url ?? a.unsafeUrl;
        if (uri) {
          links.push({ page: p, kind: 'uri', uri });
          continue;
        }
        if (a.dest !== undefined && a.dest !== null) {
          const link: PdfLink = { page: p, kind: 'internal' };
          try {
            const dest = typeof a.dest === 'string' ? await doc.getDestination(a.dest) : (a.dest as unknown[]);
            const ref = Array.isArray(dest) ? dest[0] : undefined;
            if (ref && typeof ref === 'object') link.destPage = (await doc.getPageIndex(ref as { num: number; gen: number })) + 1;
            else if (typeof ref === 'number') link.destPage = ref + 1;
          } catch {
            /* unresolvable → broken */
          }
          links.push(link);
          if (link.destPage === undefined || link.destPage < 1 || link.destPage > doc.numPages) brokenInternal.push(link);
          continue;
        }
        links.push({ page: p, kind: 'other' });
      }
      page.cleanup();
    }
    const suspiciousUri = links.filter((l) => l.kind === 'uri' && !/^(https?:|mailto:)/i.test(l.uri ?? ''));
    return { pages: doc.numPages, links, brokenInternal, suspiciousUri, bytes };
  } finally {
    await doc.destroy();
  }
}
