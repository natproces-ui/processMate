from pathlib import Path
import json
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from processor.workflow_stream import WorkflowRowStream

DOC = {
    "title": "Ouverture de compte",
    "procedureMetadata": {"objet": "texte avec { accolades } et \"workflow\": [ piège"},
    "workflow": [
        {"id": "1", "étape": "Début", "typeBpmn": "StartEvent", "outputs": [{"targetId": "2", "label": ""}]},
        {"id": "2", "étape": "Vérifier { le dossier }", "typeBpmn": "Task", "outputs": [{"targetId": "3", "label": "ok ]"}]},
        {"id": "3", "étape": "Fin", "typeBpmn": "EndEvent", "outputs": []},
    ],
    "enrichments": [{"id_tache": "2", "descriptif": "{ \"workflow\": [ }"}],
}


class WorkflowRowStreamTests(unittest.TestCase):
    def collect(self, text, size):
        reader, rows = WorkflowRowStream(), []
        for i in range(0, len(text), size):
            rows += reader.feed(text[i:i + size])
        return rows

    def test_rows_arrive_complete_whatever_the_chunking(self):
        text = json.dumps(DOC, ensure_ascii=False, indent=2)
        for size in (1, 7, 64, len(text)):
            self.assertEqual(self.collect(text, size), DOC["workflow"], size)

    def test_row_is_sent_as_soon_as_it_is_closed(self):
        text = json.dumps(DOC, ensure_ascii=False)
        cut = text.index('{"id": "2"')
        reader = WorkflowRowStream()
        self.assertEqual([r["id"] for r in reader.feed(text[:cut])], ["1"])
        self.assertEqual([r["id"] for r in reader.feed(text[cut:])], ["2", "3"])

    def test_no_workflow_key_yields_nothing(self):
        self.assertEqual(self.collect('{"title": "x"}', 3), [])


if __name__ == "__main__":
    unittest.main()
