#!/usr/bin/env python3
"""Starting size of recent Claude sessions: tokens sent with each session's first reply, read from the transcripts.
Usage: start-size.py [days=2] [folder-word=MBP]"""
import glob, json, os, sys, time
days = float(sys.argv[1]) if len(sys.argv) > 1 else 2
word = sys.argv[2] if len(sys.argv) > 2 else "MBP"
rows = []
for f in glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")):
    if time.time() - os.path.getmtime(f) > days * 86400 or not os.path.basename(os.path.dirname(f)).endswith(word):
        continue
    for line in open(f, errors="ignore"):
        if '"usage"' not in line:
            continue
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("type") != "assistant" or e.get("isSidechain"):
            continue
        u = e["message"].get("usage", {})
        size = u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
        rows.append((e.get("timestamp", "")[:16], size, e["message"].get("model", ""), e.get("version", ""), os.path.basename(f)[:8]))
        break
for r in sorted(rows):
    print(*r)
