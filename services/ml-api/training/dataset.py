from __future__ import annotations

from pathlib import Path

import pandas as pd
import torch
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms

INPUT_SIZE = 300

train_transform = transforms.Compose(
    [
        transforms.Resize((INPUT_SIZE + 32, INPUT_SIZE + 32)),
        transforms.RandomCrop((INPUT_SIZE, INPUT_SIZE)),
        transforms.RandomHorizontalFlip(p=0.3),
        transforms.ColorJitter(brightness=0.15, contrast=0.15),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)

val_transform = transforms.Compose(
    [
        transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)


def load_us_image(path: str) -> Image.Image:
    return Image.open(path).convert("L").convert("RGB")


class LiverUSDataset(Dataset):
    def __init__(self, csv_path: str | Path, transform=None):
        self.df = pd.read_csv(csv_path)
        self.transform = transform or val_transform

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int):
        row = self.df.iloc[idx]
        image = load_us_image(row["file_path"])
        if self.transform:
            image = self.transform(image)
        label = int(row["class_id"])
        return image, torch.tensor(label, dtype=torch.long)
