#!/usr/bin/env node

'use strict';

const net = require('net');
const args = process.argv.slice(2);

function parseUrl(url) {
  const match = url.match(/^http:\/\/([^/:]+)(?::(\d+))?(\/.*)?$/);
  if (!match) throw new Error(`Unsupported URL: ${url}`);
  return {
    host: match[1],
    port: parseInt(match[2] || '80', 10),
    path: match[3] || '/',
  };
}

function rawRequest(host, port, path) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      const request =
        `GET ${path} HTTP/1.1\r\n` +
        `Host: ${host}\r\n` +
        `Connection: close\r\n` +
        `\r\n`;
      socket.write(request);
    });

    let data = '';
    socket.on('data', chunk => { data += chunk.toString(); });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseResponse(raw) {
  const sep = raw.indexOf('\r\n\r\n');
  const headerSection = raw.slice(0, sep);
  const body = raw.slice(sep + 4);
  const lines = headerSection.split('\r\n');
  const statusLine = lines[0];
  const statusCode = parseInt(statusLine.split(' ')[1], 10);
  return { statusCode, statusLine, body };
}

function searchYahoo(term) {
  const query = encodeURIComponent(term);
  const path = `/search?p=${query}`;
  return rawRequest('search.yahoo.com', 80, path).then(raw => {
    const { body } = parseResponse(raw);
    const results = [];
    const linkRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;
    while ((match = linkRe.exec(body)) !== null && results.length < 10) {
      const url = match[1];
      const title = match[2].trim();
      if (url.includes('yahoo.com')) continue;
      if (title.length < 5) continue;
      results.push({ title, url });
    }
    return results;
  });
}

/**
 * Search DuckDuckGo and return top 10 results as [{ title, url }]
 * DuckDuckGo HTML search is available at http://html.duckduckgo.com/html/
 */
function searchDuckDuckGo(term) {
  const query = encodeURIComponent(term);
  const path = `/html/?q=${query}`;
  return rawRequest('html.duckduckgo.com', 80, path).then(raw => {
    const { body } = parseResponse(raw);
    const results = [];
    // DDG wraps results in <a class="result__a" href="...">title</a>
    const linkRe = /<a[^>]+class="result__a"[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;
    while ((match = linkRe.exec(body)) !== null && results.length < 10) {
      const url = match[1];
      const title = match[2].trim();
      if (title.length < 5) continue;
      results.push({ title, url });
    }
    return results;
  });
}

/**
 * Try Yahoo first, fall back to DuckDuckGo if no results
 */
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

Options:
  -h   Show help
  -u   Make a raw HTTP request to the given URL
  -s   Search using Yahoo / DuckDuckGo
    `);
    break;
  case '-u': {
    const url = args[1];
    if (!url) { console.error('Usage: go2web -u <URL>'); process.exit(1); }
    const { host, port, path } = parseUrl(url);
    rawRequest(host, port, path)
      .then(raw => {
        const { statusLine, body } = parseResponse(raw);
        console.log(statusLine);
        console.log(stripHtml(body));
      })
      .catch(err => { console.error(err.message); process.exit(1); });
    break;
  }
  case '-s': {
    const term = args[1];
    if (!term) { console.error('Usage: go2web -s <search-term>'); process.exit(1); }
    search(term)
      .then(results => {
        if (results.length === 0) {
          console.log('No results found.');
          return;
        }
        results.forEach((r, i) => {
          console.log(`${i + 1}. ${r.title}`);
          console.log(`   ${r.url}`);
        });
      })
      .catch(err => { console.error(err.message); process.exit(1); });
    break;
  }
  default:
    console.error(`Unknown flag: ${flag}`);
    process.exit(1);
}