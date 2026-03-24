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
  case '-s':
    // TODO: implement in next commit
    console.log('go2web: -s not yet implemented');
    break;
  default:
    console.error(`Unknown flag: ${flag}`);
    process.exit(1);
}