#!/usr/bin/env python3
"""
Generate images from markdown prompt markers using fal.ai's Nano Banana 2 model.

Prerequisites:
    pip install fal-client requests python-dotenv
    Add your FAL_KEY to the .env file in this directory

Usage:
    python generate_images.py [directory]

    If no directory is specified, uses the script's directory.
"""

import os
import re
import sys
import time
import requests
import fal_client
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the script's directory
load_dotenv(Path(__file__).parent / ".env")


def extract_prompts_from_markdown(filepath: Path) -> list[dict]:
    """
    Extract image prompts from markdown files.

    Looks for blocks like:
        [//]: # (IMAGE_PROMPT_START)
        [//]: # (NANO_BANANA_2: "prompt text here")
        [//]: # (IMAGE_PROMPT_END)
        ![Alt text](./images/placeholder.png)
    """
    text = filepath.read_text(encoding="utf-8")
    lines = text.split("\n")

    prompts = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line == "[//]: # (IMAGE_PROMPT_START)":
            block_start = i
            if i + 1 < len(lines):
                prompt_match = re.search(
                    r'\[//\]: # \(NANO_BANANA_2: "(.+)"\)',
                    lines[i + 1],
                )
                if prompt_match:
                    prompt_text = prompt_match.group(1)

                    # Skip template/example prompts
                    if prompt_text.strip().lower() == "prompt here":
                        i += 1
                        continue

                    # Find IMAGE_PROMPT_END
                    block_end = None
                    for j in range(i + 2, min(i + 5, len(lines))):
                        if lines[j].strip() == "[//]: # (IMAGE_PROMPT_END)":
                            block_end = j
                            break

                    # Find the placeholder image line
                    placeholder_line = None
                    alt_text = ""
                    if block_end is not None and block_end + 1 < len(lines):
                        img_match = re.match(
                            r"!\[([^\]]*)\]\(\./images/placeholder\.png\)",
                            lines[block_end + 1].strip(),
                        )
                        if img_match:
                            placeholder_line = block_end + 1
                            alt_text = img_match.group(1)

                    prompts.append(
                        {
                            "prompt": prompt_text,
                            "alt_text": alt_text,
                            "block_start": block_start,
                            "block_end": block_end,
                            "placeholder_line": placeholder_line,
                        }
                    )
        i += 1

    return prompts


def generate_image(
    prompt: str,
    output_format: str = "png",
    aspect_ratio: str = "4:3",
    resolution: str = "1K",
) -> dict:
    """Call fal.ai Nano Banana 2 to generate an image from a text prompt."""
    result = fal_client.subscribe(
        "fal-ai/nano-banana-2",
        arguments={
            "prompt": prompt,
            "num_images": 1,
            "aspect_ratio": aspect_ratio,
            "output_format": output_format,
            "resolution": resolution,
        },
        with_logs=True,
        on_queue_update=lambda update: (
            print(f"    Queue: {update.status}")
            if hasattr(update, "status")
            else None
        ),
    )
    return result


def download_image(url: str, save_path: Path) -> None:
    """Download an image from a URL and save it to disk."""
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    save_path.write_bytes(response.content)
    print(f"  Saved: {save_path.name}")


def update_markdown_placeholder(
    filepath: Path, line_number: int, alt_text: str, new_filename: str
) -> None:
    """Replace the placeholder image reference with the actual filename."""
    text = filepath.read_text(encoding="utf-8")
    lines = text.split("\n")
    lines[line_number] = f"![{alt_text}](./images/{new_filename})"
    filepath.write_text("\n".join(lines), encoding="utf-8")
    print(f"  Updated: {filepath.name} line {line_number + 1} -> {new_filename}")


def main():
    # Determine directory
    if len(sys.argv) > 1:
        base_dir = Path(sys.argv[1]).resolve()
    else:
        base_dir = Path(__file__).parent.resolve()

    images_dir = base_dir / "images"
    images_dir.mkdir(exist_ok=True)

    # Check for API key
    if not os.environ.get("FAL_KEY"):
        print("=" * 60)
        print("ERROR: FAL_KEY environment variable is not set.")
        print()
        print("To get your API key:")
        print("  1. Sign up at https://fal.ai")
        print("  2. Go to https://fal.ai/dashboard/keys")
        print("  3. Create a new key")
        print()
        print("Then run:")
        print('  export FAL_KEY="your-key-here"  (Mac/Linux)')
        print('  set FAL_KEY=your-key-here        (Windows CMD)')
        print("  $env:FAL_KEY='your-key-here'     (PowerShell)")
        print("=" * 60)
        sys.exit(1)

    # Find all markdown files (skip Project Bible which has template prompts)
    md_files = sorted(base_dir.glob("*.md"))
    if not md_files:
        print(f"No markdown files found in {base_dir}")
        sys.exit(1)

    print(f"Scanning {len(md_files)} markdown files in {base_dir}\n")

    # Collect all prompts
    all_tasks = []
    for md_file in md_files:
        prompts = extract_prompts_from_markdown(md_file)
        for p in prompts:
            all_tasks.append((md_file, p))

    if not all_tasks:
        print("No image prompts found.")
        sys.exit(0)

    print(f"Found {len(all_tasks)} image prompts to generate.\n")
    print("-" * 60)

    # Track results
    success = 0
    failed = 0

    for idx, (md_file, prompt_info) in enumerate(all_tasks, start=1):
        filename = f"image_{idx:03d}.png"
        save_path = images_dir / filename

        print(f"\n[{idx}/{len(all_tasks)}] {md_file.name}")
        print(f"  Prompt: {prompt_info['prompt'][:90]}...")

        # Skip if already generated
        if save_path.exists():
            print(f"  Skipping (already exists): {filename}")
            success += 1
        else:
            try:
                result = generate_image(prompt_info["prompt"])
                image_url = result["images"][0]["url"]
                download_image(image_url, save_path)
                success += 1
            except Exception as e:
                print(f"  ERROR: {e}")
                failed += 1
                continue

        # Update markdown placeholder
        if prompt_info["placeholder_line"] is not None:
            try:
                update_markdown_placeholder(
                    md_file,
                    prompt_info["placeholder_line"],
                    prompt_info["alt_text"],
                    filename,
                )
            except Exception as e:
                print(f"  ERROR updating markdown: {e}")

        # Rate limit courtesy
        if idx < len(all_tasks):
            time.sleep(1)

    # Summary
    print("\n" + "=" * 60)
    print(f"DONE! {success} generated, {failed} failed.")
    print(f"Images saved to: {images_dir}")
    print("=" * 60)


if __name__ == "__main__":
    main()
