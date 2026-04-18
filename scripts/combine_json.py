import json

files = [
    "articles.json",
    "photos.json",
    "events.json"
]

combined_data = []

for file in files:
    with open(file, "r") as f:
        data = json.load(f)
        combined_data.extend(data)

with open("combined_dataset.json", "w") as f:
    json.dump(combined_data, f, indent=2)

print("Combined dataset size:", len(combined_data))