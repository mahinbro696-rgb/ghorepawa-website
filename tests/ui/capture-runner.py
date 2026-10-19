"""Capture settled screenshots without changing application code or test assertions."""
import runpy
import sys
from playwright.sync_api import Page

allowed = {'tests/ui/portal-browser.py', 'tests/ui/workflow-browser.py'}
if len(sys.argv) != 2 or sys.argv[1] not in allowed:
    raise SystemExit('Specify an approved portal browser test script.')
original = Page.screenshot

def settled_screenshot(self, *args, **kwargs):
    kwargs.setdefault('animations', 'disabled')
    return original(self, *args, **kwargs)

Page.screenshot = settled_screenshot
runpy.run_path(sys.argv[1], run_name='__main__')
