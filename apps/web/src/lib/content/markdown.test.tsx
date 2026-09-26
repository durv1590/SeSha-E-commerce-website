import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown, parseBlocks, safeHref } from './markdown';

const html = (md: string) => renderToStaticMarkup(<Markdown source={md} />);

describe('restricted markdown', () => {
  it('parses headings, paragraphs and lists', () => {
    expect(
      parseBlocks('## Title\nIntro line\nsecond line\n\n- a\n- b\n1. one\n2. two\n### Sub'),
    ).toEqual([
      { kind: 'h2', text: 'Title' },
      { kind: 'p', text: 'Intro line\nsecond line' },
      { kind: 'ul', items: ['a', 'b'] },
      { kind: 'ol', items: ['one', 'two'] },
      { kind: 'h3', text: 'Sub' },
    ]);
  });

  it('renders inline formatting and safe links', () => {
    const out = html(
      '**Bold** and _italic_ with [returns](/pages/returns) and [site](https://example.com) and [mail](mailto:a@b.co)',
    );
    expect(out).toContain('<strong>Bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<a href="/pages/returns">returns</a>');
    expect(out).toContain(
      'href="https://example.com" rel="noopener noreferrer nofollow" target="_blank"',
    );
    expect(out).toContain('href="mailto:a@b.co"');
  });

  it('never outputs HTML from the source or unsafe links', () => {
    const out = html(
      '<script>alert(1)</script>\n\n[click](javascript:alert(1)) [x](//evil.com) <img src=x onerror=alert(1)>',
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('href="javascript');
    expect(out).not.toContain('href="//evil');
    expect(safeHref('JavaScript:alert(1)')).toBeNull();
    expect(safeHref('tel:+91 98765 43210')).toBe('tel:+91 98765 43210');
  });

  it('keeps single line breaks inside a paragraph', () => {
    expect(html('Line one\nLine two')).toBe('<div><p>Line one<br/>Line two</p></div>');
  });
});
