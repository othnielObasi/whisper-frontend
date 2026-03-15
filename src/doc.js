import './doc.css';

// ============================================
// Password Gate
// ============================================
const PASSWORD_HASH = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'; // not used — simple compare

function renderPasswordGate() {
  const root = document.getElementById('doc-root');
  root.innerHTML = `
    <div class="password-gate">
      <div class="password-card">
        <div class="logo-icon">📄</div>
        <h1>Implementation Report</h1>
        <p class="subtitle">Godstone Tabernacle — Restricted Access</p>
        <form id="pw-form">
          <div class="input-group">
            <input type="password" id="pw-input" placeholder="Enter access password" autocomplete="off" autofocus />
          </div>
          <div id="pw-error" class="error-msg" style="display:none;"></div>
          <button type="submit">View Report</button>
        </form>
      </div>
    </div>
  `;

  const form = document.getElementById('pw-form');
  const input = document.getElementById('pw-input');
  const error = document.getElementById('pw-error');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value;
    if (val === 'blue0cean') {
      sessionStorage.setItem('doc-auth', '1');
      renderReport();
    } else {
      input.classList.add('error');
      error.textContent = 'Incorrect password. Please try again.';
      error.style.display = 'block';
      input.value = '';
      input.focus();
      setTimeout(() => input.classList.remove('error'), 500);
    }
  });
}

// ============================================
// Check auth on load
// ============================================
function init() {
  if (sessionStorage.getItem('doc-auth') === '1') {
    renderReport();
  } else {
    renderPasswordGate();
  }
}

// ============================================
// Markdown-ish to HTML converter
// ============================================
function md(text) {
  // Convert markdown-style content to HTML
  let html = text;

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre><code>${escaped}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic (single *)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  return html;
}

function parseTable(lines) {
  // lines[0] = header, lines[1] = separator, lines[2..n] = rows
  const headerCells = lines[0].split('|').map(c => c.trim()).filter(Boolean);
  const rows = lines.slice(2).filter(l => l.includes('|'));

  let html = '<table><thead><tr>';
  for (const h of headerCells) {
    html += `<th>${md(h)}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of rows) {
    const cells = row.split('|').map(c => c.trim()).filter(Boolean);
    html += '<tr>';
    for (let i = 0; i < headerCells.length; i++) {
      html += `<td>${md(cells[i] || '')}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function markdownToHtml(source) {
  const lines = source.split('\n');
  const output = [];
  let i = 0;
  let inCodeBlock = false;
  let codeBuffer = [];
  let inList = false;
  let listType = 'ul';

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        const code = codeBuffer.join('\n').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        output.push(`<pre><code>${code}</code></pre>`);
        codeBuffer = [];
        inCodeBlock = false;
        i++;
        continue;
      } else {
        if (inList) { output.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
        inCodeBlock = true;
        i++;
        continue;
      }
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      if (inList) { output.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      if (inList) { output.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      i++;
      continue;
    }

    // Table detection
    if (i + 1 < lines.length && /^\|[\s-:|]+\|$/.test(lines[i + 1]?.trim()) && line.includes('|')) {
      if (inList) { output.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      // Collect table lines
      const tableLines = [line];
      i++;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        tableLines.push(lines[i]);
        i++;
      }
      output.push(parseTable(tableLines));
      continue;
    }

    // Headers
    const h4Match = line.match(/^#### (.+)/);
    if (h4Match) {
      if (inList) { output.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      output.push(`<h4>${md(h4Match[1])}</h4>`);
      i++;
      continue;
    }

    const h3Match = line.match(/^### (.+)/);
    if (h3Match) {
      if (inList) { output.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      const id = h3Match[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
      output.push(`<h3 id="${id}">${md(h3Match[1])}</h3>`);
      i++;
      continue;
    }

    const h2Match = line.match(/^## (.+)/);
    if (h2Match) {
      if (inList) { output.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      const id = h2Match[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
      output.push(`<h2 id="${id}">${md(h2Match[1])}</h2>`);
      i++;
      continue;
    }

    const h1Match = line.match(/^# (.+)/);
    if (h1Match) {
      if (inList) { output.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      // Skip — we render the title in the header
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      if (inList) { output.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      const quoteLines = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      output.push(`<blockquote>${md(quoteLines.join(' '))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line.trimStart())) {
      if (!inList) { output.push('<ul>'); inList = true; listType = 'ul'; }
      output.push(`<li>${md(line.replace(/^[\s]*[-*] /, ''))}</li>`);
      i++;
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line.trimStart())) {
      if (!inList) { output.push('<ol>'); inList = true; listType = 'ol'; }
      output.push(`<li>${md(line.replace(/^[\s]*\d+\.\s/, ''))}</li>`);
      i++;
      continue;
    }

    // Paragraph
    if (inList) { output.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
    output.push(`<p>${md(line)}</p>`);
    i++;
  }

  if (inList) output.push(listType === 'ol' ? '</ol>' : '</ul>');

  return output.join('\n');
}

// ============================================
// Render the Report
// ============================================
async function renderReport() {
  const root = document.getElementById('doc-root');
  root.innerHTML = '<div class="password-gate"><div class="password-card"><p class="subtitle">Loading report…</p></div></div>';

  try {
    const resp = await fetch('/implementation-report.md');
    if (!resp.ok) throw new Error('Failed to load report');
    const markdown = await resp.text();

    // Build sections from the markdown
    const bodyHtml = markdownToHtml(markdown);

    // Extract section headings for TOC
    const tocItems = [];
    const h2Regex = /<h2 id="([^"]+)">(.+?)<\/h2>/g;
    let match;
    while ((match = h2Regex.exec(bodyHtml)) !== null) {
      tocItems.push({ id: match[1], title: match[2].replace(/<[^>]+>/g, '') });
    }

    root.innerHTML = `
      <div class="report-wrapper">
        <header class="report-header">
          <div class="org-badge">Godstone Tabernacle</div>
          <h1>AI Sermon Transcription Project</h1>
          <p class="meta">
            <span>Comprehensive Implementation Report</span>
            <span>·</span>
            <span>March 2026</span>
          </p>
        </header>

        <nav class="toc">
          <h2>Contents</h2>
          <ol>
            ${tocItems.map(t => `<li><a href="#${t.id}">${t.title}</a></li>`).join('')}
          </ol>
        </nav>

        <main class="report-section">
          ${bodyHtml}
        </main>

        <footer class="report-footer">
          Godstone Tabernacle — Sermon Transcription Project · Confidential
        </footer>
      </div>

      <button class="back-to-top" id="btt" title="Back to top">↑</button>
    `;

    // Back-to-top button
    const btt = document.getElementById('btt');
    window.addEventListener('scroll', () => {
      btt.classList.toggle('visible', window.scrollY > 400);
    });
    btt.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Smooth anchor scrolling
    document.querySelectorAll('.toc a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(a.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

  } catch (err) {
    root.innerHTML = `<div class="password-gate"><div class="password-card"><h1>Error</h1><p class="subtitle">${err.message}</p></div></div>`;
  }
}

// ============================================
// Boot
// ============================================
init();
