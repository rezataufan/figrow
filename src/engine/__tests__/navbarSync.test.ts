import { describe, it, expect, beforeEach } from 'vitest';
import { projectDoc } from '../doc/projectDoc';
import {
  detectNavbarInHtml,
  reconcileNavbarForPage,
  syncNavbarAcrossProject,
  setNavbarAutoSync,
  isNavbarAutoSyncEnabled,
} from '../components/navbarSyncEngine';

describe('Smart Cross-Page Navbar Synchronization', () => {
  beforeEach(() => {
    projectDoc.resetProject();
    setNavbarAutoSync(true);
  });

  it('detects navbars with <nav>, <header>, or .navbar classes', () => {
    const htmlWithNav = '<!doctype html><html><body><nav class="main-nav"><a href="index.html">Home</a></nav></body></html>';
    const detected = detectNavbarInHtml(htmlWithNav);
    expect(detected).not.toBeNull();
    expect(detected?.outerHtml).toContain('class="main-nav"');

    const htmlWithHeader = '<!doctype html><html><body><header id="header-bar"><p>Logo</p></header></body></html>';
    const detectedHeader = detectNavbarInHtml(htmlWithHeader);
    expect(detectedHeader).not.toBeNull();
    expect(detectedHeader?.outerHtml).toContain('id="header-bar"');
  });

  it('reconciles active page links (.active / aria-current="page") for target page', () => {
    const sourceNavbar = `<nav class="navbar">
      <a href="index.html" class="nav-link active" aria-current="page">Home</a>
      <a href="about.html" class="nav-link">About</a>
      <a href="contact.html" class="nav-link">Contact</a>
    </nav>`;

    const reconciledAbout = reconcileNavbarForPage(sourceNavbar, 'about.html');
    // Home should no longer have active or aria-current
    expect(reconciledAbout).not.toContain('<a href="index.html" class="nav-link active"');
    // About should now have active
    expect(reconciledAbout).toMatch(/<a href="about\.html"[^>]*class="[^"]*active[^"]*"/);
  });

  it('synchronizes navbar edits from source page to all other HTML pages in the project', () => {
    // Setup index.html with navbar
    const indexHtml = `<!doctype html><html><head><title>Home</title></head><body>
      <nav class="navbar" data-vds-id="n_nav_1">
        <a href="index.html" class="active">Home</a>
        <a href="about.html">About</a>
      </nav>
      <main><h1>Welcome Home</h1></main>
    </body></html>`;
    projectDoc.registerFile('index.html', indexHtml);

    // Setup about.html with old navbar
    const aboutHtml = `<!doctype html><html><head><title>About</title></head><body>
      <nav class="navbar" data-vds-id="n_nav_about">
        <a href="index.html">Home Old</a>
      </nav>
      <main><h1>About Us</h1></main>
    </body></html>`;
    projectDoc.registerFile('about.html', aboutHtml);

    // Setup contact.html with old navbar
    const contactHtml = `<!doctype html><html><head><title>Contact</title></head><body>
      <nav class="navbar" data-vds-id="n_nav_contact">
        <a href="index.html">Old Nav</a>
      </nav>
      <main><h1>Contact Us</h1></main>
    </body></html>`;
    projectDoc.registerFile('contact.html', contactHtml);

    // Now user edits navbar in index.html to add a "Pricing" link and new logo
    const updatedIndex = indexHtml.replace('About</a>', 'About</a><a href="pricing.html">Pricing</a>');
    projectDoc.registerFile('index.html', updatedIndex);

    // Trigger sync
    const result = syncNavbarAcrossProject('index.html');
    expect(result.syncedCount).toBe(2);
    expect(result.targetFiles).toContain('about.html');
    expect(result.targetFiles).toContain('contact.html');

    // Verify about.html now contains "Pricing"
    const updatedAbout = projectDoc.getFileText('about.html');
    expect(updatedAbout).toContain('Pricing</a>');
    expect(updatedAbout).toContain('About Us</h1>'); // Main content untouched!

    // Verify contact.html now contains "Pricing"
    const updatedContact = projectDoc.getFileText('contact.html');
    expect(updatedContact).toContain('Pricing</a>');
    expect(updatedContact).toContain('Contact Us</h1>');
  });
});
