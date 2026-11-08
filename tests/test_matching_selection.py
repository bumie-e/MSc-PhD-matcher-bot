from datetime import date

from agents.matching.tools import select_opportunities_for_user

TODAY = date(2026, 6, 1)


def opp(id, type="phd", deadline=None, created="2026-05-01T00:00:00Z"):
    return {"id": id, "type": type, "deadline": deadline, "created_at": created}


def ids(result):
    return [o["id"] for o in result]


def test_skips_already_scored_unless_rescoring():
    opps = [opp("a"), opp("b")]
    assert ids(select_opportunities_for_user(opps, {}, {"a"}, 10, TODAY)) == ["b"]
    assert sorted(ids(select_opportunities_for_user(opps, {}, {"a"}, 10, TODAY, rescore=True))) == ["a", "b"]


def test_skips_past_deadlines_and_wrong_degree():
    opps = [opp("past", deadline="2026-05-01"), opp("msc", type="msc"), opp("ok", deadline="2026-07-01")]
    result = select_opportunities_for_user(opps, {"degree_type": "phd"}, set(), 10, TODAY)
    assert ids(result) == ["ok"]


def test_both_degree_types_allowed_when_user_wants_both():
    opps = [opp("p", type="phd"), opp("m", type="msc")]
    assert len(select_opportunities_for_user(opps, {"degree_type": "both"}, set(), 10, TODAY)) == 2


def test_orders_by_deadline_then_unknown_newest_first_and_caps():
    opps = [
        opp("later", deadline="2026-09-01"),
        opp("unknown_old", created="2026-01-01T00:00:00Z"),
        opp("soon", deadline="2026-06-10"),
        opp("unknown_new", created="2026-05-20T00:00:00Z"),
    ]
    full = ids(select_opportunities_for_user(opps, {}, set(), 10, TODAY))
    assert full == ["soon", "later", "unknown_new", "unknown_old"]
    assert ids(select_opportunities_for_user(opps, {}, set(), 2, TODAY)) == ["soon", "later"]


def test_malformed_deadline_is_treated_as_unknown():
    assert ids(select_opportunities_for_user([opp("x", deadline="soon-ish")], {}, set(), 10, TODAY)) == ["x"]
