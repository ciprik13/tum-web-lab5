#!/usr/bin/env node

'use strict';

const args = process.argv.slice(2);

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
  case '-u':
    // TODO: implement in next commit
    console.log('go2web: -u not yet implemented');
    break;
  case '-s':
    // TODO: implement in next commit
    console.log('go2web: -s not yet implemented');
    break;
  default:
    console.error(`Unknown flag: ${flag}`);
    process.exit(1);
}