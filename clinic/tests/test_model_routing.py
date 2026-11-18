"""Choix du modèle selon tâche × source × niveau (manager/model_routing.py). Module pur : pas de SDK."""
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from manager.model_routing import (  # noqa: E402
    TABLE, Profile, TaskKind, is_scanned_pdf, profile_for, resolve, routing_scope,
    current_routing, scrub_model_names, source_kinds_of,
)
from manager.processing_level import ProcessingLevel  # noqa: E402

KNOWN = {"PRO", "FLASH", "LITE", "VISION_FAST", "CODE_FAST"}


class RoutingTableTest(unittest.TestCase):
    def test_every_profile_and_level_has_a_chain(self):
        for profile in Profile:
            for level in ProcessingLevel:
                chain = TABLE[profile][level]
                self.assertTrue(chain, (profile, level))
                self.assertTrue(set(chain) <= KNOWN, chain)

    def test_fast_never_uses_pro(self):
        for profile in Profile:
            self.assertNotIn("PRO", TABLE[profile][ProcessingLevel.FAST])

    def test_routing_tasks_stay_cheap(self):
        for level in (ProcessingLevel.FAST, ProcessingLevel.NORMAL):
            self.assertEqual(resolve(TaskKind.AIGUILLAGE, ["image"], level)[0], "LITE")
        self.assertNotIn("PRO", resolve(TaskKind.AIGUILLAGE, ["pdf"], ProcessingLevel.DEEP))

    def test_deep_uses_pro_for_generation(self):
        self.assertEqual(resolve(TaskKind.GENERATION_PROCEDURE, ["pdf"], ProcessingLevel.DEEP)[0], "PRO")

    def test_mixed_sources_take_most_demanding(self):
        self.assertEqual(profile_for(TaskKind.GENERATION_PROCEDURE, ["pdf", "image"]), Profile.VISION)
        self.assertEqual(profile_for(TaskKind.GENERATION_PROCEDURE, ["docx", "texte"]), Profile.DOCUMENT)
        self.assertEqual(profile_for(TaskKind.GENERATION_PROCEDURE, []), Profile.TEXTE)
        self.assertEqual(profile_for(TaskKind.ANALYSE_CODE, ["pdf"]), Profile.CODE)

    def test_vision_fast_profile(self):
        self.assertEqual(resolve(TaskKind.EXTRACTION, ["image"], ProcessingLevel.FAST)[0], "VISION_FAST")

    def test_default_level_is_normal(self):
        self.assertEqual(resolve(TaskKind.GENERATION_PROCEDURE, ["pdf"]), TABLE[Profile.DOCUMENT][ProcessingLevel.NORMAL])


class ContextTest(unittest.TestCase):
    def test_scope_sets_and_resets(self):
        self.assertIsNone(current_routing())
        with routing_scope(TaskKind.RELECTURE_CRITIQUE, ["texte"]):
            self.assertEqual(current_routing(), (TaskKind.RELECTURE_CRITIQUE, ("texte",)))
        self.assertIsNone(current_routing())


class SourcesTest(unittest.TestCase):
    def test_scanned_pdf(self):
        self.assertTrue(is_scanned_pdf(b"%PDF /XObject /Subtype /Image"))
        self.assertFalse(is_scanned_pdf(b"%PDF /Font /F1 /Image"))
        self.assertFalse(is_scanned_pdf(b""))

    def test_source_kinds(self):
        files = [{"type": "pdf", "data": b"/Image"}, {"type": "docx"}, {"type": "image"}]
        self.assertEqual(source_kinds_of(files), ["pdf_scanne", "docx", "image"])
        self.assertEqual(source_kinds_of([]), ["texte"])


class NoModelNameLeakTest(unittest.TestCase):
    def test_scrub(self):
        msg = "404 models/gemini-3.8-flash is not found; try gemini-4-carbon"
        out = scrub_model_names(msg)
        self.assertNotIn("gemini", out.lower())

    def test_model_ids_only_in_config(self):
        """Aucun identifiant de modèle en dur dans le code du backend, hors config.py."""
        pattern = re.compile(r"""["'](gemini|gemma|imagen)-\d""")
        offenders = []
        skip_dirs = {".venv", "tests", "__pycache__", "test-proc", "sfd"}
        for path in ROOT.rglob("*.py"):
            if skip_dirs & set(path.relative_to(ROOT).parts) or path.name == "config.py":
                continue
            for i, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                if pattern.search(line):
                    offenders.append(f"{path.relative_to(ROOT)}:{i}")
        self.assertEqual(offenders, [], "Identifiants de modèles hors config.py")


if __name__ == "__main__":
    unittest.main()
