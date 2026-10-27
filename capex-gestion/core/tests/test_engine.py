import datetime as dt
from decimal import Decimal as D

from django.test import SimpleTestCase

from core.services.engine import Terms, TermsError, accrued_interest, add_months, allocate, build_schedule, compute_penalty


def terms(**kw):
    base = dict(principal=D("100000"), start_date=dt.date(2026, 1, 2), term_months=12, rate_type="TNM",
                rate_value=D("2.9"), interest_method="SIMPLE", day_base=360, day_count="ACTUAL",
                periodicity="MONTHLY", amortization="BULLET")
    base.update(kw)
    return Terms(**base)


class ScheduleTests(SimpleTestCase):
    def test_add_months_end_of_month(self):
        self.assertEqual(add_months(dt.date(2026, 1, 31), 1), dt.date(2026, 2, 28))
        self.assertEqual(add_months(dt.date(2026, 1, 15), 13, 30), dt.date(2027, 2, 28))

    def test_bullet_tnm_act360_like_contract(self):
        rows = build_schedule(terms())
        self.assertEqual(len(rows), 12)
        self.assertEqual(rows[0].days, 31)
        # 100,000 × 2.9% × 12 × 31/360
        self.assertEqual(rows[0].interest, D("2996.67"))
        self.assertEqual(rows[1].days, 28)
        self.assertEqual(rows[1].interest, D("2706.67"))
        self.assertTrue(all(r.capital == 0 for r in rows[:-1]))
        self.assertEqual(rows[-1].capital, D("100000.00"))
        self.assertEqual(rows[-1].closing_balance, 0)

    def test_french_compound_tea(self):
        t = terms(principal=D("10000"), rate_type="TEA", rate_value=D("12"), interest_method="COMPOUND",
                  day_count="PERIOD", amortization="FRENCH")
        rows = build_schedule(t)
        self.assertEqual(sum(r.capital for r in rows), D("10000.00"))
        self.assertEqual(rows[-1].closing_balance, 0)
        i = (D("1.12") ** (D(30) / D(360))) - 1
        expected = (D("10000") * i / (1 - (1 + i) ** -12)).quantize(D("0.01"))
        self.assertEqual(rows[0].total, expected)
        self.assertLessEqual(abs(rows[-1].total - expected), D("0.05"))

    def test_german(self):
        rows = build_schedule(terms(principal=D("1200"), amortization="GERMAN", day_count="PERIOD"))
        self.assertTrue(all(r.capital == D("100.00") for r in rows))
        self.assertGreater(rows[0].interest, rows[-1].interest)

    def test_grace_total_capitalizes(self):
        rows = build_schedule(terms(principal=D("1000"), amortization="GERMAN", day_count="PERIOD", grace_periods=2, grace_type="TOTAL"))
        self.assertEqual(rows[0].total, 0)
        self.assertGreater(rows[0].capitalized_interest, 0)
        self.assertGreater(sum(r.capital for r in rows), D("1000"))
        self.assertEqual(rows[-1].closing_balance, 0)

    def test_quarterly_and_validation(self):
        self.assertEqual(len(build_schedule(terms(periodicity="QUARTERLY"))), 4)
        with self.assertRaises(TermsError):
            build_schedule(terms(term_months=10, periodicity="QUARTERLY"))
        with self.assertRaises(TermsError):
            build_schedule(terms(periodicity="AT_MATURITY", amortization="FRENCH"))

    def test_formula_lines_mention_values(self):
        text = " ".join(terms().formula_lines())
        self.assertIn("TNM × 12", text)
        self.assertIn("34.8000%", text)

    def test_accrual_mid_period(self):
        rows = build_schedule(terms())
        self.assertEqual(accrued_interest(rows, dt.date(2026, 2, 2)), D("2996.67"))
        half = accrued_interest(rows, dt.date(2026, 1, 17))
        self.assertEqual(half, (D("2996.67") * 15 / 31).quantize(D("0.01")))


class PenaltyTests(SimpleTestCase):
    due = dt.date(2026, 3, 1)

    def test_daily_percent_with_partial_payment(self):
        base = {"CAPITAL": D("0"), "INTEREST": D("1000")}
        events = [(dt.date(2026, 3, 6), "INTEREST", D("600"))]
        r = compute_penalty("DAILY_PERCENT", D("0.1"), "INSTALLMENT", 0, 360, self.due, base, events, dt.date(2026, 3, 11))
        # 1000 × 0.1% × 5 días (2-6 mar) + 400 × 0.1% × 5 días (7-11 mar)
        self.assertEqual(r.amount, D("7.00"))
        self.assertEqual(r.days_late, 10)

    def test_grace_days_and_stop_when_paid(self):
        base = {"CAPITAL": D("0"), "INTEREST": D("1000")}
        r = compute_penalty("DAILY_FIXED", D("10"), "INSTALLMENT", 3, 360, self.due, base,
                            [(dt.date(2026, 3, 10), "INTEREST", D("1000"))], dt.date(2026, 4, 1))
        self.assertEqual(r.days_late, 9)
        self.assertEqual(r.amount, D("60.00"))  # días 5 al 10
        none = compute_penalty("FIXED", D("50"), "INSTALLMENT", 3, 360, self.due, base, [], dt.date(2026, 3, 4))
        self.assertEqual(none.amount, 0)

    def test_percent_and_moratory(self):
        base = {"CAPITAL": D("10000"), "INTEREST": D("0")}
        p = compute_penalty("PERCENT", D("5"), "CAPITAL", 0, 360, self.due, base, [], dt.date(2026, 3, 5))
        self.assertEqual(p.amount, D("500.00"))
        m = compute_penalty("MORATORY", D("36"), "CAPITAL", 0, 360, self.due, base, [], dt.date(2026, 3, 31))
        self.assertEqual(m.amount, D("300.00"))


class AllocateTests(SimpleTestCase):
    def test_oldest_first_and_order(self):
        buckets = [(1, "CAPITAL", D("100")), (1, "INTEREST", D("10")), (1, "PENALTY", D("5")), (2, "INTEREST", D("10"))]
        res, left = allocate(D("120"), buckets, ["PENALTY", "INTEREST", "CAPITAL"])
        self.assertEqual(res[:2], [(1, "PENALTY", D("5")), (1, "INTEREST", D("10"))])
        self.assertEqual(res[2], (1, "CAPITAL", D("100")))
        self.assertEqual(res[3], (2, "INTEREST", D("5")))
        self.assertEqual(left, 0)
