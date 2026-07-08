#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import torch

from model import build_model

INPUT_SIZE = 300
NUM_CLASSES = 2


def export_onnx(checkpoint: Path, output: Path) -> None:
    ckpt = torch.load(checkpoint, map_location="cpu", weights_only=False)
    num_classes = int(ckpt.get("config", {}).get("num_classes", NUM_CLASSES))
    model = build_model(num_classes=num_classes, pretrained=False)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    dummy = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)
    torch.onnx.export(
        model,
        dummy,
        str(output),
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )
    print(f"Exported ONNX: {output} ({output.stat().st_size / 1e6:.1f} MB)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default="../models/liver_efficientnet_b3_best.pth")
    parser.add_argument("--output", default="../models/liver_efficientnet_b3.onnx")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    export_onnx(root / args.checkpoint, root / args.output)


if __name__ == "__main__":
    main()
