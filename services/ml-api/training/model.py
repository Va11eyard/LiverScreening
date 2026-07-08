from __future__ import annotations

import torch
import torch.nn as nn
import timm


def build_model(num_classes: int = 4, pretrained: bool = True) -> nn.Module:
    return timm.create_model(
        "efficientnet_b3",
        pretrained=pretrained,
        num_classes=num_classes,
        in_chans=3,
    )


def get_loss_function(class_weights: torch.Tensor | None = None) -> nn.Module:
    return nn.CrossEntropyLoss(weight=class_weights)


def get_optimizer(model: nn.Module, lr: float = 1e-3, weight_decay: float = 1e-4):
    backbone_params = []
    head_params = []
    for name, param in model.named_parameters():
        if "classifier" in name or "head" in name or "fc" in name:
            head_params.append(param)
        else:
            backbone_params.append(param)
    return torch.optim.AdamW(
        [
            {"params": backbone_params, "lr": lr * 0.1},
            {"params": head_params, "lr": lr},
        ],
        weight_decay=weight_decay,
    )
