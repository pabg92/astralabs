#!/usr/bin/env python3
"""
Export legal_clause_library to CSV.

Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python scripts/export-lcl-to-csv.py [output_csv]

Defaults to ./lcl-export.csv if no path provided.
"""

import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def main():
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env", file=sys.stderr)
        sys.exit(1)

    out_path = sys.argv[1] if len(sys.argv) > 1 else "lcl-export.csv"

    # Build REST endpoint
    endpoint = urllib.parse.urljoin(supabase_url, "/rest/v1/legal_clause_library")
    params = {
        "select": "clause_id,clause_type,category,standard_text,plain_english_summary,risk_level,is_required,version,tags,metadata,active,created_at,updated_at",
        "limit": 2000,
    }
    url = endpoint + "?" + urllib.parse.urlencode(params)

    req = urllib.request.Request(
        url,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
            "Range-Unit": "items",
            "Range": "0-1999",
        },
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        print(f"HTTP error {e.code}: {e.read().decode('utf-8', errors='ignore')}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        rows = json.loads(data)
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON: {e}", file=sys.stderr)
        sys.exit(1)

    if not rows:
        print("No rows returned.", file=sys.stderr)
        sys.exit(1)

    fieldnames = list(rows[0].keys())
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"✅ Exported {len(rows)} clauses to {out_path}")


if __name__ == "__main__":
    main()
