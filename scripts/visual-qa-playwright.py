#!/usr/bin/env python3
"""Read-only automated browser QA for every inventoried LeonardX route.

Requires Python Playwright and Chromium. The test does not sign in, submit forms,
change account settings, or write application data. Dynamic route placeholders
are replaced with QA-only slugs. Unauthenticated redirects are recorded rather
than treated as proof that private route content passed.
"""
from __future__ import annotations
import argparse, csv, json, re, sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

VIEWPORTS = {
    "desktop": {"width": 1440, "height": 1000},
    "tablet": {"width": 834, "height": 1112},
    "mobile": {"width": 390, "height": 844},
}
DYNAMIC = {"{id}": "qa-visual-smoke-id", "{slug}": "qa-visual-smoke-project", "{workspaceId}": "qa-visual-smoke-workspace"}

def normalize_route(route: str) -> str:
    for token, value in DYNAMIC.items():
        route = route.replace(token, value)
    return route

def slug(route: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", route.strip("/") or "home")[:120]

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--inventory", default=str(Path(__file__).resolve().parent.parent / "tests" / "visual-qa-routes.csv"))
    parser.add_argument("--output", default="artifacts/visual-qa")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    out = Path(args.output).resolve(); out.mkdir(parents=True, exist_ok=True)
    with open(args.inventory, newline="", encoding="utf-8") as f:
        routes = [normalize_route(row["route"]) for row in csv.DictReader(f)]
    if not routes:
        print("No routes found in inventory", file=sys.stderr); return 2

    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=args.chromium,
                                   args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        for index, route in enumerate(routes, 1):
            context = browser.new_context(viewport=VIEWPORTS["desktop"], device_scale_factor=1)
            context.add_init_script("localStorage.setItem('leonardx-theme','light');")
            page = context.new_page(); page_errors=[]; console_errors=[]
            page.on("pageerror", lambda error: page_errors.append(str(error)[:400]))
            page.on("console", lambda msg: console_errors.append(msg.text[:400]) if msg.type == "error" else None)
            status = None; final_url = ""; title = ""; load_error = ""; overflow = None
            try:
                response = page.goto(base + route, wait_until="domcontentloaded", timeout=16000)
                status = response.status if response else None
                page.wait_for_timeout(180)
                final_url = page.url; title = page.title()
            except PlaywrightTimeoutError as exc:
                load_error = "navigation_timeout: " + str(exc)[:240]; final_url = page.url
            except Exception as exc:
                load_error = f"{type(exc).__name__}: {str(exc)[:240]}"; final_url = page.url

            toggle_available = page.locator("button[aria-label='Switch to dark mode']").count() > 0
            preserved_surface = page.locator("[data-lx-theme-scope='preserve'], .store-shell").count() > 0
            toggle_result = "not-present-preserved-surface" if preserved_surface and not toggle_available else ("not-present-transient-route" if not toggle_available else "not-tested")
            for theme in ("light", "dark"):
                try:
                    if theme == "light":
                        page.evaluate("() => { localStorage.setItem('leonardx-theme', 'light'); document.documentElement.dataset.theme = 'light'; }")
                    elif toggle_available:
                        page.locator("button[aria-label='Switch to dark mode']").click(timeout=2500)
                        page.wait_for_timeout(120)
                        toggle_result = "passed" if page.locator("html[data-theme='dark']").count() else "failed"
                    else:
                        # Preserved Store/developer/workspace routes have no public
                        # theme control; set the root attribute only to prove their
                        # existing styling is not coupled to the public palette.
                        page.evaluate("() => { localStorage.setItem('leonardx-theme', 'dark'); document.documentElement.dataset.theme = 'dark'; }")
                except Exception as exc:
                    load_error = (load_error + " | " if load_error else "") + f"theme_{theme}: {str(exc)[:160]}"
                theme_attr = ""
                try: theme_attr = page.locator("html").get_attribute("data-theme") or ""
                except Exception: pass
                for viewport_name, viewport in VIEWPORTS.items():
                    try:
                        page.set_viewport_size(viewport); page.wait_for_timeout(90)
                        if viewport_name == "desktop":
                            overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
                        shot_dir = out / theme / viewport_name; shot_dir.mkdir(parents=True, exist_ok=True)
                        page.screenshot(path=str(shot_dir / f"{slug(route)}.png"), full_page=False, animations="disabled", timeout=7000)
                    except Exception as exc:
                        load_error = (load_error + " | " if load_error else "") + f"screenshot_{theme}_{viewport_name}: {str(exc)[:160]}"
                final_path = urlparse(final_url).path if final_url else ""
                auth_gated = final_path.startswith("/auth") and not route.startswith("/auth")
                results.append({
                    "route": route, "theme_requested": theme, "html_theme": theme_attr,
                    "theme_toggle_available": toggle_available, "preserved_surface": preserved_surface, "theme_toggle_result": toggle_result,
                    "stored_theme": page.evaluate("() => localStorage.getItem('leonardx-theme')") if page.url.startswith(base) else "unavailable",
                    "status_code": status, "final_url": final_url,
                    "result": "auth-gated" if auth_gated else ("load-error" if load_error else ("http-error" if status and status >= 400 else "loaded")),
                    "title": title, "desktop_horizontal_overflow": overflow,
                    "page_errors": " | ".join(page_errors), "console_errors": " | ".join(console_errors[:8]), "error": load_error,
                })
            context.close(); print(f"[{index}/{len(routes)}] {route}", flush=True)
        browser.close()

    csv_path = out / "route-results.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(results[0].keys())); writer.writeheader(); writer.writerows(results)
    summary = {
        "base_url": base, "routes_in_inventory": len(routes), "route_theme_runs": len(results),
        "screenshots_expected": len(routes) * 2 * len(VIEWPORTS),
        "screenshots_created": len(list(out.glob("**/*.png"))),
        "result_counts": {key: sum(1 for r in results if r["result"] == key) for key in sorted({r["result"] for r in results})},
        "page_error_runs": sum(bool(r["page_errors"]) for r in results),
        "console_error_runs": sum(bool(r["console_errors"]) for r in results),
        "desktop_horizontal_overflow_runs": sum(r["desktop_horizontal_overflow"] is True for r in results),
        "note": "Unauthenticated route run. Auth-gated pages are verified only through their sign-in redirect; private content needs an authorized test account. Screenshots are viewport captures, not full-page captures.",
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2)); return 0

if __name__ == "__main__": raise SystemExit(main())
