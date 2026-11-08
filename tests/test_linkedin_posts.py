import subprocess
import sys

from agents.search.scrapers.linkedin_posts import _pseudo_url


def test_pseudo_url_is_deterministic_and_whitespace_insensitive():
    a = _pseudo_url("phd", "Fully funded  PhD\nposition")
    assert a == _pseudo_url("phd", "Fully funded PhD position")
    assert a != _pseudo_url("phd", "Different post")


def test_pseudo_url_stable_across_processes():
    code = "from agents.search.scrapers.linkedin_posts import _pseudo_url as f;print(f('phd','hello'))"
    outs = {
        subprocess.check_output([sys.executable, "-c", code], text=True,
                                env={"PYTHONHASHSEED": seed, "PATH": ""}).strip()
        for seed in ("1", "2", "random")
    }
    assert len(outs) == 1
