import json

TOPICS = {
    "ukraine": "security",
    "middle east": "security",
    "climate": "climate",
    "education": "education",
    "health": "health",
    "racism": "human rights",
    "slavery": "human rights"
}

def detect_topic(text):

    text = text.lower()

    for word in TOPICS:
        if word in text:
            return TOPICS[word]

    return "general"


with open("combined_dataset.json") as f:
    data = json.load(f)

for item in data:

    text = ""

    if "headline" in item:
        text += item["headline"]

    if "caption_description" in item:
        text += item["caption_description"]

    if "content" in item:
        text += item["content"]

    item["topic"] = detect_topic(text)


with open("organized_dataset.json", "w") as f:
    json.dump(data, f, indent=2)

print("Done categorizing.")