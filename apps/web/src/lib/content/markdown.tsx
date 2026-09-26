import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Renders the restricted Markdown used by CMS pages straight to React elements, so no
 * HTML from the database ever reaches the page (nothing to sanitise, no XSS surface).
 *
 * Supported: `## ` / `### ` headings, paragraphs (blank-line separated; single line
 * breaks are kept), `- ` bullet and `1. ` numbered lists, `**bold**`, `_italic_` /
 * `*italic*`, and `[text](target)` links where the target is a site path, https://,
 * mailto: or tel:. Anything else is shown as plain text.
 */

const SAFE_LINK = /^(\/(?!\/)[^\s]*|https:\/\/[^\s]+|mailto:[^\s]+|tel:\+?[0-9 -]+)$/;

export function safeHref(target: string): string | null {
  const t = target.trim();
  return SAFE_LINK.test(t) ? t : null;
}

/** Inline formatting: links, bold and italic (in that precedence). */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|(?:_([^_]+)_|\*([^*]+)\*)/g;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${n++}`;
    if (m[1] !== undefined) {
      const href = safeHref(m[2]!);
      if (!href) out.push(m[1]);
      else if (href.startsWith('/'))
        out.push(
          <Link key={key} href={href}>
            {renderInline(m[1], key)}
          </Link>,
        );
      else
        out.push(
          <a
            key={key}
            href={href}
            {...(href.startsWith('https://')
              ? { rel: 'noopener noreferrer nofollow', target: '_blank' }
              : {})}
          >
            {renderInline(m[1], key)}
            {href.startsWith('https://') && <span className="sr-only"> (opens in a new tab)</span>}
          </a>,
        );
    } else if (m[3] !== undefined) out.push(<strong key={key}>{renderInline(m[3], key)}</strong>);
    else out.push(<em key={key}>{m[4] ?? m[5]}</em>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: 'h2' | 'h3' | 'p'; text: string } | { kind: 'ul' | 'ol'; items: string[] };

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join('\n') });
    para = [];
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{2,3})\s+(.+)$/.exec(line);
    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    const ol = /^\s*\d{1,3}[.)]\s+(.+)$/.exec(line);
    if (!line.trim()) flush();
    else if (h) {
      flush();
      blocks.push({ kind: h[1]!.length === 2 ? 'h2' : 'h3', text: h[2]! });
    } else if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      if (para.length) {
        blocks.push({ kind: 'p', text: para.join('\n') });
        para = [];
      }
      if (list && list.kind !== kind) flush();
      list ??= { kind, items: [] };
      list.items.push((ul ?? ol)![1]!);
    } else {
      if (list) flush();
      para.push(line.replace(/^#\s+/, ''));
    }
  }
  flush();
  return blocks;
}

/** Page body. Headings start at h2 (the page title is the h1). */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className}>
      {parseBlocks(source).map((b, i) => {
        const key = `b${i}`;
        switch (b.kind) {
          case 'h2':
            return <h2 key={key}>{renderInline(b.text, key)}</h2>;
          case 'h3':
            return <h3 key={key}>{renderInline(b.text, key)}</h3>;
          case 'ul':
          case 'ol': {
            const Tag = b.kind;
            return (
              <Tag key={key}>
                {b.items.map((item, j) => (
                  <li key={j}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </Tag>
            );
          }
          default:
            return (
              <p key={key}>
                {b.text
                  .split('\n')
                  .flatMap((line, j) =>
                    j
                      ? [<br key={`br${j}`} />, ...renderInline(line, `${key}-${j}`)]
                      : renderInline(line, `${key}-${j}`),
                  )}
              </p>
            );
        }
      })}
    </div>
  );
}
