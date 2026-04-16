#!/usr/bin/env python3
"""
Baixa uma lista de músicas (um "Artista — Título" por linha) via yt-dlp,
com snake_case no nome, capa embebida e metadata ID3 corretos.

Uso:
    python download-batch.py <lista.txt> <subpasta-destino>

Exemplo:
    python download-batch.py kpop-top100.txt kpop

Saída:
    scripts/radio/downloads/<subpasta>/Artista_-_Titulo.mp3
    scripts/radio/downloads/<subpasta>/_report.txt
"""

import argparse
import concurrent.futures
import os
import re
import subprocess
import sys
import unicodedata
from pathlib import Path


def snake_case(s: str) -> str:
    """Converte 'New Jeans' em 'New_Jeans', remove caracteres problemáticos."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^\w\s\-]", "", s)  # remove ' " ? ! etc.
    s = re.sub(r"\s+", "_", s.strip())
    return s


def parse_line(line: str):
    """'NewJeans — Super Shy' → ('NewJeans', 'Super Shy')."""
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    # aceita em—dash, en–dash ou hífen com espaços ao redor
    for sep in ("—", "–", " - "):
        if sep in line:
            parts = line.split(sep, 1)
            return parts[0].strip(), parts[1].strip()
    return None


def download(artist: str, title: str, out_dir: Path):
    """Baixa uma música. Retorna (status, filename, reason)."""
    safe_artist = snake_case(artist)
    safe_title = snake_case(title)
    filename = f"{safe_artist}_-_{safe_title}.mp3"
    out_path = out_dir / filename

    if out_path.exists():
        return ("skip", filename, "já existe")

    query = f"ytsearch1:{artist} {title} official"
    cmd = [
        "yt-dlp",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--embed-thumbnail",
        "--add-metadata",
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        "-o", str(out_path.with_suffix(".%(ext)s")),
        query,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            return ("fail", filename, result.stderr.strip().splitlines()[-1] if result.stderr else "unknown")
        if not out_path.exists():
            return ("fail", filename, "arquivo não apareceu")
        # sobrescrever metadata com artista/título limpos (ffmpeg em 2 passos,
        # seguro contra espaços e caracteres especiais)
        tmp_path = out_path.with_suffix(".tagged.mp3")
        tag_cmd = [
            "ffmpeg", "-y", "-v", "error",
            "-i", str(out_path),
            "-c", "copy",
            "-metadata", f"artist={artist}",
            "-metadata", f"title={title}",
            "-metadata", "genre=K-Pop",
            "-id3v2_version", "3",
            str(tmp_path),
        ]
        tag_result = subprocess.run(tag_cmd, capture_output=True, text=True, timeout=60)
        if tag_result.returncode == 0 and tmp_path.exists():
            tmp_path.replace(out_path)
        # validar integridade
        check = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(out_path), "-f", "null", "-"],
            capture_output=True, text=True, timeout=60,
        )
        if check.returncode != 0 or check.stderr.strip():
            out_path.unlink(missing_ok=True)
            return ("fail", filename, f"corrompido: {check.stderr.strip()[:100]}")
        size_mb = out_path.stat().st_size / 1024 / 1024
        return ("ok", filename, f"{size_mb:.1f} MB")
    except subprocess.TimeoutExpired:
        return ("fail", filename, "timeout (5 min)")
    except Exception as e:
        return ("fail", filename, str(e))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("list_file", type=Path)
    ap.add_argument("subdir", help="subpasta de destino (ex.: kpop)")
    ap.add_argument("--workers", type=int, default=4, help="downloads em paralelo")
    ap.add_argument("--limit", type=int, default=None, help="testar com N primeiros")
    args = ap.parse_args()

    if not args.list_file.exists():
        print(f"Lista não encontrada: {args.list_file}", file=sys.stderr)
        sys.exit(1)

    script_dir = Path(__file__).parent
    out_dir = script_dir / "downloads" / args.subdir
    out_dir.mkdir(parents=True, exist_ok=True)

    entries = []
    for raw in args.list_file.read_text(encoding="utf-8").splitlines():
        parsed = parse_line(raw)
        if parsed:
            entries.append(parsed)

    if args.limit:
        entries = entries[: args.limit]

    print(f"Lista: {len(entries)} músicas | destino: {out_dir} | workers: {args.workers}")
    print()

    results = {"ok": [], "skip": [], "fail": []}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(download, a, t, out_dir): (a, t) for a, t in entries}
        for i, fut in enumerate(concurrent.futures.as_completed(futures), 1):
            a, t = futures[fut]
            status, fn, info = fut.result()
            icon = {"ok": "+", "skip": "=", "fail": "x"}[status]
            print(f"[{i:3}/{len(entries)}] {icon} {a} — {t} :: {info}")
            results[status].append((a, t, fn, info))

    # relatório
    report = out_dir / "_report.txt"
    with report.open("w", encoding="utf-8") as f:
        f.write(f"Total: {len(entries)}\n")
        f.write(f"OK: {len(results['ok'])} | Skip: {len(results['skip'])} | Fail: {len(results['fail'])}\n\n")
        for status in ("fail", "skip", "ok"):
            if results[status]:
                f.write(f"=== {status.upper()} ({len(results[status])}) ===\n")
                for a, t, fn, info in results[status]:
                    f.write(f"  {a} — {t} :: {info}\n")
                f.write("\n")

    print()
    print(f"OK: {len(results['ok'])} | Skip: {len(results['skip'])} | Fail: {len(results['fail'])}")
    print(f"Relatório: {report}")

    sys.exit(0 if not results["fail"] else 2)


if __name__ == "__main__":
    main()
