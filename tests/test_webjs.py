"""Syntax and contract checks for the deployed Cape modules."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
CAPE = ROOT / "cape"


class WebJs(unittest.TestCase):
    def run_node(self, *args):
        node = shutil.which("node")
        self.assertIsNotNone(node, "Cape checks require Node.js")
        result = subprocess.run([node, *args], cwd=CAPE, capture_output=True,
                                encoding="utf-8", timeout=45)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_module_syntax(self):
        for source in (*sorted(CAPE.glob("*.js")), *sorted(CAPE.glob("*.mjs")),
                       ROOT / "web" / "pin.js", ROOT / "web" / "album-sw.js"):
            with self.subTest(source=source.name):
                self.run_node("--check", str(source))

    def test_cape_contract(self):
        self.run_node("--test", "tests/integration.test.mjs")


if __name__ == "__main__":
    unittest.main()
