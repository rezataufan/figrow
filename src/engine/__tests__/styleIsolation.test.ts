import { describe, it, expect, beforeEach } from 'vitest';
import { projectDoc } from '../doc/projectDoc';
import { parseHtmlToVNodes } from '../ast/htmlAst';
import { writeInlineStyleAttr } from '../css/cascadeEngine';

describe('Direct Element Style Isolation', () => {
  beforeEach(() => {
    projectDoc.resetProject();
  });

  it('writes style attribute directly to the element without altering siblings', () => {
    const customHtml = '<div id="root"><button class="btn" data-vds-id="btn1">Btn 1</button><button class="btn" data-vds-id="btn2">Btn 2</button></div>';
    const htmlText = projectDoc.files.get('index.html')!;
    htmlText.delete(0, htmlText.length);
    htmlText.insert(0, customHtml);

    const tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
    const btn1 = tree.nodes['btn1'];
    expect(btn1).toBeDefined();

    writeInlineStyleAttr(btn1!, { 'background-color': '#ff0000', width: '200px' });
    const updatedHtml = projectDoc.getFileText('index.html');

    // btn1 must have inline style; btn2 must remain untouched
    expect(updatedHtml).toContain('data-vds-id="btn1" style="background-color: #ff0000; width: 200px;"');
    expect(updatedHtml).toContain('<button class="btn" data-vds-id="btn2">Btn 2</button>');
  });

  it('updates or deletes existing inline style properties without touching unrelated attributes', () => {
    const customHtml = '<div id="root"><button class="btn" data-vds-id="btn1" style="color: blue; margin: 10px;">Btn 1</button></div>';
    const htmlText = projectDoc.files.get('index.html')!;
    htmlText.delete(0, htmlText.length);
    htmlText.insert(0, customHtml);

    const tree = parseHtmlToVNodes('index.html', projectDoc.getFileText('index.html'));
    const btn1 = tree.nodes['btn1'];

    writeInlineStyleAttr(btn1!, { color: '#ffffff', margin: null, width: '150px' });
    const updatedHtml = projectDoc.getFileText('index.html');

    expect(updatedHtml).toContain('color: #ffffff');
    expect(updatedHtml).toContain('width: 150px');
    expect(updatedHtml).not.toContain('margin: 10px');
  });
});
