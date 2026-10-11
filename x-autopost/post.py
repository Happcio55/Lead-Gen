#!/usr/bin/env python3
"""Post the next queued item from queue.json to X (Twitter).

Usage:
  python x-autopost/post.py validate    # check every queued post fits in 280 chars
  python x-autopost/post.py next        # post the next queued item
  python x-autopost/post.py next --dry-run

Credentials (OAuth 1.0a user context, from developer.x.com) are read from env:
  X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
"""

import base64
import datetime
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

QUEUE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "queue.json")
TWEET_URL = "https://api.twitter.com/2/tweets"
MAX_WEIGHT = 280
URL_RE = re.compile(r"https?://\S+|\b[\w-]+\.(?:com|io|xyz|fi|co)(?:/\S*)?", re.I)

# X counts these code point ranges as 1, everything else (incl. emoji) as 2.
LIGHT_RANGES = [(0, 4351), (8192, 8205), (8208, 8223), (8242, 8247)]


def weighted_length(text):
    """Approximate X's weighted character count (URLs count as 23)."""
    length = 0
    for url in URL_RE.findall(text):
        length += 23
    text = URL_RE.sub("", text)
    for ch in text:
        cp = ord(ch)
        length += 1 if any(lo <= cp <= hi for lo, hi in LIGHT_RANGES) else 2
    return length


def load_queue():
    with open(QUEUE_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_queue(queue):
    with open(QUEUE_PATH, "w", encoding="utf-8") as f:
        json.dump(queue, f, ensure_ascii=False, indent=2)
        f.write("\n")


def pct(value):
    return urllib.parse.quote(str(value), safe="~")


def oauth_header(method, url, key, secret, token, token_secret):
    params = {
        "oauth_consumer_key": key,
        "oauth_nonce": secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_token": token,
        "oauth_version": "1.0",
    }
    # JSON bodies are not part of the OAuth 1.0a signature base string.
    param_str = "&".join(f"{pct(k)}={pct(v)}" for k, v in sorted(params.items()))
    base = "&".join([method.upper(), pct(url), pct(param_str)])
    signing_key = f"{pct(secret)}&{pct(token_secret)}"
    digest = hmac.new(signing_key.encode(), base.encode(), hashlib.sha1).digest()
    params["oauth_signature"] = base64.b64encode(digest).decode()
    return "OAuth " + ", ".join(f'{pct(k)}="{pct(v)}"' for k, v in sorted(params.items()))


def create_tweet(text):
    creds = [os.environ.get(name) for name in
             ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET")]
    if not all(creds):
        sys.exit("Missing X API credentials in environment (see x-autopost/README.md).")
    body = json.dumps({"text": text}).encode()
    req = urllib.request.Request(TWEET_URL, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", oauth_header("POST", TWEET_URL, *creds))
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)["data"]["id"]
    except urllib.error.HTTPError as e:
        sys.exit(f"X API error {e.code}: {e.read().decode(errors='replace')}")


def validate(queue):
    ok = True
    ids = set()
    for item in queue:
        if item["id"] in ids:
            print(f"DUPLICATE id {item['id']}")
            ok = False
        ids.add(item["id"])
        n = weighted_length(item["text"])
        flag = "OK " if n <= MAX_WEIGHT else "TOO LONG"
        if n > MAX_WEIGHT:
            ok = False
        print(f"{flag} {item['id']} {item['status']:<7} {n:>3}/280")
    queued = sum(1 for i in queue if i["status"] == "queued")
    print(f"\n{queued} queued, {len(queue) - queued} posted/other")
    return ok


def post_next(queue, dry_run):
    item = next((i for i in queue if i["status"] == "queued"), None)
    if item is None:
        print("Queue is empty: nothing to post. Add more items to queue.json.")
        return
    if weighted_length(item["text"]) > MAX_WEIGHT:
        sys.exit(f"{item['id']} is longer than 280 characters; fix it before posting.")
    print(f"--- {item['id']} ---\n{item['text']}\n---")
    if dry_run:
        print("Dry run: not posted.")
        return
    tweet_id = create_tweet(item["text"])
    item["status"] = "posted"
    item["tweet_id"] = tweet_id
    item["posted_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    save_queue(queue)
    print(f"Posted: https://x.com/i/status/{tweet_id}")


def main():
    args = sys.argv[1:]
    queue = load_queue()
    if not args or args[0] == "validate":
        sys.exit(0 if validate(queue) else 1)
    if args[0] == "next":
        post_next(queue, dry_run="--dry-run" in args)
        return
    sys.exit(__doc__)


if __name__ == "__main__":
    main()
