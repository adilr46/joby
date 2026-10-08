"""
The structured features the shared PCI network may see — and the ones it may never see.

The shared network learns population patterns. A person's identity must not be an input, and nor
may anything that is a de facto identifier for one person, one application or one lens: a
`representation_id` is one person's lens, so it is as identifying as `person_id` itself. The
network sees *categories* (a representation **track**, a role domain), never instances.

Vocabularies are fixed and explicit rather than adapted from data. Adapting a vocabulary from
training rows would let any free-text value a caller passes become its own embedding row — a
memorised individual rather than a learned category. Unknown values fall into one OOV bucket.

Every feature must be knowable **before** the outcome it predicts. Edit counts, progression
stages and anything else observed after the application was sent are labels, not features.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

import numpy as np

NUMERIC_INPUT = "numeric"

# Normalised (lower-case, separators removed) names that may never be shared-network inputs.
_FORBIDDEN_IDENTIFIER = re.compile(r"(person|user|people|application|representation|opportunity|candidate|account)id$")


def _normalise(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def assert_identity_free(name: str) -> None:
    if _FORBIDDEN_IDENTIFIER.search(_normalise(name)):
        raise ValueError(
            f"'{name}' identifies a person, application, opportunity or lens and cannot be a shared-network "
            "feature (ADR 0040 privacy boundary). Use a category (e.g. representation_track) instead."
        )


@dataclass(frozen=True)
class CategoricalFeature:
    name: str
    vocabulary: tuple[str, ...]
    embedding_dim: int | None = None

    @property
    def dim(self) -> int:
        if self.embedding_dim is not None:
            return self.embedding_dim
        # Common heuristic: grows sub-linearly with cardinality, capped small — these are coarse categories.
        return min(16, max(2, round(1.6 * (len(self.vocabulary) + 1) ** 0.56)))


@dataclass(frozen=True)
class NumericFeature:
    """A numeric feature already expressed on [0, 1] (a coverage, a fit ratio). Missing is explicit, not imputed."""

    name: str


@dataclass(frozen=True)
class FeatureSpec:
    categorical: tuple[CategoricalFeature, ...]
    numeric: tuple[NumericFeature, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        names = [f.name for f in self.categorical] + [f.name for f in self.numeric]
        if len(set(names)) != len(names):
            raise ValueError(f"duplicate feature names in {names}")
        if NUMERIC_INPUT in names:
            raise ValueError(f"'{NUMERIC_INPUT}' is reserved for the packed numeric input")
        for name in names:
            assert_identity_free(name)
        for f in self.categorical:
            if not f.vocabulary or len(set(f.vocabulary)) != len(f.vocabulary):
                raise ValueError(f"categorical feature '{f.name}' needs a non-empty, duplicate-free vocabulary")

    @property
    def numeric_width(self) -> int:
        # value + missing indicator per numeric feature
        return 2 * len(self.numeric)

    def input_names(self) -> tuple[str, ...]:
        return tuple(f.name for f in self.categorical) + ((NUMERIC_INPUT,) if self.numeric else ())


# Provisional. No TypeScript-side extractor produces these yet; Opportunity understanding is still
# mostly free text (role, capabilities, conditions). The categories below are the ADR 0040 pattern
# dimensions made concrete so the network can be built and tested; the real vocabularies are decided
# alongside the extractor, not here.
DEFAULT_FEATURE_SPEC = FeatureSpec(
    categorical=(
        CategoricalFeature(
            "representation_track",
            ("software-engineering", "data", "product", "markets", "finance", "consulting", "design", "research", "other"),
        ),
        CategoricalFeature(
            "role_domain",
            ("software-engineering", "data", "product-management", "finance", "consulting", "design", "research", "other"),
        ),
        CategoricalFeature("seniority_tier", ("internship", "early-career", "mid", "senior")),
        CategoricalFeature(
            "industry_segment",
            ("technology", "financial-services", "consulting", "public-sector", "healthcare", "other"),
        ),
        CategoricalFeature("work_arrangement", ("onsite", "hybrid", "remote")),
        CategoricalFeature("application_channel", ("joby_executed", "manual_external")),
    ),
    numeric=(
        NumericFeature("required_capability_coverage"),
        NumericFeature("preferred_capability_coverage"),
    ),
)


def encode(rows: Sequence[Mapping[str, Any]], spec: FeatureSpec) -> dict[str, np.ndarray]:
    """
    Turn feature rows into model inputs. Reads only the spec's features: anything else a row carries
    (a person_id used to group residual evidence, labels) is invisible to the network by construction.
    """
    encoded: dict[str, np.ndarray] = {}
    for f in spec.categorical:
        encoded[f.name] = np.array([[_category(row.get(f.name))] for row in rows], dtype=object)
    if spec.numeric:
        packed = np.zeros((len(rows), spec.numeric_width), dtype=np.float32)
        for i, row in enumerate(rows):
            for j, f in enumerate(spec.numeric):
                value = row.get(f.name)
                if value is None or (isinstance(value, float) and math.isnan(value)):
                    packed[i, 2 * j + 1] = 1.0
                else:
                    packed[i, 2 * j] = float(np.clip(value, 0.0, 1.0))
        encoded[NUMERIC_INPUT] = packed
    return encoded


def _category(value: Any) -> str:
    # Absent → empty string → OOV bucket. Never a guessed category.
    return "" if value is None else str(value)
