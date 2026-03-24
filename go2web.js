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
    // TODO: implement in next commit
    console.log('go2web: help not yet implemented');
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