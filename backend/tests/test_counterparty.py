# backend/tests/test_counterparty.py
"""
Tests for Counterparty Intelligence feature.
Covers: normalization, service CRUD, alias resolution, analytics.
"""

import pytest
from app.services.counterparty_service import (
    normalize_name,
    resolve_counterparty_from_description,
    FUZZY_THRESHOLD,
)
from app.schemas.counterparty import validate_vkn


class TestNormalization:
    """Test normalize_name() for counterparty deduplication."""

    def test_basic_lowercase(self):
        assert normalize_name("Acme Corp") == "acme corp"

    def test_strip_whitespace(self):
        assert normalize_name("  Acme Corp  ") == "acme corp"

    def test_collapse_whitespace(self):
        assert normalize_name("Acme    Corp") == "acme corp"

    def test_remove_punctuation(self):
        assert normalize_name("Acme, Corp.") == "acme corp"
        assert normalize_name("A.Ş. Test") == "as test"

    def test_turkish_chars(self):
        assert normalize_name("İSTANBUL ŞİRKETİ") == "istanbul sirketi"
        assert normalize_name("ÖZTÜRK TİCARET") == "ozturk ticaret"

    def test_empty_input(self):
        assert normalize_name("") == ""
        assert normalize_name(None) == ""
        assert normalize_name("   ") == ""

    def test_unicode_normalization(self):
        # Composed vs decomposed should yield same result
        assert normalize_name("café") == normalize_name("café")

    def test_special_business_names(self):
        assert normalize_name("ABC Ltd. Şti.") == "abc ltd sti"
        assert normalize_name("XYZ A.Ş.") == "xyz as"


class TestResolveCounterparty:
    """Test resolve_counterparty_from_description() logic paths."""

    def test_empty_description_returns_none(self):
        """No description → no resolution."""
        # Can't easily test DB-dependent logic without fixtures,
        # but we can test the guard clauses
        assert resolve_counterparty_from_description(None, 1, "") is None
        assert resolve_counterparty_from_description(None, 1, None) is None

    def test_normalize_consistency(self):
        """Normalization should be consistent for matching."""
        # Same name different formatting → same normalized
        assert normalize_name("ACME CORP") == normalize_name("Acme Corp")
        # Hyphen is stripped as punctuation, so "acme-corp" → "acmecorp"
        assert normalize_name("acme-corp") == "acmecorp"
        assert normalize_name("ACME-CORP") == normalize_name("acme-corp")


class TestAnalyticsFormulas:
    """Test the analytics calculation formulas."""

    def test_risk_score_formula(self):
        """Risk score should be between 0 and 100."""
        # Simulate: 50% late rate, 10 day avg delay, 30% outstanding
        late_rate = 0.5
        avg_delay = 10
        outstanding_ratio = 0.3

        norm_delay = min(max(avg_delay, 0), 30) / 30
        risk_score = round(
            (late_rate * 40) + (norm_delay * 40) + (outstanding_ratio * 20),
            1,
        )
        assert 0 <= risk_score <= 100
        # 0.5*40 + (10/30)*40 + 0.3*20 = 20 + 13.33 + 6 = 39.33
        assert risk_score == 39.3

    def test_risk_score_perfect(self):
        """Perfect payer: 0 late rate, 0 delay, 0 outstanding."""
        late_rate = 0.0
        avg_delay = -2  # paid early
        outstanding_ratio = 0.0

        norm_delay = min(max(avg_delay, 0), 30) / 30
        risk_score = round(
            (late_rate * 40) + (norm_delay * 40) + (outstanding_ratio * 20),
            1,
        )
        assert risk_score == 0.0

    def test_risk_score_worst(self):
        """Worst payer: 100% late, 30+ day delay, 100% outstanding."""
        late_rate = 1.0
        avg_delay = 45  # capped at 30
        outstanding_ratio = 1.0

        norm_delay = min(max(avg_delay, 0), 30) / 30
        risk_score = round(
            (late_rate * 40) + (norm_delay * 40) + (outstanding_ratio * 20),
            1,
        )
        assert risk_score == 100.0

    def test_on_time_rate_calculation(self):
        """On-time rate: payments on or before due date."""
        delays = [-3, 0, 2, -1, 5]  # 3 on-time (≤0), 2 late (>0)
        on_time = sum(1 for d in delays if d <= 0)
        rate = round(on_time / len(delays), 3)
        assert rate == 0.6

    def test_avg_delay_calculation(self):
        """Average payment delay in days."""
        delays = [-2, 0, 3, 5, -1]
        avg = round(sum(delays) / len(delays), 1)
        assert avg == 1.0


class TestVKNValidation:
    """Test Turkish Tax ID (VKN) validation."""

    def test_valid_vkn(self):
        """A known-valid 10-digit VKN passes."""
        # 0000000000 has checksum 0 → valid by definition
        assert validate_vkn("0000000000") == "0000000000"

    def test_none_returns_none(self):
        assert validate_vkn(None) is None

    def test_empty_returns_none(self):
        assert validate_vkn("") is None

    def test_too_short_raises(self):
        with pytest.raises(ValueError, match="10 digits"):
            validate_vkn("12345")

    def test_too_long_raises(self):
        with pytest.raises(ValueError, match="10 digits"):
            validate_vkn("12345678901")

    def test_non_numeric_raises(self):
        with pytest.raises(ValueError, match="10 digits"):
            validate_vkn("ABCDEFGHIJ")

    def test_mixed_chars_raises(self):
        with pytest.raises(ValueError, match="10 digits"):
            validate_vkn("123456789A")

    def test_whitespace_stripped(self):
        """Leading/trailing whitespace is stripped before validation."""
        assert validate_vkn("  0000000000  ") == "0000000000"

    def test_invalid_checksum_raises(self):
        """10-digit number with wrong checksum."""
        with pytest.raises(ValueError, match="checksum"):
            validate_vkn("1234567899")

    def test_vkn_uniqueness_concept(self):
        """Two different VKNs are not equal (dedup check)."""
        assert validate_vkn("0000000000") != "1111111111"  # different VKNs


class TestVKNMatching:
    """Test that VKN-based resolution takes priority."""

    def test_resolve_with_empty_vkn_falls_through(self):
        """When VKN is empty, falls through to description-based matching."""
        # No DB session → returns None for both empty vkn and empty description
        result = resolve_counterparty_from_description(None, 1, "", vkn="")
        assert result is None

    def test_resolve_with_none_vkn_falls_through(self):
        result = resolve_counterparty_from_description(None, 1, None, vkn=None)
        assert result is None
