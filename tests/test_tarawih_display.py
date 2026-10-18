import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))
from ayah_sync_engine import QuranTarawihSyncEngine, AyahDisplayNode


class TestQuranTarawihSync(unittest.TestCase):
    def setUp(self):
        self.sample_ayahs = [
            AyahDisplayNode(
                surah_number=1,
                ayah_number=1,
                arabic_text="بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
                translation="In the name of Allah, the Entirely Merciful, the Especially Merciful.",
                start_timestamp_ms=0,
                end_timestamp_ms=4500,
                juz=1,
                page=1,
            ),
            AyahDisplayNode(
                surah_number=1,
                ayah_number=2,
                arabic_text="الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
                translation="[All] praise is [due] to Allah, Lord of the worlds -",
                start_timestamp_ms=4501,
                end_timestamp_ms=9000,
                juz=1,
                page=1,
            ),
        ]

    def test_sync_engine_finds_correct_ayah(self):
        active = QuranTarawihSyncEngine.get_active_ayah(self.sample_ayahs, current_time_ms=2000)
        self.assertIsNotNone(active)
        self.assertEqual(active.ayah_number, 1)

        active2 = QuranTarawihSyncEngine.get_active_ayah(self.sample_ayahs, current_time_ms=6000)
        self.assertIsNotNone(active2)
        self.assertEqual(active2.ayah_number, 2)

    def test_format_screen_projection(self):
        proj = QuranTarawihSyncEngine.format_screen_projection(self.sample_ayahs[0])
        self.assertEqual(proj["surah"], 1)
        self.assertEqual(proj["theme"], "mosque_dark_gold")
        self.assertIn("بِسْمِ", proj["arabic_display"])


if __name__ == "__main__":
    unittest.main()
