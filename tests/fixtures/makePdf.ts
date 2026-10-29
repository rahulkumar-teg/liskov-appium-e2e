// Generates a deterministic fixture PDF (no binary committed): N pages, URI links and internal GoTo links.
import { PDFDocument, PDFName, PDFString, PDFArray, PDFNumber, StandardFonts } from 'pdf-lib';

export interface FixtureSpec {
  pages: number;
  uriLinks: Array<{ page: number; uri: string }>;
  internalLinks: Array<{ page: number; toPage: number }>; // toPage may be out of range only via brokenRef
  brokenInternal?: number; // number of internal links pointing at a missing named destination
}

export async function makePdf(spec: FixtureSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = Array.from({ length: spec.pages }, (_, i) => {
    const p = doc.addPage([400, 600]);
    p.drawText(`fixture page ${i + 1}`, { x: 40, y: 540, size: 18, font });
    return p;
  });
  const addAnnot = (pageIdx: number, dict: Record<string, unknown>) => {
    const page = pages[pageIdx];
    if (!page) throw new Error(`fixture: no page ${pageIdx + 1}`);
    const annot = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 40, 200, 80], Border: [0, 0, 0], ...dict });
    const ref = doc.context.register(annot);
    const existing = page.node.lookup(PDFName.of('Annots'));
    if (existing instanceof PDFArray) existing.push(ref);
    else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
  };
  for (const l of spec.uriLinks) {
    addAnnot(l.page - 1, { A: { Type: 'Action', S: 'URI', URI: PDFString.of(l.uri) } });
  }
  for (const l of spec.internalLinks) {
    const target = pages[l.toPage - 1];
    if (!target) throw new Error(`fixture: no target page ${l.toPage}`);
    addAnnot(l.page - 1, { Dest: doc.context.obj([target.ref, PDFName.of('XYZ'), PDFNumber.of(0), PDFNumber.of(600), PDFNumber.of(0)]) });
  }
  for (let i = 0; i < (spec.brokenInternal ?? 0); i++) {
    addAnnot(0, { Dest: PDFString.of(`missing-dest-${i}`) });
  }
  return doc.save({ useObjectStreams: false });
}
