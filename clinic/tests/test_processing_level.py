"""Tests locaux des niveaux Studio, sans requêtes Gemini ni accès à la base."""
import ast
import asyncio
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import httpx
from google.genai import errors
from manager.processing_level import ProcessingLevel, get_processing_level, processing_level_scope
from manager.model_manager import ModelRetryStrategy, GeminiModel, get_models_for_request, get_primary_model


class ProcessingLevelTests(unittest.IsolatedAsyncioTestCase):
    async def test_each_level_uses_its_model(self):
        expected = {
            ProcessingLevel.FAST: GeminiModel.FLASH_LITE,
            ProcessingLevel.NORMAL: GeminiModel.BALANCED,
            ProcessingLevel.DEEP: GeminiModel.FLASH,
        }
        for level, model in expected.items():
            async def task(name):
                return name
            with processing_level_scope(level):
                result = await ModelRetryStrategy().execute_with_retry(task)
                self.assertTrue(result["success"])
                self.assertEqual(result["model_used"], model.value)
        self.assertIsNone(get_processing_level())

    async def test_no_header_preserves_existing_order_and_direct_calls(self):
        self.assertEqual(get_models_for_request(), list(dict.fromkeys([
            GeminiModel.FLASH_LITE, GeminiModel.FLASH,
        ])))
        self.assertEqual(get_primary_model("existing-model"), "existing-model")

    async def test_sdk_retryable_errors_use_fallback(self):
        failures = [
            errors.ClientError(429, {"error": {"message": "quota"}}),
            errors.ClientError(404, {"error": {"message": "missing"}}),
            errors.ServerError(503, {"error": {"message": "unavailable"}}),
            TimeoutError("timeout"),
        ]
        for level in ProcessingLevel:
            for failure in failures:
                called = []
                async def task(name):
                    called.append(name)
                    if len(called) == 1:
                        raise failure
                    return "ok"
                with processing_level_scope(level):
                    models = get_models_for_request()
                    result = await ModelRetryStrategy().execute_with_retry(task)
                    self.assertTrue(result["success"])
                    self.assertEqual(called, [m.value for m in models])
                    self.assertEqual(result["model_used"], models[-1].value)

    async def test_exhausted_quota_returns_failure(self):
        async def task(name):
            raise errors.ClientError(429, {"error": {"message": "quota"}})
        with processing_level_scope(ProcessingLevel.NORMAL):
            result = await ModelRetryStrategy().execute_with_retry(task)
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "quota_exhausted")

    async def test_non_retryable_error_stops(self):
        called = []
        async def task(name):
            called.append(name)
            raise errors.ClientError(400, {"error": {"message": "invalid"}})
        with processing_level_scope(ProcessingLevel.FAST):
            result = await ModelRetryStrategy().execute_with_retry(task)
        self.assertEqual(len(called), 1)
        self.assertEqual(result["error"], "client_error")

    async def test_context_restored_after_exception(self):
        with processing_level_scope(ProcessingLevel.NORMAL):
            try:
                with processing_level_scope(ProcessingLevel.DEEP):
                    raise RuntimeError("test")
            except RuntimeError:
                pass
            self.assertEqual(get_processing_level(), ProcessingLevel.NORMAL)
        self.assertIsNone(get_processing_level())

    async def test_http_header_validation_and_concurrent_isolation(self):
        app = FastAPI()
        # Charger le vrai middleware sans lancer l'application et ses dépendances métier.
        main_path = Path(__file__).resolve().parents[1] / "main.py"
        tree = ast.parse(main_path.read_text(encoding="utf-8"))
        middleware = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef)
                          and n.name == "studio_processing_level")
        namespace = {"app": app, "ProcessingLevel": ProcessingLevel,
                     "processing_level_scope": processing_level_scope,
                     "JSONResponse": JSONResponse}
        exec(compile(ast.Module(body=[middleware], type_ignores=[]), str(main_path), "exec"), namespace)

        @app.get("/test")
        async def route():
            before = get_primary_model("existing-model")
            await asyncio.sleep(0.01)
            threaded = await asyncio.to_thread(get_primary_model, "existing-model")
            return {"before": before, "after": get_primary_model("existing-model"), "threaded": threaded}

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            responses = await asyncio.gather(*[
                client.get("/test", headers={"X-Processing-Level": level.value})
                for level in ProcessingLevel
            ], client.get("/test"))
            expected = [GeminiModel.FLASH_LITE.value, GeminiModel.BALANCED.value,
                        GeminiModel.FLASH.value, "existing-model"]
            for response, model in zip(responses, expected):
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {"before": model, "after": model, "threaded": model})
            invalid = await client.get("/test", headers={"X-Processing-Level": "unsupported"})
            self.assertEqual(invalid.status_code, 422)
            self.assertEqual((await client.get("/test")).json()["before"], "existing-model")
        self.assertIsNone(get_processing_level())

    async def test_changed_python_files_parse(self):
        clinic = Path(__file__).resolve().parents[1]
        for relative in ["main.py", "manager/model_manager.py", "manager/processing_level.py", "routers/stt.py", "flowcharts/flowchart_generator.py"]:
            ast.parse((clinic / relative).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
