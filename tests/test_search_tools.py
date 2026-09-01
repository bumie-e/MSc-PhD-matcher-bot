from agents.search import tools


def test_collect_global_keywords_dedupes_and_sorts():
    user_rows = [
        {"field_of_study": "Machine Learning", "keywords": ["nlp", "federated learning"]},
        {"field_of_study": "machine learning", "keywords": ["nlp"]},
    ]
    result = tools.collect_global_keywords(user_rows)
    assert result == sorted(set(result))
    assert "nlp" in result
    assert "Machine Learning" in result


def test_tool_schemas_reference_dispatchable_functions():
    names = {schema["function"]["name"] for schema in tools.TOOL_SCHEMAS}
    for name in names:
        # dispatch_tool_call must recognize every declared tool
        try:
            tools.dispatch_tool_call(name, {"keywords": []})
        except ValueError:
            raise AssertionError(f"{name} is declared but not dispatchable")
        except Exception:
            pass  # network/db errors are fine here, we're only checking dispatch routing
