// Login-page guard core (plan §4.27): snapshot the login form's shape, never submit anything.
export interface FormField {
  tag: 'input' | 'button';
  type?: string;
  name?: string;
  autocomplete?: string;
  placeholder?: string;
  text?: string;
}
const attr = (s: string, a: string) => new RegExp(`\\b${a}\\s*=\\s*"([^"]*)"|\\b${a}\\s*=\\s*'([^']*)'`, 'i').exec(s)?.slice(1).find((x) => x !== undefined);

const opt = (k: string, v: string | undefined): Record<string, string> => (v === undefined ? {} : { [k]: v });

export function snapshotForm(html: string): FormField[] {
  const out: FormField[] = [];
  for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
    const a = m[1]!;
    const type = (attr(a, 'type') ?? 'text').toLowerCase();
    if (type === 'hidden') continue; // csrf tokens etc. change every load and may be sensitive
    out.push({ tag: 'input', type, ...opt('name', attr(a, 'name')), ...opt('autocomplete', attr(a, 'autocomplete')), ...opt('placeholder', attr(a, 'placeholder')) });
  }
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const type = (attr(m[1]!, 'type') ?? 'submit').toLowerCase();
    if (type !== 'submit') continue;
    out.push({ tag: 'button', type, text: m[2]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() });
  }
  return out;
}

export function diffForm(expected: FormField[], actual: FormField[]): string[] {
  const key = (f: FormField) => JSON.stringify(f);
  const e = new Set(expected.map(key));
  const a = new Set(actual.map(key));
  return [...[...e].filter((x) => !a.has(x)).map((x) => `- ${x}`), ...[...a].filter((x) => !e.has(x)).map((x) => `+ ${x}`)];
}
