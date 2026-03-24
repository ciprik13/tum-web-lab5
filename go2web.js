#!/usr/bin/env node

'use strict';

const net = require('net');
const tls = require('tls');
const args = process.argv.slice(2);

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function parseUrl(url) {
  const match = url.match(/^(https?):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/);
  if (!match) throw new Error(`Unsupported URL: ${url}`);
  const scheme = match[1];
  const isHttps = scheme === 'https';
  return {
    scheme,
    host: match[2],
    port: parseInt(match[3] || (isHttps ? '443' : '80'), 10),
    path: match[4] || '/',
    isHttps,
  };
}

function rawRequest(host, port, path, isHttps) {
  return new Promise((resolve, reject) => {
    const requestStr =
      `GET ${path} HTTP/1.1\r\n` +
      `Host: ${host}\r\n` +
      `User-Agent: ${USER_AGENT}\r\n` +
      `Accept: application/json, text/html;q=0.9, */*;q=0.8\r\n` +
      `Accept-Encoding: identity\r\n` +
      `Connection: close\r\n` +
      `\r\n`;

    let socket;
    if (isHttps) {
      socket = tls.connect({ host, port, servername: host }, () => {
        socket.write(requestStr);
      });
    } else {
      socket = net.createConnection({ host, port }, () => {
        socket.write(requestStr);
      });
    }

    const chunks = [];
    socket.on('data', chunk => { chunks.push(chunk); });
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('binary')));
    socket.on('error', reject);
  });
}

function stripHtml(html) {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[/](p|div|h[1-6]|li|tr|br|section|article|header|footer)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeChunked(body) {
  const buf = Buffer.from(body, 'binary');
  const result = [];
  let offset = 0;
  while (offset < buf.length) {
    let lineEnd = -1;
    for (let i = offset; i < buf.length - 1; i++) {
      if (buf[i] === 0x0d && buf[i + 1] === 0x0a) { lineEnd = i; break; }
    }
    if (lineEnd === -1) break;
    const sizeLine = buf.slice(offset, lineEnd).toString('ascii').trim();
    const size = parseInt(sizeLine, 16);
    if (isNaN(size) || size === 0) break;
    const chunkStart = lineEnd + 2;
    result.push(buf.slice(chunkStart, chunkStart + size).toString('utf8'));
    offset = chunkStart + size + 2;
  }
  return result.join('');
}

function parseResponse(raw) {
  const sep = raw.indexOf('\r\n\r\n');
  const headerSection = raw.slice(0, sep);
  const body = raw.slice(sep + 4);
  // Convert body from binary string to utf8
  const utf8Body = Buffer.from(body, 'binary').toString('utf8');
  const lines = headerSection.split('\r\n');
  const statusLine = lines[0];
  const statusCode = parseInt(statusLine.split(' ')[1], 10);

  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i].indexOf(':');
    if (idx === -1) continue;
    const key = lines[i].slice(0, idx).trim().toLowerCase();
    const val = lines[i].slice(idx + 1).trim();
    headers[key] = val;
  }

  const isChunked = (headers['transfer-encoding'] || '').toLowerCase().includes('chunked');
  const decodedBody = isChunked ? decodeChunked(body) : utf8Body;
  return { statusCode, statusLine, headers, body: decodedBody };
}

function formatBody(body, headers) {
  const contentType = (headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return stripHtml(body);
}

function fetchWithRedirects(url, maxRedirects = 5) {
  if (maxRedirects === 0) return Promise.reject(new Error('Too many redirects'));

  const { host, port, path, isHttps } = parseUrl(url);
  return rawRequest(host, port, path, isHttps).then(raw => {
    const { statusCode, statusLine, headers, body } = parseResponse(raw);

    if (statusCode >= 300 && statusCode < 400 && headers['location']) {
      const location = headers['location'];
      console.error(`→ Redirect ${statusCode}: ${location}`);
      const nextUrl = location.startsWith('http')
        ? location
        : `${isHttps ? 'https' : 'http'}://${host}${location}`;
      return fetchWithRedirects(nextUrl, maxRedirects - 1);
    }

    return { statusLine, headers, body };
  });
}


// In-memory cache: url -> { statusLine, headers, body }
const cache = new Map();

function fetchCached(url) {
  if (cache.has(url)) {
    console.error(`[cache] HIT: ${url}`);
    return Promise.resolve(cache.get(url));
  }
  return fetchWithRedirects(url).then(result => {
    cache.set(url, result);
    return result;
  });
}

function searchYahoo(term) {
  const query = encodeURIComponent(term);
  const path = `/search?p=${query}&ei=UTF-8&nojs=1`;
  return rawRequest('search.yahoo.com', 443, path, true).then(raw => {
    const { body } = parseResponse(raw);
    const results = [];
    const seen = new Set();
    // Extract real URL from Yahoo's RU= redirect parameter
    const linkRe = /href="([^"]*RU=([^/]+)[^"]*)"/gi;
    const titleRe = /<a[^>]+class="[^"]*ac-algo[^"]*"[^>]*>(.*?)<\/a>/gi;
    let m;
    while ((m = titleRe.exec(body)) !== null && results.length < 10) {
      const title = stripHtml(m[1]).trim();
      if (!title || title.length < 5) continue;
      // Find corresponding URL
      const urlMatch = /RU=([^/&]+)/.exec(m[0]) || /href="(https?:\/\/[^"]+)"/.exec(m[0]);
      if (!urlMatch) continue;
      let url = decodeURIComponent(urlMatch[1]);
      if (!url.startsWith('http') || url.includes('yahoo.com')) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({ title, url });
    }
    return results;
  });
}

