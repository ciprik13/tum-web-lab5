# go2web

A CLI tool that makes raw HTTP/HTTPS requests over TCP sockets — no HTTP libraries used.

Built with Node.js (`net` and `tls` modules only).

<!-- ## Demo

![go2web demo](demo.gif) -->

## Usage

```bash
node go2web.js -h                        # show help
node go2web.js -u <URL>                  # fetch a URL and print human-readable response
node go2web.js -s <search-term>          # search and print top 10 results
node go2web.js -s <search-term> <no>     # fetch the Nth search result
node go2web.js --cache-demo <URL>        # demonstrate in-memory cache
```

## Examples

```bash
# Fetch a real website
node go2web.js -u https://www.w3schools.com/js/js_intro.asp

# Fetch a public JSON API — random cat fact
node go2web.js -u https://catfact.ninja/fact

# Fetch a Chuck Norris joke
node go2web.js -u https://api.chucknorris.io/jokes/random

# Follow redirects automatically
node go2web.js -u http://httpbin.org/redirect/3

# Search something relevant to the lab
node go2web.js -s "HTTP over TCP sockets"

# Open the 2nd search result directly
node go2web.js -s "HTTP over TCP sockets" 2

# Demonstrate in-memory cache
node go2web.js --cache-demo https://catfact.ninja/fact
```

## Features

| Feature | Details |
|---|---|
| Raw TCP sockets | HTTP via `net`, HTTPS via `tls` |
| HTML stripping | Human-readable output, no tags |
| HTTP redirects | Follows 3xx automatically (up to 5 hops) |
| In-memory cache | Repeated requests served from cache |
| Content negotiation | `Accept: application/json, text/html` — JSON pretty-printed, HTML stripped |
| Search | Yahoo (primary) + DuckDuckGo (fallback) |
| Clickable results | `-s <term> <N>` fetches the Nth result |

## Requirements

- Node.js (no npm install needed — zero dependencies)

## Run without `node` prefix

```bash
chmod +x go2web.js
./go2web.js -u https://example.com
```