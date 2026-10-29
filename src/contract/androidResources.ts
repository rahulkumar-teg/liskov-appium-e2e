// Parsers for Android resources used by the contract layer.
import { XMLParser } from 'fast-xml-parser';

/** Android string resource decoding: XML entities, \' \" \n \t \\ \@ \? and \uXXXX escapes; surrounding quotes. */
function decodeAndroidString(raw: string): string {
  let s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  s = s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c: string) => {
    if (c.startsWith('u') && c.length === 5) return String.fromCharCode(parseInt(c.slice(1), 16));
    return ({ n: '\n', t: '\t' } as Record<string, string>)[c] ?? c;
  });
}

/** name → decoded value for every <string> in a values/strings.xml. Text is taken raw so we decode exactly once. */
export function parseStringsXml(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /<string\s+([^>]*?)>([\s\S]*?)<\/string>/g;
  for (const m of xml.matchAll(re)) {
    const attrs = m[1] ?? '';
    const name = /name="([^"]+)"/.exec(attrs)?.[1];
    if (!name) continue;
    out.set(name, decodeAndroidString(m[2] ?? ''));
  }
  return out;
}

/** key → string value for remote_config_defaults.xml (<defaults><entry><key/><value/></entry>). */
export function parseRemoteConfigDefaults(xml: string): Map<string, string> {
  const p = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });
  type Entry = { key: string; value: string };
  const doc = p.parse(xml) as { defaults?: { entry?: Entry[] | Entry } };
  if (!doc.defaults) throw new Error('remote_config_defaults.xml: root <defaults> not found');
  const entries = doc.defaults.entry;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return new Map(list.map((e) => [String(e.key), String(e.value ?? '')]));
}