function searchDuckDuckGo(term) {
  const query = encodeURIComponent(term);
  const path = `/html/?q=${query}`;
  return rawRequest('html.duckduckgo.com', 443, path, true).then(raw => {
    const { body } = parseResponse(raw);
    const results = [];
    const seen = new Set();
    const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRe.exec(body)) !== null && results.length < 10) {
      let url = match[1];
      const title = stripHtml(match[2]).trim();
      // Decode DDG redirect URLs
      if (url.includes('duckduckgo.com/l/')) {
        const uddg = url.match(/uddg=([^&]+)/);
        if (uddg) url = decodeURIComponent(uddg[1]);
      }
      if (!url.startsWith('http') || seen.has(url)) continue;
      if (title.length < 5) continue;
      seen.add(url);
      results.push({ title, url });
    }
    return results;
  });
}

function search(term) {
  return searchYahoo(term).then(results => {
    if (results.length > 0) return results;
    console.error('Yahoo returned no results, trying DuckDuckGo...');
    return searchDuckDuckGo(term);
  }).catch(() => {
    console.error('Yahoo failed, trying DuckDuckGo...');
    return searchDuckDuckGo(term);
  });
}

if (args.length === 0) {
  console.error('Usage: go2web -h | -u <URL> | -s <search-term>');
  process.exit(1);
}

const flag = args[0];

switch (flag) {
  case '-h':
    console.log(`
go2web - A simple HTTP CLI tool using raw TCP sockets

Usage:
  go2web -h                       Print this help message
  go2web -u <URL>                 Fetch a URL and print human-readable response
  go2web -s <search-term>         Search and print top 10 results
  go2web -s <search-term> <no>    Fetch the Nth search result
  go2web --cache-demo <URL>       Fetch URL twice to demonstrate in-memory cache

Options:
  -h   Show help
  -u   Make a raw HTTP request to the given URL
  -s   Search using Yahoo / DuckDuckGo
    `);
    break;
  case '-u': {
    const url = args[1];
    if (!url) { console.error('Usage: go2web -u <URL>'); process.exit(1); }
    fetchCached(url)
      .then(({ statusLine, headers, body }) => {
        console.log(statusLine);
        console.log(formatBody(body, headers));
      })
      .catch(err => { console.error(err.message); process.exit(1); });
    break;
  }
  case '-s': {
    const term = args[1];
    if (!term) { console.error('Usage: go2web -s <search-term> [number]'); process.exit(1); }
    const pickNum = args[2] ? parseInt(args[2], 10) : null;
    search(term)
      .then(results => {
        if (results.length === 0) {
          console.log('No results found.');
          return;
        }
        if (pickNum !== null) {
          if (pickNum < 1 || pickNum > results.length) {
            console.error(`Pick a number between 1 and ${results.length}`);
            process.exit(1);
          }
          const picked = results[pickNum - 1];
          console.log(`Fetching result ${pickNum}: ${picked.url}\n`);
          return fetchCached(picked.url).then(({ statusLine, headers, body }) => {
            console.log(statusLine);
            console.log(formatBody(body, headers));
          });
        }
        results.forEach((r, i) => {
          console.log(`${i + 1}. ${r.title}`);
          console.log(`   ${r.url}`);
        });
      })
      .catch(err => { console.error(err.message); process.exit(1); });
    break;
  }
  case '--cache-demo': {
    const url = args[1];
    if (!url) { console.error('Usage: go2web --cache-demo <URL>'); process.exit(1); }
    console.log('--- First fetch ---');
    fetchCached(url)
      .then(({ statusLine }) => {
        console.log(statusLine);
        console.log('--- Second fetch (should hit cache) ---');
        return fetchCached(url);
      })
      .then(({ statusLine }) => {
        console.log(statusLine);
      })
      .catch(err => { console.error(err.message); process.exit(1); });
    break;
  }
  default:
    console.error(`Unknown flag: ${flag}`);
    process.exit(1);
}