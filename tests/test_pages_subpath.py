import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from shutil import copy


class PagesSubpathTest(unittest.TestCase):
    def test_rewrites_assets_and_home_in_published_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'scripts').mkdir()
            (root / 'frontend' / 'assets').mkdir(parents=True)
            copy(Path(__file__).resolve().parents[1] / 'scripts' / 'prepare_pages_subpath.py', root / 'scripts')
            homepage = root / 'frontend' / 'index.html'
            homepage.write_text('href="/assets/a"', encoding='utf-8')
            asset = root / 'frontend' / 'assets' / 'app.js'
            asset.write_text('href: "/"; href="/"; url(/assets/a); "/assets/a"', encoding='utf-8')
            script = root / 'scripts' / 'prepare_pages_subpath.py'
            subprocess.run([sys.executable, str(script)], check=True)
            expected = 'href: "/ai-master/"; href="/ai-master/"; url(/ai-master/assets/a); "/ai-master/assets/a"'
            self.assertEqual(asset.read_text(encoding='utf-8'), expected)
            self.assertEqual(homepage.read_text(encoding='utf-8'), 'href="/assets/a"')
            subprocess.run([sys.executable, str(script)], check=True)
            self.assertEqual(asset.read_text(encoding='utf-8'), expected)


if __name__ == '__main__':
    unittest.main()
