"""Real browser regression checks for the learning route edge drawer."""
import unittest
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8789"


class RouteDrawerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = sync_playwright().start()
        cls.browser = cls.runtime.chromium.launch(channel="chrome", headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.runtime.stop()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 900})
        self.page = self.context.new_page()

    def tearDown(self):
        self.context.close()

    def load(self, route="/knowledge/3-2/"):
        self.page.goto(BASE + route)
        self.page.wait_for_selector(".route-panel, .path-level-column")
        self.assertEqual(self.page.locator(".route-edge-trigger").count(), 1,
                         "A collapsed route must keep a discoverable edge trigger")

    def expanded(self):
        return self.page.locator(".route-edge-trigger").get_attribute("aria-expanded") == "true"

    def open(self):
        self.page.locator(".route-edge-trigger").hover()
        self.page.wait_for_timeout(340)
        self.assertTrue(self.expanded())

    def test_default_collapse_hover_delay_reentry_and_stable_content(self):
        self.load()
        self.assertFalse(self.expanded())
        rect = self.page.locator(".route-panel").bounding_box()
        self.assertAlmostEqual(rect["x"] + rect["width"], 20, delta=1)
        self.assertEqual(self.page.locator(".route-edge-number").inner_text(), "03")
        before = self.page.locator(".lesson-main").bounding_box()
        self.open()
        after = self.page.locator(".lesson-main").bounding_box()
        self.assertEqual((before["x"], before["width"]), (after["x"], after["width"]))
        self.page.mouse.move(900, 400)
        self.page.wait_for_timeout(160)
        self.assertTrue(self.expanded(), "Small pointer excursions must not close the drawer")
        self.page.mouse.move(150, 400)
        self.page.wait_for_timeout(500)
        self.assertTrue(self.expanded(), "Reentry must cancel the pending close")
        self.page.mouse.move(900, 400)
        self.page.wait_for_timeout(760)
        self.assertFalse(self.expanded())

    def test_tree_scroll_current_node_and_pin_survive_drawer_changes(self):
        self.load()
        self.open()
        tree = self.page.locator("[data-route-accordion-trigger]")
        tree.nth(3).click()
        state = tree.evaluate_all("els => els.map(el => el.getAttribute('aria-expanded'))")
        self.assertEqual(state.count("true"), 1)
        self.page.locator(".route-body").evaluate("el => el.scrollTop = 120")
        scroll = self.page.locator(".route-body").evaluate("el => el.scrollTop")
        self.assertGreater(scroll, 0)
        self.page.mouse.move(900, 400)
        self.page.wait_for_timeout(760)
        self.assertFalse(self.expanded(), "A pointer click must not pin keyboard focus")
        self.open()
        self.assertEqual(tree.evaluate_all("els => els.map(el => el.getAttribute('aria-expanded'))"), state)
        self.assertEqual(self.page.locator(".route-body").evaluate("el => el.scrollTop"), scroll)
        self.assertEqual(self.page.locator('.route-panel .route-point.is-current').count(), 1)
        self.page.locator(".route-pin").click()
        self.assertEqual(self.page.locator(".route-pin").get_attribute("aria-pressed"), "true")
        self.page.mouse.move(900, 400)
        self.page.wait_for_timeout(760)
        self.assertTrue(self.expanded())
        self.page.goto(BASE + "/knowledge/2-1/")
        self.page.wait_for_selector(".route-pin")
        self.assertTrue(self.expanded(), "Pin should survive lesson navigation in this session")
        self.page.locator(".route-pin").click()
        self.page.mouse.move(900, 400)
        self.page.wait_for_timeout(760)
        self.assertFalse(self.expanded())

    def test_keyboard_focus_escape_and_reduced_motion(self):
        self.page.emulate_media(reduced_motion="reduce")
        self.load("/knowledge/1-1/")
        self.assertTrue(self.page.locator(".route-drawer-content").evaluate("el => el.inert"))
        self.page.locator(".route-edge-trigger").focus()
        self.assertTrue(self.expanded())
        self.page.keyboard.press("Tab")
        self.page.wait_for_timeout(500)
        self.assertTrue(self.expanded(), "Keyboard navigation inside the drawer must keep it open")
        self.page.keyboard.press("Escape")
        self.assertFalse(self.expanded())
        self.assertTrue(self.page.locator(".route-edge-trigger").evaluate("el => el === document.activeElement"))
        self.assertEqual(self.page.locator(".route-panel").evaluate("el => getComputedStyle(el).transitionDuration"), "0s")

    def test_all_page_types_and_path_stage_selection(self):
        for route in ["/knowledge/1-1/", "/knowledge/1-2/", "/knowledge/2-1/", "/knowledge/2-2/",
                      "/knowledge/3-1/", "/knowledge/4-1/", "/knowledge/5-1/", "/knowledge/6-1/"]:
            with self.subTest(route=route):
                self.load(route)
                self.assertFalse(self.expanded())
                self.open()
                self.assertEqual(self.page.locator("[data-route-accordion-trigger]").count(), 6)
                self.assertEqual(self.page.locator('[data-route-accordion-trigger][aria-expanded="true"]').count(), 1)
        self.load("/learning-path/?stage=2")
        self.open()
        self.page.locator('[data-level-index="4"]').click()
        self.assertEqual(self.page.locator(".route-edge-number").inner_text(), "05")
        self.assertIn("stage=5", self.page.url)
        self.assertIn("AI Agent", self.page.locator("#path-course-area").inner_text())

    def test_mobile_touch_and_no_horizontal_overflow(self):
        self.context.close()
        self.context = self.browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        self.page = self.context.new_page()
        self.load()
        self.assertFalse(self.expanded())
        self.page.locator(".route-edge-trigger").tap()
        self.page.wait_for_timeout(340)
        self.assertTrue(self.expanded())
        self.page.wait_for_timeout(500)
        self.assertTrue(self.expanded(), "Touch users need a persistent panel while choosing a chapter")
        self.page.locator(".lesson-main").tap(position={"x": 340, "y": 50})
        self.page.wait_for_timeout(340)
        self.assertFalse(self.expanded())
        for width in [320, 390, 768, 1024, 1440, 1920]:
            self.page.set_viewport_size({"width": width, "height": 900})
            self.assertTrue(self.page.evaluate("document.documentElement.scrollWidth <= innerWidth"), str(width))


if __name__ == "__main__":
    unittest.main()
