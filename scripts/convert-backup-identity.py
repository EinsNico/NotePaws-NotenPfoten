#!/usr/bin/env python3
"""Copy a confirmed older app backup into the current backup envelope.

Only format and app.name are changed. The app validates all learning data when
the converted copy is imported. Never use this tool on another app's data.
"""

import argparse
import json
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--confirm-own-backup", action="store_true", required=True,
                        help="Confirm this is your backup from an earlier release of this app.")
    args = parser.parse_args()
    if args.source.resolve() == args.destination.resolve():
        parser.error("Choose a separate destination; the original must be preserved.")
    with args.source.open(encoding="utf-8-sig") as stream:
        document = json.load(stream)
    if not isinstance(document, dict):
        parser.error("The source must be a JSON backup object.")
    version = document.get("version")
    app = document.get("app")
    if (type(version) is not int or not 1 <= version <= 6
            or not isinstance(document.get("format"), str)
            or not document["format"].endswith("-save-data")
            or not isinstance(app, dict)
            or not isinstance(app.get("name"), str)
            or not isinstance(app.get("version"), str)
            or not isinstance(document.get("createdAt"), str)
            or not isinstance(document.get("data"), dict)
            or not isinstance(document["data"].get("statistics"), dict)):
        parser.error("Unsupported backup envelope; no converted file was written.")
    document["format"] = "noten-pfoten-save-data"
    document["app"]["name"] = "Noten Pfoten"
    # Exclusive creation also prevents overwriting an existing converted backup.
    descriptor = os.open(args.destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(document, stream, ensure_ascii=False, separators=(",", ":"))
        stream.write("\n")
    print("Converted copy created. Import it in the new app for full validation.")


if __name__ == "__main__":
    main()
