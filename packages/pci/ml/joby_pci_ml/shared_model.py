"""
The shared prior: f_θ(x), a small multi-task network over identity-free structured features.

    categorical embeddings + numeric features → shared MLP → { user_response, world_response }

Both heads emit **logits**, not probabilities, because the personal residual (`residual.py`) is
additive on the logit scale: personal(u, x) = f_θ(x)[head] + r_u[head](x).

The heads stay separate on purpose (ADR 0030): `user preference ≠ external effectiveness`. They
share a representation of the situation — that is what multi-task learning buys with sparse
labels — but each has its own output layer, its own label, and its own mask. An application with
no user-response trial contributes nothing to the user head (zero loss, zero gradient), rather
than an invented negative.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

import keras
import numpy as np
from keras import layers

from .features import NUMERIC_INPUT, FeatureSpec, encode

USER_HEAD = "user_response"
WORLD_HEAD = "world_response"
HEADS = (USER_HEAD, WORLD_HEAD)


@keras.saving.register_keras_serializable(package="joby_pci")
def masked_binary_crossentropy(y_true, y_pred):
    """
    y_true is [label, mask] per row. Rows whose mask is 0 have no trial for this head: they add
    zero loss and therefore zero gradient to the head's own weights.
    """
    label = y_true[:, 0:1]
    mask = y_true[:, 1:2]
    per_row = keras.ops.binary_crossentropy(label, y_pred, from_logits=True)
    return keras.ops.squeeze(mask * per_row, axis=-1)


def build_shared_model(
    spec: FeatureSpec,
    hidden_units: Sequence[int] = (64, 32),
    dropout: float = 0.1,
    l2: float = 1e-4,
    seed: int = 0,
) -> keras.Model:
    keras.utils.set_random_seed(seed)
    regulariser = keras.regularizers.L2(l2)

    inputs: dict[str, keras.KerasTensor] = {}
    parts: list[keras.KerasTensor] = []
    for f in spec.categorical:
        raw = keras.Input(shape=(1,), dtype="string", name=f.name)
        inputs[f.name] = raw
        ids = layers.StringLookup(vocabulary=list(f.vocabulary), num_oov_indices=1, name=f"{f.name}_lookup")(raw)
        embedded = layers.Embedding(
            input_dim=len(f.vocabulary) + 1,
            output_dim=f.dim,
            embeddings_regularizer=regulariser,
            name=f"{f.name}_embedding",
        )(ids)
        parts.append(layers.Flatten(name=f"{f.name}_flat")(embedded))
    if spec.numeric:
        numeric = keras.Input(shape=(spec.numeric_width,), dtype="float32", name=NUMERIC_INPUT)
        inputs[NUMERIC_INPUT] = numeric
        parts.append(numeric)

    h = layers.Concatenate(name="features")(parts) if len(parts) > 1 else parts[0]
    for i, units in enumerate(hidden_units):
        h = layers.Dense(units, activation="relu", kernel_regularizer=regulariser, name=f"shared_dense_{i}")(h)
        if dropout:
            h = layers.Dropout(dropout, name=f"shared_dropout_{i}")(h)

    outputs = {head: layers.Dense(1, name=head)(h) for head in HEADS}
    return keras.Model(inputs=inputs, outputs=outputs, name="pci_shared_prior")


def compile_shared_model(model: keras.Model, learning_rate: float = 1e-3) -> keras.Model:
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate),
        loss={head: masked_binary_crossentropy for head in HEADS},
    )
    return model


def targets(rows: Sequence[Mapping[str, Any]]) -> dict[str, np.ndarray]:
    """Per head, [label, mask]. A row lacking a head's label (None / absent) is masked, not negative."""
    out: dict[str, np.ndarray] = {}
    for head in HEADS:
        packed = np.zeros((len(rows), 2), dtype=np.float32)
        for i, row in enumerate(rows):
            label = row.get(head)
            if label is not None:
                packed[i] = (float(bool(label)), 1.0)
        out[head] = packed
    return out


def train_shared_model(
    model: keras.Model,
    spec: FeatureSpec,
    rows: Sequence[Mapping[str, Any]],
    *,
    epochs: int = 20,
    batch_size: int = 128,
    validation_rows: Sequence[Mapping[str, Any]] | None = None,
    verbose: int = 0,
) -> keras.callbacks.History:
    validation = (encode(validation_rows, spec), targets(validation_rows)) if validation_rows else None
    return model.fit(
        encode(rows, spec),
        targets(rows),
        epochs=epochs,
        batch_size=batch_size,
        validation_data=validation,
        shuffle=True,
        verbose=verbose,
    )


def shared_logits(model: keras.Model, spec: FeatureSpec, rows: Sequence[Mapping[str, Any]]) -> dict[str, np.ndarray]:
    """f_θ(x) per head as flat logit arrays. Inference mode — dropout off."""
    if not rows:
        return {head: np.zeros(0) for head in HEADS}
    predicted = model(encode(rows, spec), training=False)
    return {head: np.asarray(predicted[head], dtype=np.float64).reshape(-1) for head in HEADS}


def load_shared_model(path: str) -> keras.Model:
    return keras.models.load_model(path, compile=False)
