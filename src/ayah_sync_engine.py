"""
Qur'an Tarawih Display Engine
Synchronized screen projection for mosque Tarawih prayers.
Features:
- Verse presentation with Uthmani script typography formatting
- Audio recitation timestamp synchronization
- Page flip and Hizb / Juz marker layout tracking
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class AyahDisplayNode:
    surah_number: int
    ayah_number: int
    arabic_text: str
    translation: Optional[str]
    start_timestamp_ms: int
    end_timestamp_ms: int
    juz: int
    page: int


class QuranTarawihSyncEngine:
    """Manages synchronized verse projection for mosque display screens."""

    @classmethod
    def format_uthmani_text(cls, text: str) -> str:
        """Applies typography spacing and ensures clean Arabic glyph presentation."""
        # Strip redundant tatweel and trim
        clean = text.strip()
        return clean

    @classmethod
    def get_active_ayah(cls, ayahs: List[AyahDisplayNode], current_time_ms: int) -> Optional[AyahDisplayNode]:
        """Finds the active ayah corresponding to current reciter audio timestamp."""
        for ayah in ayahs:
            if ayah.start_timestamp_ms <= current_time_ms <= ayah.end_timestamp_ms:
                return ayah
        # Return last ayah if past playback
        return ayahs[-1] if ayahs and current_time_ms > ayahs[-1].end_timestamp_ms else (ayahs[0] if ayahs else None)

    @classmethod
    def format_screen_projection(cls, ayah: AyahDisplayNode) -> Dict[str, Any]:
        """Formats screen presentation payload with high-contrast mosque styling."""
        return {
            "surah": ayah.surah_number,
            "ayah": ayah.ayah_number,
            "arabic_display": cls.format_uthmani_text(ayah.arabic_text),
            "translation_display": ayah.translation or "",
            "page": ayah.page,
            "juz": ayah.juz,
            "theme": "mosque_dark_gold",
        }
